import { Config, Preview } from "cps-global-configuration";
import { z } from "zod";
import { Result } from "../../utils/Result";
import { makeConsole } from "../../logging/makeConsole";
import { TrackEvent } from "../analytics/analytics-event";

const { _log, _warn, _debug } = makeConsole("request-observation-shim");

// Only activate on the OutSystems triage page.
const ACTIVATION_URL_REGEX = /^https:\/\/[^/]+\.outsystemsenterprise\.com\/WorkManagementApp\/Triage(\/|$|\?)/i;

// The OutSystems screenservice endpoint we want to capture submission bodies for.
// Activation already restricts us to the Triage page, so an endsWith match on the
// distinctive action name is enough — no need to pin the full module path.
const LISTEN_URL_REGEX = /\/ActionCompleteODReviewTask$/i;

const TriageSubmissionBodySchema = z.object({
  inputParameters: z.object({
    IsCPSD: z.boolean().optional(),
  }),
});

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
  XHR.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: any[]) {
    try {
      observed.set(this, { method: String(method ?? "").toUpperCase(), url: String(url) });
    } catch {
      // never let bookkeeping break the host request
    }
    return originalOpen.apply(this, [method, url, ...rest]);
  };

  XHR.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
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
  if (typeof body !== "string") {
    _debug("triage submission body not a string; skipping");
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    _debug("triage submission body not valid JSON; skipping");
    return;
  }
  const result = TriageSubmissionBodySchema.safeParse(parsed);
  if (!result.success) {
    _debug("triage submission body did not match schema; skipping");
    return;
  }

  const queryParams = readCoercedQueryParams(window);
  const { IsCPSD } = result.data.inputParameters;

  trackEvent({
    name: "triage-submission",
    ...queryParams,
    ...(IsCPSD !== undefined ? { IsCPSD } : {}),
  });
  _debug("triage submission tracked", { ...queryParams, IsCPSD });
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
