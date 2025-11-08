import { AuthResult } from "./AuthResult";
import { GetToken } from "./GetToken";

export const initialiseMockAuth = async ({ window }: { window: Window }): Promise<{ auth: AuthResult; getToken: GetToken }> =>
  window.__E2E_TEST_MODE__?.isAuthed
    ? {
        auth: { isAuthed: true, name: "E2e User", username: "e2e-user@example.org", objectId: "123", groups: window.__E2E_TEST_MODE__.adGroups },
        getToken: () => Promise.resolve(null),
      }
    : {
        auth: {
          isAuthed: false,
          knownErrorType: "NoAccountFound",
          reason: "e2e test mode not authed",
        },
        getToken: () => Promise.resolve(null),
      };
