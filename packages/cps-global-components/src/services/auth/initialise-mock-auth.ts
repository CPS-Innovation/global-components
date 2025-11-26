import { ApplicationFlags } from "../application-flags/ApplicationFlags";
import { AuthResult } from "./AuthResult";
import { GetToken } from "./GetToken";

export const initialiseMockAuth = async ({ flags: { e2eTestMode } }: { flags: ApplicationFlags }): Promise<{ auth: AuthResult; getToken: GetToken }> =>
  e2eTestMode.isE2eTestMode && e2eTestMode.isAuthed
    ? {
        auth: { isAuthed: true, name: "E2e User", username: "e2e-user@example.org", objectId: "123", groups: e2eTestMode.adGroups },
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
