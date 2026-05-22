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
// action name is enough — no need to pin the full module path. Only ODReviewTask
// carries a body we can read (IsCPSD); ODTask/DCPTask bodies are arbitrary, so we
// just record that the submission happened (see captureTriageSubmission).
const LISTEN_URL_REGEX = /\/ActionComplete(ODReviewTask|ODTask|DCPTask)$/i;

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
  // A matched POST is, by definition, one of the triage tasks being completed, so
  // we always record it. The body is best-effort only: ODReviewTask carries IsCPSD,
  // but ODTask/DCPTask bodies are arbitrary and may not be JSON at all — we attach
  // IsCPSD when we can read it and otherwise just note the submission happened. The
  // captured query params (e.g. TaskType) already tell the tasks apart.
  const queryParams = readCoercedQueryParams(window);
  const IsCPSD = extractIsCPSD(body);

  trackEvent({
    name: "triage-submission",
    ...queryParams,
    ...(IsCPSD !== undefined ? { IsCPSD } : {}),
  });
  _debug("triage submission tracked", { ...queryParams, IsCPSD });
};

// Best-effort read of IsCPSD from the submission body. Returns undefined for any
// body we can't read — not a string, not JSON, or not our expected shape — so a
// whacky ODTask/DCPTask body simply yields an event without IsCPSD rather than
// being dropped.
const extractIsCPSD = (body: Document | XMLHttpRequestBodyInit | null | undefined): boolean | undefined => {
  if (typeof body !== "string") {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }
  const result = TriageSubmissionBodySchema.safeParse(parsed);
  if (!result.success) {
    return undefined;
  }
  return result.data.inputParameters.IsCPSD;
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
