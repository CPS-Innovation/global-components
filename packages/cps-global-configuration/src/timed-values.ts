// TIMED VALUES — a top-level config setting that switches by itself at a given
// moment, so "change X at 09:00 on the 8th" is a deploy-and-forget config edit
// rather than a 09:00 deploy:
//
//   "REPORT_ISSUE_LINK": {
//     "value": "https://new.example/report",
//     "until 2026-10-08T09:00:00+01:00": "https://old.example/report"
//   }
//
// `value` is the setting from the switch onwards; each "until <moment>" key is the
// setting up to that moment. Several "until" keys make a sequence, each applying
// from the previous moment up to its own. Written this way round deliberately:
// once the moment has passed the "until" key is inert, so the thing that looks
// disposable is the thing that IS disposable — nobody tidies away the future.
// (validate.ts fails the build once an "until" moment is in the past, to make
// sure the dead key does get tidied.)
//
// A step value of null means "setting absent", so a setting can be introduced
// (or withdrawn) at a moment too.
//
// Resolved on every config load — in the browser, against the browser's clock —
// so the switch takes effect at the first page load after the moment. Top-level
// settings only; nested wrappers are not recognised and fail schema validation.
//
// Moments MUST carry an explicit offset (or Z): without one, browsers (UK time)
// and CI (UTC) would switch an hour apart. validate.ts additionally checks the
// offset is the one the UK is actually on at that moment, catching a "+00:00" or
// "Z" written against a BST date.

const UNTIL_PREFIX = "until";
const UNTIL_KEY_REGEX = /^until (.+)$/;
const ISO_WITH_OFFSET_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

// Settings read straight from the raw JSON by tooling that never resolves timed
// values, so a wrapper on them would be seen as an object rather than a value:
//   - CSP derivation / check targets (derive-csp.ts, derive-check-targets.ts)
//     read these at build time; a timed value would need the CSP to cover every
//     step, which is not implemented.
//   - REDIRECT_SCRIPT_URL is jq'd out of config.json by the deploy workflow.
//   - ENVIRONMENT is checked against the config filename and names the env.
export const SETTINGS_THAT_CANNOT_BE_TIMED = [
  "ENVIRONMENT",
  "REDIRECT_SCRIPT_URL",
  "APP_INSIGHTS_CONNECTION_STRING",
  "CASE_LOCKING_API_URL",
  "AD_TENANT_AUTHORITY",
  "OS_HANDOVER_URL",
  "LINKS",
];

type TimedStep = {
  moment: Date;
  momentText: string;
  value: unknown;
};

type TimedValue = {
  value: unknown;
  // Ascending by moment.
  steps: TimedStep[];
};

const isPlainObject = (candidate: unknown): candidate is Record<string, unknown> =>
  typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);

// Any "until…" key marks the object as a timed value, so a malformed one
// (missing "value", bad moment) is an error rather than silently passing through
// as a plain object.
const isTimedValue = (candidate: unknown): candidate is Record<string, unknown> =>
  isPlainObject(candidate) && Object.keys(candidate).some(key => key.startsWith(UNTIL_PREFIX));

const parseStep = (setting: string, key: string, value: unknown): TimedStep => {
  const momentText = UNTIL_KEY_REGEX.exec(key)?.[1];
  if (!momentText) {
    throw new Error(`${setting}: unexpected key "${key}" in timed value — only "value" and "until <moment>" keys are allowed`);
  }
  if (!ISO_WITH_OFFSET_REGEX.test(momentText)) {
    throw new Error(`${setting}: "${key}" must be an ISO date-time with an explicit offset, e.g. "until 2026-10-08T09:00:00+01:00"`);
  }
  const moment = new Date(momentText);
  if (Number.isNaN(moment.getTime())) {
    throw new Error(`${setting}: "${key}" is not a valid date-time`);
  }
  return { moment, momentText, value };
};

const parseTimedValue = (setting: string, timedValue: Record<string, unknown>): TimedValue => {
  if (!("value" in timedValue)) {
    throw new Error(`${setting}: timed value has "until" keys but no "value" — "value" is the setting after the last switch`);
  }

  const { value, ...untilEntries } = timedValue;
  const steps = Object.entries(untilEntries)
    .map(([key, stepValue]) => parseStep(setting, key, stepValue))
    .sort((a, b) => a.moment.getTime() - b.moment.getTime());

  steps.forEach((step, index) => {
    if (index > 0 && steps[index - 1].moment.getTime() === step.moment.getTime()) {
      throw new Error(`${setting}: "until ${steps[index - 1].momentText}" and "until ${step.momentText}" are the same moment`);
    }
  });

  return { value, steps };
};

const valueAt = ({ value, steps }: TimedValue, now: Date): unknown => {
  const currentStep = steps.find(step => now.getTime() < step.moment.getTime());
  if (currentStep) {
    return currentStep.value;
  }
  return value;
};

const timedSettings = (json: unknown): [string, TimedValue][] => {
  if (!isPlainObject(json)) {
    return [];
  }
  return Object.entries(json)
    .filter(([, setting]) => isTimedValue(setting))
    .map(([key, setting]) => [key, parseTimedValue(key, setting as Record<string, unknown>)]);
};

// Replaces every top-level timed value with the value in force at `now`. Throws
// on a malformed timed value. Non-object input is passed through for the schema
// to reject.
export const resolveTimedValues = (json: unknown, now: Date): unknown => {
  if (!isPlainObject(json)) {
    return json;
  }

  const resolved = Object.fromEntries(timedSettings(json).map(([key, timedValue]) => [key, valueAt(timedValue, now)]));

  return Object.fromEntries(
    Object.entries({ ...json, ...resolved }) //
      .filter(([key, value]) => !(key in resolved && value === null)),
  );
};

// Every distinct switch moment in the config, ascending — the points at which
// the resolved config changes, and so the points worth validating it at.
export const getTimedValueMoments = (json: unknown): Date[] =>
  [...new Set(timedSettings(json).flatMap(([, { steps }]) => steps.map(step => step.moment.getTime())))]
    .sort((a, b) => a - b)
    .map(time => new Date(time));

const LONDON_OFFSET_FORMAT = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", timeZoneName: "longOffset" });
const LONDON_WALL_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" });

// "GMT" or "GMT+01:00" → "+00:00" / "+01:00"
const londonOffsetAt = (moment: Date): string => {
  const offsetName = LONDON_OFFSET_FORMAT.formatToParts(moment).find(part => part.type === "timeZoneName")?.value ?? "GMT";
  return offsetName === "GMT" ? "+00:00" : offsetName.slice("GMT".length);
};

const writtenOffset = (momentText: string): string => (momentText.endsWith("Z") ? "+00:00" : momentText.slice(-"+00:00".length));

// Build-time checks, beyond the shape errors resolveTimedValues throws. Returns
// human-readable problems; empty means fine. Uses Intl time zone data, so it is
// for validate.ts (Node) rather than the browser bundle.
export const findTimedValueProblems = (json: unknown, now: Date): string[] => {
  let settings: [string, TimedValue][];
  try {
    settings = timedSettings(json);
  } catch (err) {
    return [err instanceof Error ? err.message : String(err)];
  }

  return settings.flatMap(([setting, { steps }]) => [
    ...(SETTINGS_THAT_CANNOT_BE_TIMED.includes(setting) //
      ? [`${setting}: cannot be a timed value — it is read directly from the config file by build/deploy tooling`]
      : []),
    ...steps.flatMap(({ moment, momentText }) => [
      ...(moment.getTime() <= now.getTime() //
        ? [`${setting}: "until ${momentText}" is in the past — the switch has happened, so delete that key`]
        : []),
      ...(writtenOffset(momentText) !== londonOffsetAt(moment)
        ? [
            `${setting}: "until ${momentText}" is ${LONDON_WALL_TIME_FORMAT.format(moment)} UK time, but the UK is on ${londonOffsetAt(moment)} then, ` +
              `not ${writtenOffset(momentText)} — write the UK wall-clock time with offset ${londonOffsetAt(moment)}`,
          ]
        : []),
    ]),
  ]);
};
