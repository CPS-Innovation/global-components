let beforeUnloadFired = false;
let pageHiddenObserved = false;

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    beforeUnloadFired = true;
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pageHiddenObserved = true;
    }
  });
}

export const getPageState = () => ({
  beforeUnloadFired,
  pageHiddenObserved,
  documentHidden: typeof document !== "undefined" ? document.hidden : undefined,
  visibilityState: typeof document !== "undefined" ? document.visibilityState : undefined,
  navigatorOnLine: typeof navigator !== "undefined" ? navigator.onLine : undefined,
  url: typeof window !== "undefined" ? window.location.href.split("#")[0] : undefined,
});
