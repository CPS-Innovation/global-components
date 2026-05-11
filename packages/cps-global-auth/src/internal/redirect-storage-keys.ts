// SessionStorage keys shared between get-ad-user-account (the host page) and
// handle-msal-termination (the bounce-back page). Per-tab scope by definition.
//
// IN_FLIGHT_KEY: timestamp set just before loginRedirect fires; cleared by the
// termination page on a successful round-trip. Acts as a 30s loop guard so a
// failed bounce-back can't immediately re-fire the redirect on next page load.
//
// COMPLETION_ID_KEY: random UUID written by the termination page after
// handleRedirectPromise resolves successfully. Read-and-cleared by the host on
// the next entry to getAdUserAccount — its presence signals "we just came back
// from a successful redirect" and the value doubles as a correlation token for
// analytics.
export const MSAL_REDIRECT_IN_FLIGHT_KEY = "cps_global_components_msal_redirect_in_flight_at";
export const MSAL_REDIRECT_LOOP_GUARD_MS = 30_000;
export const MSAL_REDIRECT_COMPLETION_ID_KEY = "cps_global_components_msal_redirect_completion_id";
