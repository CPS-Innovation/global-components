import { Config } from "cps-global-configuration";
import { encode } from "./encoding";

export const arrangeEnableConsoleLogging = async () =>
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));

export type ArrangeProps = {
  config: Partial<Config>;
  auth: { isAuthed: boolean; adGroups: string[] };
};

export const arrange = async ({ config, auth }: Partial<ArrangeProps>) => {
  config = {
    ENVIRONMENT: "e2e",
    CONTEXTS: [{ contexts: "e2e", paths: [".*"], msalRedirectUrl: "not-used" }],
    LINKS: [],
    ...config,
  };
  auth = { isAuthed: true, adGroups: ["e2e-test-group"], ...auth };

  await page.setExtraHTTPHeaders({
    "x-config": encode(JSON.stringify(config)),
  });

  page.evaluateOnNewDocument((auth) => {
    (window as any).__E2E_TEST_MODE_IS_AUTHED__ = auth.isAuthed;
    (window as any).__E2E_TEST_MODE_AD_GROUPS__ = auth.adGroups;
  }, auth);
};
