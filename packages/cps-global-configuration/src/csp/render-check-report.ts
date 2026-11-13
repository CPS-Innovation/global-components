import type { CheckTarget } from "./derive-check-targets";
import type { PolicyCheck } from "./check-policy";

/**
 * Renders the live-check results as one thing: a checklist for the OutSystems
 * developers who own the policies.
 *
 * Kept separate from the fetching so the reporting is testable without a
 * network. The markdown (file and GitHub job summary) and the standalone page
 * render the same items.
 *
 * Deliberately no diagnostic detail. How a verdict was reached is for whoever
 * doubts the checker, and the raw headers are one `curl -sI` away; in front of
 * the people doing the fixing it is noise.
 */

export type TargetResult = {
  target: CheckTarget;
  // Where the request actually landed. App roots commonly redirect to a login
  // screen, and the policy read there is not necessarily the policy on the
  // screen our component runs on — so this is reported, not hidden.
  finalUrl?: string;
  error?: string;
  enforced: string[];
  reportOnly: string[];
  check?: PolicyCheck;
  // True when the response came from a different host than we asked for.
  // On the first live run every cpslon-dev target redirected to
  // www.outsystems.com — a host that serves no CSP at all — and the checker
  // reported all four as clean. A policy read from somewhere else is not
  // evidence about the target, so this outranks any verdict.
  redirectedOffHost?: boolean;
  // auth-handover targets only: whether the file OutSystems serves matches the
  // one in this repository. Undefined when not applicable or not determinable.
  handoverMatchesRepo?: boolean;
};

export type Status = "ok" | "warn" | "fail" | "unknown";

export const statusOf = (result: TargetResult): Status => {
  if (result.error || !result.check) {
    return "unknown";
  }
  if (result.redirectedOffHost) {
    return "unknown";
  }
  // No policy anywhere means nothing is blocked, so the component would work —
  // but it is not the same finding as a host that explicitly allows what we
  // need, and showing it as clean invites someone to conclude the policy is
  // correct when there isn't one.
  if (result.enforced.length === 0) {
    return "warn";
  }
  if (result.check.findings.some(f => f.verdict === "absent")) {
    return "fail";
  }
  if (result.handoverMatchesRepo === false) {
    return "fail";
  }
  // Stale entries do not count: the host's policy serves the whole page, and
  // other software on it (OutSystems' own App Insights, for one) may need what
  // we no longer do.
  if (result.check.findings.some(f => f.verdict === "narrower")) {
    return "warn";
  }
  return "ok";
};

// Links point at main rather than the checked-out ref: main is what has been
// deployed to the Polaris hosts, so it is what the tenants should match.
const REPO_MAIN_URL = "https://github.com/CPS-Innovation/global-components/blob/main";

// The latest auth-handover.html, as the OutSystems developer should upload it.
export const REPO_HANDOVER_HTML_URL = `${REPO_MAIN_URL}/packages/cps-global-handover/auth-handover.html`;

// Why each origin is needed, for the developer who asks.
export const CSP_REQUIREMENTS_URL = `${REPO_MAIN_URL}/generated/csp/CSP-REQUIREMENTS.md`;

/**
 * One line of the checklist an OutSystems developer works through.
 *
 * `rules` are what to change, verbatim where they can be pasted into a policy.
 * Redeploy rows carry no rules: the fix is uploading our file, and listing its
 * directives would invite hand-editing it instead.
 */
export type ChecklistItem = {
  environment: string;
  path: string;
  change: "Redeploy" | "Add" | "Widen";
  rules: string[];
};

const sortedUnique = (values: string[]): string[] =>
  Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));

// "connect-src a b" per directive, from (directive, source) pairs.
const directiveLines = (pairs: { directive: string; source: string }[]): string[] =>
  sortedUnique(pairs.map(p => p.directive)).map(
    directive => `${directive} ${sortedUnique(pairs.filter(p => p.directive === directive).map(p => p.source)).join(" ")}`,
  );

const itemsFor = (result: TargetResult): ChecklistItem[] => {
  if (statusOf(result) === "unknown" || !result.check) {
    return [];
  }

  const environment = result.target.environment;
  // The page we asked for, not wherever it redirected (a login screen, say):
  // the policy belongs to the app module, and that is what the fix names.
  const path = new URL(result.target.url).pathname;
  const redeploy = result.target.kind === "auth-handover" && result.handoverMatchesRepo === false;

  const absent = result.check.findings.filter(f => f.verdict === "absent");
  const narrower = result.check.findings.filter(f => f.verdict === "narrower");
  // No "remove" rows: the host's policy serves everything else on the page
  // too, so an entry we no longer need is not ours to judge.

  const item = (change: ChecklistItem["change"], rules: string[]): ChecklistItem[] =>
    [{ environment, path, change, rules }];

  return [
    ...(redeploy ? item("Redeploy", []) : []),
    ...(absent.length
      ? item("Add", directiveLines(absent.map(f => ({ directive: f.requirement.directive, source: f.requirement.value }))))
      : []),
    ...(narrower.length
      ? item(
          "Widen",
          narrower.map(f =>
            f.narrowSource
              ? `${f.requirement.directive}: replace ${f.narrowSource} with ${f.requirement.value}`
              : `${f.requirement.directive} ${f.requirement.value}`,
          ),
        )
      : []),
  ];
};

// Additions first (a redeploy is one), then widenings: the order of urgency.
// Within a group, the order the pages were checked in.
const GROUP_ORDER: ChecklistItem["change"][][] = [["Redeploy", "Add"], ["Widen"]];

export const checklistOf = (results: TargetResult[]): ChecklistItem[] => {
  const items = results.flatMap(itemsFor);
  return GROUP_ORDER.flatMap(group => items.filter(i => group.includes(i.change)));
};

const unreachableOf = (results: TargetResult[]): TargetResult[] =>
  results.filter(result => statusOf(result) === "unknown");

const uncheckedReason = (result: TargetResult): string =>
  result.error ?? (result.redirectedOffHost ? `redirected to ${result.finalUrl}` : "no result");

const NOTHING_TO_DO = "Nothing to do: every environment already grants everything we need.";
const NOTHING_TO_DO_ON_CHECKED = "Nothing to do on the pages that could be checked.";

/**
 * The checklist: one row per page per kind of change -- additions, then
 * widenings (granted, but path-restricted, so not wide enough for the origin
 * we need) -- each naming the exact rules affected. An auth-handover.html that
 * differs from the repository is a single "redeploy" row linking the file.
 *
 * Never removals. The host's policy serves everything on the page, and other
 * software there makes its own calls (App Insights included), so "global
 * components no longer needs it" is not "safe to remove".
 *
 * Pages that could not be checked are listed beneath, because a run that
 * fetched nothing would otherwise read as "nothing to do" -- the most
 * reassuring answer, from no evidence at all.
 */
export const renderMarkdownReport = (results: TargetResult[], generatedAt: string): string => {
  const items = checklistOf(results);
  const unreachable = unreachableOf(results);

  const notesOf = (item: ChecklistItem): string =>
    item.change === "Redeploy"
      ? `Upload the latest [auth-handover.html](${REPO_HANDOVER_HTML_URL})`
      : item.rules.map(rule => `\`${rule}\``).join("<br>");

  return [
    "# OutSystems CSP checklist",
    "",
    ...(items.length
      ? [
          "| Env | Page | Change | Notes |",
          "| --- | --- | --- | --- |",
          ...items.map(item => `| ${item.environment} | \`${item.path}\` | ${item.change} | ${notesOf(item)} |`),
        ]
      : [unreachable.length ? NOTHING_TO_DO_ON_CHECKED : NOTHING_TO_DO]),
    "",
    ...(unreachable.length
      ? [
          "Could not be checked:",
          "",
          ...unreachable.map(r => `- ${r.target.environment} \`${new URL(r.target.url).pathname}\` — ${uncheckedReason(r)}`),
          "",
        ]
      : []),
    `Checked ${generatedAt}. Why each origin is needed: [CSP-REQUIREMENTS.md](${CSP_REQUIREMENTS_URL}).`,
    "",
  ].join("\n");
};

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    c =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );

/**
 * The same checklist as a standalone page.
 *
 * Note this page can only ever DISPLAY a check performed elsewhere: CSP
 * response headers are not readable cross-origin from a browser, because they
 * are not CORS-safelisted and OutSystems does not send
 * Access-Control-Expose-Headers. Any "live" dashboard has to be fed by a
 * server-side run.
 */
export const renderHtmlReport = (results: TargetResult[], generatedAt: string): string => {
  const items = checklistOf(results);
  const unreachable = unreachableOf(results);
  const notesOf = (item: ChecklistItem): string =>
    item.change === "Redeploy"
      ? `Upload the latest <a href="${REPO_HANDOVER_HTML_URL}">auth-handover.html</a>`
      : item.rules.map(rule => `<code>${escapeHtml(rule)}</code>`).join("<br>");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>OutSystems CSP checklist</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; max-width: 70rem; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
  th, td { border: 1px solid #ddd; padding: 0.4rem 0.6rem; text-align: left; font-size: 0.9rem; vertical-align: top; }
  th { background: #f5f5f5; }
  code { background: #f5f5f5; padding: 0 0.2rem; }
</style>
</head>
<body>
<h1>OutSystems CSP checklist</h1>
${
  items.length
    ? `<table>
<tr><th>Env</th><th>Page</th><th>Change</th><th>Notes</th></tr>
${items
  .map(
    item =>
      `<tr><td>${escapeHtml(item.environment)}</td><td><code>${escapeHtml(item.path)}</code></td><td>${item.change}</td><td>${notesOf(item)}</td></tr>`,
  )
  .join("\n")}
</table>`
    : `<p>${unreachable.length ? NOTHING_TO_DO_ON_CHECKED : NOTHING_TO_DO}</p>`
}
${
  unreachable.length
    ? `<p>Could not be checked:</p>
<ul>
${unreachable.map(r => `<li>${escapeHtml(r.target.environment)} <code>${escapeHtml(new URL(r.target.url).pathname)}</code> — ${escapeHtml(uncheckedReason(r))}</li>`).join("\n")}
</ul>`
    : ""
}
<p>Checked ${escapeHtml(generatedAt)}. Why each origin is needed: <a href="${CSP_REQUIREMENTS_URL}">CSP-REQUIREMENTS.md</a>.</p>
</body>
</html>
`;
};
