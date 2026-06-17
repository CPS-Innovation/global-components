import { Config } from "cps-global-configuration";
import { TrackEvent } from "../analytics/analytics-event";
import { makeConsole } from "../../logging/makeConsole";

const { _debug } = makeConsole("dark-reader-detection");

// Presence of any value under this key means we've already spotted Dark Reader for this user
// (in this browser). We stamp the detection date for now, but only presence is load-bearing.
const STORAGE_KEY = "cps-global-components.dark-reader-detected";

const hasDarkReaderAttribute = (element: Element) => element.getAttributeNames().some(name => name.toLowerCase().includes("darkreader"));

// localStorage access is wrapped: as a guest component on host pages we don't control, it can
// throw (privacy mode, sandboxed iframe, disabled storage). A read failure is treated as
// "not yet seen" so detection still runs; a write failure is swallowed (the analytics event has
// already captured the detection, and on a later page load we'll simply detect and try again).
const hasBeenDetectedBefore = (window: Window) => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
};

const recordDetection = (window: Window) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
  } catch {
    /* best-effort — see note above */
  }
};

// Dark Reader (and similar extensions) annotate <html> with data-darkreader-* attributes. We
// emit a one-shot `dark-reader-detected` analytics event the first time we see one — once per
// user is enough, and the localStorage gate makes that "once" persist across page loads.
//
// We use a raw MutationObserver here rather than the shared `arrive`-based DOM-observation layer
// on purpose. `arrive` is built for descendant-arrival detection, so it hardcodes its observer
// to { childList: true, subtree: true } and gives no way to disable that — meaning it wakes on
// every DOM mutation anywhere in the document for the whole page lifetime. We only ever care
// about <html>'s own attributes on a single, always-present element, and unlike the other
// observers this one is enabled for *every* user (until detected). { attributes: true } with the
// default subtree:false watches just that — a handful of events per page instead of thousands —
// so a raw observer is dramatically cheaper for the only DOM observer the typical user runs.
export const initialiseDarkReaderDetection = ({
  window,
  config,
  trackEvent,
}: {
  window: Window & typeof globalThis;
  config: Config;
  trackEvent: TrackEvent;
}) => {
  // Environment kill-switch — shipped on everywhere, flip PROBE_DARK_READER_USAGE to false to disable.
  if (!config.PROBE_DARK_READER_USAGE) {
    _debug("PROBE_DARK_READER_USAGE disabled — skipping Dark Reader detection");
    return;
  }

  // Already recorded on a previous load → nothing to watch for.
  if (hasBeenDetectedBefore(window)) {
    _debug("Dark Reader already recorded — skipping observer setup");
    return;
  }

  const html = window.document.documentElement;

  // `detection` records how we spotted it: "sync" when it was already on <html> at startup
  // (the common case — Dark Reader annotates <html> before we run), "async" when the observer
  // caught it being switched on later.
  const report = (detection: "sync" | "async") => {
    recordDetection(window);
    _debug("Dark Reader detected on <html>", { detection });
    trackEvent({ name: "dark-reader-detected", detection });
  };

  // Already present at startup (Dark Reader typically annotates <html> before we run).
  if (hasDarkReaderAttribute(html)) {
    report("sync");
    return;
  }

  // Otherwise watch only <html>'s own attributes for Dark Reader switching on later.
  const observer = new window.MutationObserver(() => {
    if (hasDarkReaderAttribute(html)) {
      observer.disconnect();
      report("async");
    }
  });
  observer.observe(html, { attributes: true });
};
