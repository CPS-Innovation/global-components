export type KnowErrorType = "ConfigurationIncomplete" | "RedirectLocationIsApp" | "NoAccountFound" | "ConditionalAccessRule" | "MultipleIdentities" | "Unknown";

export type Auth = {
  isAuthed: true;
  username: string;
  name: string | undefined;
  groups: string[];
  objectId: string;
};

export type FailedAuth = {
  isAuthed: false;
  knownErrorType: KnowErrorType;
  reason: string;
};

export type AuthResult = Auth | FailedAuth;
