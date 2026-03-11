export type KnownErrorType =
  | "ConfigurationIncomplete"
  | "RedirectLocationIsApp"
  | "NoAccountFound"
  | "ConditionalAccessRule"
  | "MultipleIdentities"
  | "SilentFlowProblem"
  | "Unknown";

export type Auth = {
  isAuthed: true;
  username: string;
  name: string | undefined;
  groups: string[];
  objectId: string;
};

export type FailedAuth = {
  isAuthed: false;
  knownErrorType: KnownErrorType;
  reason: string;
};

export type AuthResult = Auth | FailedAuth;
