// Page-lifecycle abort signal.
//
// Host apps (notably Polaris) perform full-page navigations during normal use —
// their own AAD auth redirect, plus an internal cookie-pickup redirect. When one
// fires while one of our slow data-API fetches is in flight, the browser aborts
// the request and it rejects with `TypeError: Failed to fetch`. That is expected,
// not a data-API failure, but it floods our exception telemetry and masks genuine
// fetch failures.
//
// This provides a single AbortController for the page lifespan that is aborted on
// `pagehide`. The fetch layer attaches its signal to every authed data fetch, so a
// host navigation cancels them cleanly; they reject with a typed AbortError that
// the data services recognise and do NOT track.
//
// Why `pagehide` and not `visibilitychange`/`beforeunload`:
// - `visibilitychange → hidden` also fires on tab-switch, where the fetch should
//   complete normally — wrong trigger.
// - `pagehide` fires on the full-page navigations we care about. It does NOT fire
//   on SPA pushState navigations (which don't abort fetches anyway), so it cleanly
//   targets exactly the host redirects.
//
// bfcache: `pagehide` can fire with `event.persisted === true` (page frozen into
// the back/forward cache, may be restored). We deliberately do NOT abort in that
// case — a restored page should resume its fetches, not find them pre-cancelled.

let navigationAbort = new AbortController();
let unloading = false;

const onPageHide = (event: PageTransitionEvent) => {
  // Frozen into bfcache (may be restored) — treat as a pause, not a teardown.
  if (event.persisted) {
    return;
  }
  if (unloading) {
    return;
  }
  unloading = true;
  navigationAbort.abort(new DOMException("page navigating away", "AbortError"));
};

let registered = false;

// Idempotent. Called once from global-script on startup. Safe to call again (the
// listener is only ever attached once) so import-order quirks can't double-bind.
export const initialisePageLifecycle = (win: Window = window): void => {
  if (registered) {
    return;
  }
  // Guard like navigation.ts does (win.navigation?.addEventListener) — as a guest
  // component we can't assume the host's window shape, and test mocks may omit it.
  if (typeof win.addEventListener !== "function") {
    return;
  }
  registered = true;
  win.addEventListener("pagehide", onPageHide as EventListener);
};

// The signal to attach to fetches that should be cancelled when the page navigates
// away. Returns the current controller's signal.
export const navigationAbortSignal = (): AbortSignal => navigationAbort.signal;

// True once a non-bfcache `pagehide` has fired — i.e. the page is unloading.
export const isPageUnloading = (): boolean => unloading;

// True for AbortErrors raised by our navigation abort (or any AbortError — they are
// all "the request was cancelled", never a data-API failure worth tracking).
export const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

// Test-only: recreate the controller and clear state. AbortControllers can't be
// un-aborted, so without this a single pagehide in one test would leak into the next.
export const __resetPageLifecycleForTests = (): void => {
  navigationAbort = new AbortController();
  unloading = false;
  registered = false;
};
