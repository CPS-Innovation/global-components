// Host-side definitions. Structurally compatible with the matching types in
// cps-global-auth so values flow across the boundary via TS structural typing
// — no explicit import dependency on the library's types.
//
// This union is a SUPERSET of the library's KnownErrorType: it also includes
// "ADPreventedByContext", which is set host-side in initialise-auth.ts when
// the context's preventADAndDataCalls flag is true (the library never
// produces this value).

import { z } from "zod";

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
  | "Unknown";

export const AuthSchema = z.object({
  isAuthed: z.literal(true),
  username: z.string(),
  name: z.string().optional(),
  objectId: z.string(),
  groups: z.array(z.string()),
});

export type Auth = z.infer<typeof AuthSchema>;

export type FailedAuth = {
  isAuthed: false;
  knownErrorType: KnownErrorType;
  reason: string;
};

export type AuthResult = Auth | FailedAuth;
