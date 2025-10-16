import { AuthResult } from "./initialise-auth";

export const initialiseMockAuth = async ({ window }: { window: Window }): Promise<AuthResult> =>
  window.__E2E_TEST_MODE__?.isAuthed
    ? { isAuthed: true, name: "E2e User", username: "e2e-user@example.org", objectId: "123", groups: window.__E2E_TEST_MODE__.adGroups }
    : {
        isAuthed: false,
        knownErrorType: "NoAccountFound",
        reason: "e2e test mode not authed",
      };
