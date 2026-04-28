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
  | "Unknown";

export type Auth = {
  isAuthed: true;
  username: string;
  name?: string;
  objectId: string;
  groups: string[];
};

export type FailedAuth = {
  isAuthed: false;
  knownErrorType: KnownErrorType;
  reason: string;
};

export type AuthResult = Auth | FailedAuth;
