import { Preview } from "cps-global-configuration";
import { Result } from "../../utils/Result";
import { getArtifactUrl } from "../../utils/get-artifact-url";
import { setVerboseLogging } from "../../logging/verbose-logging";
import { makeConsole } from "../../logging/makeConsole";

const { _debugAlways } = makeConsole("verbose-logging");

// Its presence on the HOST page's origin switches verbose logging on; the value
// is ignored. Synchronous, so — unlike the preview flag — it is known before the
// first log line.
export const VERBOSE_LOGGING_STORAGE_KEY = "cps-global-components-verbose-logging-on";

type Reason = "local-bundle" | "local-storage" | "preview";

// Is the bundle (not the host page) served from a local origin? That is the
// signature of someone working on global-components itself; a host-app
// developer on localhost loads the deployed dev script.
export const isLocalBundle = (rootUrl: string) => {
  try {
    const { protocol, hostname } = new URL(rootUrl);
    return (protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1")) || hostname.endsWith("devtunnels.ms");
  } catch {
    return false;
  }
};

const hasStorageOptIn = (window: Window) => {
  try {
    return window.localStorage.getItem(VERBOSE_LOGGING_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
};

export const describeVerboseLogging = ({ reasons, previewUrl }: { reasons: Reason[]; previewUrl: string }) => {
  const setKey = `localStorage.setItem("${VERBOSE_LOGGING_STORAGE_KEY}", "true")`;
  const removeKey = `localStorage.removeItem("${VERBOSE_LOGGING_STORAGE_KEY}")`;

  if (!reasons.length) {
    return `Verbose logging is OFF. To switch it on, either run ${setKey} on this site and reload, or switch on "Verbose logging" at ${previewUrl}`;
  }

  const because = reasons
    .map(reason => {
      switch (reason) {
        case "local-bundle":
          return "the script is served from a local origin";
        case "local-storage":
          return `the localStorage key "${VERBOSE_LOGGING_STORAGE_KEY}" is set — ${removeKey} and reload to clear it`;
        case "preview":
          return `the "Verbose logging" preview flag is on — switch it off at ${previewUrl}`;
      }
    })
    .join("; ");

  return `Verbose logging is ON because ${because}.`;
};

export const initialiseVerboseLogging = ({ window, rootUrl }: { window: Window; rootUrl: string }) => {
  const earlyReasons: Reason[] = [...(isLocalBundle(rootUrl) ? ["local-bundle" as const] : []), ...(hasStorageOptIn(window) ? ["local-storage" as const] : [])];

  if (earlyReasons.length) {
    setVerboseLogging(true);
  }

  const resolveVerboseLoggingFromPreview = (preview: Result<Preview>) => {
    const previewOn = !!(preview.found && preview.result.verboseLogging);
    const reasons: Reason[] = [...earlyReasons, ...(previewOn ? ["preview" as const] : [])];
    setVerboseLogging(reasons.length > 0);
    // Deliberately ungated: written at debug level so it shows only to someone
    // with the console's Verbose level on — exactly the reader who would want
    // to know how to switch our output on or off.
    _debugAlways(describeVerboseLogging({ reasons, previewUrl: getArtifactUrl(rootUrl, "preview/index.html") }));
  };

  return { resolveVerboseLoggingFromPreview };
};
