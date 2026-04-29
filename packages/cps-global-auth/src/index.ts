// Public API surface — only the orchestration entry point and the types
// consumers need at the boundary. The cascade primitives (createMsalInstance,
// getAdUserAccount, getTokenFactory, getErrorType) are internal.
//
// Consumers may also define their own structurally-compatible local versions
// of Auth / AuthResult / FailedAuth / KnownErrorType / GetToken and import
// from their own files; structural typing takes care of the boundary.

export { initialiseAdAuth } from "./initialise-ad-auth";
export { handleMsalTermination } from "./handle-msal-termination";

export type { Auth, AuthResult, FailedAuth, KnownErrorType } from "./AuthResult";
export type { GetToken } from "./GetToken";
export type { SilentFlowDiagnostic } from "./silent-flow-diagnostic";
export type { HandleMsalTerminationOutcome } from "./handle-msal-termination";
