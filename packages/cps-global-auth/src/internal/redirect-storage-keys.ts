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

// Stashed by handle-msal-login (initiation) and consumed by handle-msal-termination
// (bounce-back) so the post-auth navigation to the host page survives the AAD
// round-trip. We can't keep it in the redirect URL's query string because AAD's
// strict redirectUri match wouldn't accept a query-bearing URI, and MSAL's
// redirectStartPage mechanism is taken (we point it at the redirectUri itself
// to coerce a same-page handleRedirectPromise path).
export const MSAL_REDIRECT_RETURN_TO_KEY = "cps_global_components_msal_redirect_return_to";
