import { z } from "zod";

export type KnownErrorType =
  | "ConfigurationIncomplete"
  | "RedirectLocationIsApp"
  | "NoAccountFound"
  | "ConditionalAccessRule"
  | "MultipleIdentities"
  | "SilentFlowProblem"
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
