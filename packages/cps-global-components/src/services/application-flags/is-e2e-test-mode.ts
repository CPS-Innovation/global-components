import { ApplicationFlags } from "./ApplicationFlags";

declare global {
  interface Window {
    __E2E_TEST_MODE__: { isAuthed: boolean; adGroups: string[] } | undefined;
  }
}

export const isE2eTestMode = (window: Window): ApplicationFlags["e2eTestMode"] =>
  !!window.__E2E_TEST_MODE__ ? { isE2eTestMode: true, ...window.__E2E_TEST_MODE__ } : { isE2eTestMode: false };
