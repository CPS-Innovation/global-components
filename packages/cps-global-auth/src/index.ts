// Public API surface — only the orchestration entry point and the types
// consumers handle. The cascade primitives (createMsalInstance,
// getAdUserAccount, getTokenFactory, getErrorType) are internal.
export { initialiseAdAuth } from "./initialise-ad-auth";

export type { Auth, AuthResult, FailedAuth, KnownErrorType } from "./AuthResult";
export { AuthSchema } from "./AuthResult";
export type { GetToken } from "./GetToken";
export type { SilentFlowDiagnostic } from "./silent-flow-diagnostic";
