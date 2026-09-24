import { Config, Preview } from "cps-global-configuration";
import { z } from "zod";
import { Result } from "../../utils/Result";
import { makeConsole } from "../../logging/makeConsole";
import { TrackEvent } from "../analytics/analytics-event";

const { _log, _warn, _debug } = makeConsole("request-observation-shim");

// Only activate on the OutSystems triage page.
const ACTIVATION_URL_REGEX = /^https:\/\/[^/]+\.outsystemsenterprise\.com\/WorkManagementApp\/Triage(\/|$|\?)/i;

// The OutSystems screenservice endpoints we capture submissions for. Activation
// already restricts us to the Triage page, so an endsWith match on the distinctive
// action name is enough — no need to pin the full module path.
//
// Since ~2026-07-23 every triage type (OD, ODPCDReview, DCP) completes through ONE
// action, ActionCompleteTriageTask. Before that each type had its own action, and
// this regex matching only those is why submissions went silently uncaptured from
// that date. The legacy names are kept: the new action was confirmed on cps-tst,
// and they cost nothing if prod lags or differs.
const LISTEN_URL_REGEX = /\/ActionComplete(TriageTask|ODReviewTask|ODTask|DCPTask)$/i;

// Only ever read named fields from the body — ActionCompleteTriageTask bodies also
// carry CmsAuthValues (CMS session cookies), Username and CMSUserId, none of which
// may leave the page.
const TriageSubmissionBodySchema = z.object({
  inputParameters: z.object({
    // Legacy ActionCompleteODReviewTask body.
    IsCPSD: z.boolean().optional(),
    // ActionCompleteTriageTask body: the "Is CPSD" radio (CaseMilestone_CW.Triage.CPSDirect
    // block), shown on ODPCDReview only. See cpsdFromDecision for the codes.
    SelectedCPSDirectDecision: z.number().optional(),
  }),
});

type CpsdFields = {
  IsCPSD?: boolean;
  SelectedCPSDirectDecision?: number;
};

type ObservedRequest = {
  method: string;
  url: string;
};

export const initialiseRequestObservationShim = ({
  window,
  config,
  preview,
  trackEvent,
}: {
  window: Window & typeof globalThis;
  config: Config;
  preview: Result<Preview>;
  trackEvent: TrackEvent;
}) => {
  // Either gate activates the shim: the config flag enables it broadly per
  // environment, the preview flag lets individual users opt in even when the
  // config flag is off (e.g. engineers testing after the kill-switch is flipped).
  if (!config.OS_TRIAGE_REQUEST_OBSERVATION_ENABLED && !preview.result?.requestObservationShim) {
    return;
  }

  if (!ACTIVATION_URL_REGEX.test(window.location.href)) {
    _debug("page URL does not match activation pattern; shim not installed", window.location.href);
    return;
  }

  const XHR = window.XMLHttpRequest;
  if (!XHR?.prototype) {
    _warn("XMLHttpRequest not available; shim not installed");
    return;
  }

  const observed = new WeakMap<XMLHttpRequest, ObservedRequest>();
  const originalOpen = XHR.prototype.open as (...args: any[]) => void;
  const originalSend = XHR.prototype.send as (...args: any[]) => void;

  // Use `function` (not arrow) so `this` is the XHR instance.
  const patchedOpen = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: any[]) {
    try {
      observed.set(this, { method: String(method ?? "").toUpperCase(), url: String(url) });
    } catch {
      // never let bookkeeping break the host request
    }
    return originalOpen.apply(this, [method, url, ...rest]);
  };

  const patchedSend = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    try {
      const entry = observed.get(this);
      if (entry?.method === "POST" && LISTEN_URL_REGEX.test(entry.url)) {
        captureTriageSubmission({ window, trackEvent, body });
      }
    } catch {
      // never let capture break the host request
    }
    return originalSend.apply(this, [body]);
  };

  // Prototype assignment can throw if a host instrumentation has sealed the
  // prototype or marked open/send as non-writable. If that happens we bail out
  // and roll back any half-install, rather than letting the error propagate
  // up to global-script's init catch and marking the whole bundle as broken.
  try {
    XHR.prototype.open = patchedOpen;
    XHR.prototype.send = patchedSend;
  } catch (err) {
    _warn("XHR prototype is not writable; shim not installed", err);
    try {
      if (XHR.prototype.open === patchedOpen) {
        XHR.prototype.open = originalOpen;
      }
    } catch {
      // prototype locked both ways — our patchedOpen is a strict delegate so
      // leaving it in place is functionally identical to the native method
    }
    return;
  }

  _log("XHR shim installed on", window.location.href);
};

const captureTriageSubmission = ({
  window,
  trackEvent,
  body,
}: {
  window: Window;
  trackEvent: TrackEvent;
  body: Document | XMLHttpRequestBodyInit | null | undefined;
}) => {
  // A matched POST is, by definition, a triage task being completed, so we always
  // record it. The body is best-effort only: we attach the CPSD fields when we can
  // read them and otherwise just note the submission happened. The captured query
  // params (TriageType, CaseId, TaskId) already tell the tasks apart.
  const queryParams = readCoercedQueryParams(window);
  const cpsdFields = extractCpsdFields(body);

  trackEvent({
    name: "triage-submission",
    ...queryParams,
    ...cpsdFields,
  });
  _debug("triage submission tracked", { ...queryParams, ...cpsdFields });
};

// Maps the "Is CPSD" radio's SelectedCPSDirectDecision code to the IsCPSD boolean the
// analytics KQL has always keyed on. Codes confirmed against deliberate Yes/No
// submissions on cps-tst: 0 = control not shown (OD, DCP), 1 = Yes, 2 = No. Anything
// else is unknown and yields no IsCPSD — the raw code is still emitted, so a new
// option shows up in the data instead of being misread.
const cpsdFromDecision = (decision: number | undefined): boolean | undefined => {
  if (decision === 1) {
    return true;
  }
  if (decision === 2) {
    return false;
  }
  return undefined;
};

// Best-effort read of the CPSD fields from the submission body. Returns {} for any
// body we can't read — not a string, not JSON, or not our expected shape — so an
// unexpected body simply yields an event without them rather than being dropped.
// The legacy IsCPSD boolean wins where present; otherwise it is derived from
// SelectedCPSDirectDecision.
const extractCpsdFields = (body: Document | XMLHttpRequestBodyInit | null | undefined): CpsdFields => {
  if (typeof body !== "string") {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return {};
  }
  const result = TriageSubmissionBodySchema.safeParse(parsed);
  if (!result.success) {
    return {};
  }
  const { IsCPSD: legacyIsCPSD, SelectedCPSDirectDecision } = result.data.inputParameters;
  const IsCPSD = legacyIsCPSD ?? cpsdFromDecision(SelectedCPSDirectDecision);
  return {
    ...(IsCPSD !== undefined ? { IsCPSD } : {}),
    ...(SelectedCPSDirectDecision !== undefined ? { SelectedCPSDirectDecision } : {}),
  };
};

export const readCoercedQueryParams = (window: Window): Record<string, string | number> => {
  const params = new URLSearchParams(window.location.search);
  const out: Record<string, string | number> = {};
  for (const [key, value] of params) {
    out[key] = coerceValue(value);
  }
  return out;
};

export const coerceValue = (value: string): string | number => {
  if (/^-?\d+$/.test(value)) {
    const n = Number(value);
    if (Number.isSafeInteger(n)) {
      return n;
    }
  }
  return value;
};
