import { ConfigStorage } from "cps-global-configuration";
import { encode } from "./encoding";
import { DeepPartial, typedDeepMerge } from "./utils";

export type ArrangeProps = {
  config: DeepPartial<ConfigStorage>;
  auth: DeepPartial<{ isAuthed: boolean; adGroups: string[] }>;
};

const baseProps: ArrangeProps = {
  config: {
    ENVIRONMENT: "e2e",
    CONTEXTS: [
      {
        msalRedirectUrl: "not-used",
        contexts: [{ contextIds: "e2e", path: ".*" }],
      },
    ],
    LINKS: [],
    BANNER_TITLE_HREF: "/",
    CMS_AUTH_STORAGE_KEYS: {
      WMA_JSON: "$OS_Users$Casework_Blocks$ClientVars$JSONString",
      WMA_COOKIES: "$OS_Users$Casework_Blocks$ClientVars$Cookies",
      CASE_REVIEW_JSON: "$OS_Users$CaseReview$ClientVars$CmsAuthValues",
      CASE_REVIEW_COOKIES: "$OS_Users$CaseReview$ClientVars$Cookies",
      HOME_JSON: "$OS_Users$Casework_Blocks$ClientVars$JSONString",
      HOME_COOKIES: "$OS_Users$Casework_Blocks$ClientVars$Cookies",
      HOME_IS_FROM_PROXY: "$OS_Users$Casework_Blocks$ClientVars$IsFromProxy",
      VCA_JSON: "$OS_Users$VictimsCaseApplication$ClientVars$JSONString",
      VCA_COOKIES: "$OS_Users$VictimsCaseApplication$ClientVars$Cookies",
    },
  },
  auth: { isAuthed: true, adGroups: ["e2e-test-group"] },
};

export const arrange = async ({ config, auth }: DeepPartial<ArrangeProps>) => {
  config = typedDeepMerge(baseProps.config, config);
  auth = typedDeepMerge(baseProps.auth, auth);

  await page.setExtraHTTPHeaders({
    "x-config": encode(JSON.stringify(config)),
  });

  page.evaluateOnNewDocument((auth) => {
    (window as any).__E2E_TEST_MODE__ = auth;
  }, auth);
};
