// Library-side definitions. Consumers (e.g. cps-global-components) define their
// own structurally-compatible versions and import from their own files —
// TypeScript's structural typing makes the boundary work without an explicit
// import dependency on these types.
//
// `KnownErrorType` here is the strict subset the library can actually produce.
// Hosts may extend the union locally with values they introduce themselves
// (e.g. cps-global-components has "ADPreventedByContext", set when context
// configuration disables AD calls — never produced by this library).

export type KnownErrorType =
  | "ConfigurationIncomplete"
  | "RedirectLocationIsApp"
  | "NoAccountFound"
  | "ConditionalAccessRule"
  | "MultipleIdentities"
  | "SilentFlowProblem"
  | "PostRequestFailed"
  | "NoNetworkConnectivity"
  // The supplied `sid` hint no longer matches an active server-side session
  // (rotated by another sign-in, CA policy, or session timeout). Silent flow
  // can recover by retrying without the hint; surfacing it as a classified
  // type lets callers branch on it and clear the persisted hint.
  | "StaleSidHint"
  // The cached refresh token has aged out — silent acquisition can't recover and
  // the user needs a fresh interactive sign-in. A normal token-lifecycle event,
  // surfaced as its own bucket so analytics doesn't lump it under "Unknown".
  | "RefreshTokenExpired"
  // The cascade fired loginRedirect this call and the page is about to unload.
  // Surfaced so analytics can distinguish "redirect outbound leg" (transient,
  // resolves on bounce-back) from "NoAccountFound" (real terminal failure
  // with no recovery path). Always paired with no account.
  | "RedirectInFlight"
  | "Unknown";

// Selected Microsoft Graph /me profile fields (see get-me). Structurally paired
// with cps-global-configuration's MeSchema — kept as an object so further
// fields can be added without reshaping the auth result.
export type Me = {
  department?: string;
};

export type Auth = {
  isAuthed: true;
  username: string;
  name?: string;
  objectId: string;
  groups: string[];
  me?: Me;
};

export type FailedAuth = {
  isAuthed: false;
  knownErrorType: KnownErrorType;
  reason: string;
};

export type AuthResult = Auth | FailedAuth;
