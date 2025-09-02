import { AuthResult } from "./initialise-auth";

declare global {
  interface Window {
    __E2E_TEST_MODE_IS_AUTHED__: false | undefined;
    __E2E_TEST_MODE_AD_GROUPS__: string[];
  }
}

export const initialiseMockAuth = async ({ window }: { window: Window }): Promise<AuthResult> =>
  window.__E2E_TEST_MODE_IS_AUTHED__ === false
    ? {
        isAuthed: false,
        knownErrorType: "NoAccountFound",
        reason: "Foo",
      }
    : { isAuthed: true, name: "E2e User", username: "e2e-user@example.org", groups: window.__E2E_TEST_MODE_AD_GROUPS__ };
