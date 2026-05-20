import { z } from "zod";

// Fundamental AD-auth state model. Used by:
// - cps-global-components (host bundle) — derives AuthResult from MSAL output
// - cps-global-handover (handover bundle) — reads via AuthHint on failure beacon
// - cps-global-auth (MSAL library) — has its own structurally-compatible strict
//   subset in packages/cps-global-auth/src/AuthResult.ts (never produces
//   "ADPreventedByContext"). The two are intentionally decoupled today so the
//   library can stay free of an explicit dependency on this package.

export const AuthSchema = z.object({
  isAuthed: z.literal(true),
  username: z.string(),
  name: z.string().optional(),
  objectId: z.string(),
  groups: z.array(z.string()),
});

export type Auth = z.infer<typeof AuthSchema>;

// Superset of values produced by the host and the MSAL library.
// "ADPreventedByContext" is host-only — set when the context's
// preventADAndDataCalls flag disables AD calls entirely.
export type KnownErrorType =
  | "ConfigurationIncomplete"
  | "RedirectLocationIsApp"
  | "ADPreventedByContext"
  | "NoAccountFound"
  | "ConditionalAccessRule"
  | "MultipleIdentities"
  | "SilentFlowProblem"
  | "PostRequestFailed"
  | "NoNetworkConnectivity"
  | "StaleSidHint"
  // The cascade fired loginRedirect this call and the page is about to unload.
  // Distinct from "NoAccountFound" so analytics doesn't treat the outbound
  // leg of a healthy redirect round-trip as a terminal auth failure.
  | "RedirectInFlight"
  | "Unknown";

export type FailedAuth = {
  isAuthed: false;
  knownErrorType: KnownErrorType;
  reason: string;
};

export type AuthResult = Auth | FailedAuth;
