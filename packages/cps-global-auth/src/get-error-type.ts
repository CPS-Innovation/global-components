import { BrowserAuthError, InteractionRequiredAuthError } from "@azure/msal-browser";
import { KnownErrorType } from "./AuthResult";

const MSAL_ERROR_CODES = {
  ConditionalAccessRule: "AADSTS53003",
  MultipleIdentities: "AADSTS16000",
  // Returned when the supplied `sid` hint no longer matches an active
  // server-side session. Callers in the silent-flow path retry without the
  // hint and clear the persisted lastKnownSid.
  StaleSidHint: "AADSTS160021",
  // The cached refresh token has aged out. Silent acquisition can't recover —
  // the user needs a fresh interactive sign-in. A normal token-lifecycle event,
  // not a fault; classified so analytics doesn't lump it under "Unknown".
  RefreshTokenExpired: "refresh_token_expired",
  IframeTimeout: "monitor_window_timeout",
  PostRequestFailed: "post_request_failed",
  NoNetworkConnectivity: "no_network_connectivity",
  // Thrown by acquireTokenSilent / ssoSilent when there is no cached account
  // (cold cache: first visit, post-logout, cleared storage, InPrivate). A normal
  // "no session yet" state, not a fault — classify as NoAccountFound rather than
  // letting it fall through to "Unknown".
  NoAccount: "no_account_error",
  // ssoSilent's server-side equivalent of NoAccount: AAD has no active session
  // for the user ("no user is signed in", incl. the cookie-not-sent IE/Edge
  // zone variant). Same benign "not signed in" family — also NoAccountFound.
  NotSignedIn: "AADSTS50058",
};

// Ordered match table. Each entry pairs the MSAL error subtype with a substring
// expected in error.message; the first match wins. We match on the message
// (not errorCode) to stay tolerant of how MSAL wraps/normalises these. Order is
// not significant today — the substrings are mutually exclusive — but the table
// preserves the historical precedence and makes adding a case a one-line change.
type Matcher = { is: (e: unknown) => boolean; contains: string; type: KnownErrorType };

const isInteractionRequired = (e: unknown): boolean => e instanceof InteractionRequiredAuthError;
const isBrowserAuth = (e: unknown): boolean => e instanceof BrowserAuthError;

const MATCHERS: Matcher[] = [
  { is: isInteractionRequired, contains: MSAL_ERROR_CODES.MultipleIdentities, type: "MultipleIdentities" },
  { is: isInteractionRequired, contains: MSAL_ERROR_CODES.ConditionalAccessRule, type: "ConditionalAccessRule" },
  { is: isInteractionRequired, contains: MSAL_ERROR_CODES.StaleSidHint, type: "StaleSidHint" },
  { is: isInteractionRequired, contains: MSAL_ERROR_CODES.RefreshTokenExpired, type: "RefreshTokenExpired" },
  { is: isInteractionRequired, contains: MSAL_ERROR_CODES.NotSignedIn, type: "NoAccountFound" },
  { is: isBrowserAuth, contains: MSAL_ERROR_CODES.IframeTimeout, type: "SilentFlowProblem" },
  { is: isBrowserAuth, contains: MSAL_ERROR_CODES.PostRequestFailed, type: "PostRequestFailed" },
  { is: isBrowserAuth, contains: MSAL_ERROR_CODES.NoNetworkConnectivity, type: "NoNetworkConnectivity" },
  { is: isBrowserAuth, contains: MSAL_ERROR_CODES.NoAccount, type: "NoAccountFound" },
];

export const getErrorType = (error: unknown): KnownErrorType => {
  const message = error instanceof Error ? error.message : "";
  const match = MATCHERS.find(m => m.is(error) && message.includes(m.contains));
  return match ? match.type : "Unknown";
};
