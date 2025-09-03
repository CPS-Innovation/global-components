declare global {
  interface Window {
    __E2E_TEST_MODE__: { isAuthed: boolean; adGroups: string[] } | undefined;
  }
}

export const isE2eTestMode = (window: Window) => !!window.__E2E_TEST_MODE__;
