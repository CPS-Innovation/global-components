import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import { CmsAuthStorageKeys } from "cps-global-configuration";
import { handleOsCookieReturn } from "./handle-os-cookie-return";

// VCA is optional on CmsAuthStorageKeys (not every env has it configured). This
// fixture is the VCA-enabled shape, so the VCA keys are narrowed back to
// required — otherwise indexing storage by them below is a TS2538 error.
const keys: CmsAuthStorageKeys &
  Required<Pick<CmsAuthStorageKeys, "VCA_JSON" | "VCA_COOKIES">> = {
  WMA_JSON: "$OS_Users$Casework_Blocks$ClientVars$JSONString",
  WMA_COOKIES: "$OS_Users$Casework_Blocks$ClientVars$Cookies",
  CASE_REVIEW_JSON: "$OS_Users$CaseReview$ClientVars$CmsAuthValues",
  CASE_REVIEW_COOKIES: "$OS_Users$CaseReview$ClientVars$Cookies",
  HOME_JSON: "$OS_Users$Casework_Blocks$ClientVars$JSONString",
  HOME_COOKIES: "$OS_Users$Casework_Blocks$ClientVars$Cookies",
  HOME_IS_FROM_PROXY: "$OS_Users$Casework_Blocks$ClientVars$IsFromProxy",
  VCA_JSON: "$OS_Users$VictimsCaseApplication$ClientVars$JSONString",
  VCA_COOKIES: "$OS_Users$VictimsCaseApplication$ClientVars$Cookies",
};

const tokenHandoverUrl = "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token";

const makeWindow = (currentUrl: string) =>
  ({
    location: {
      href: currentUrl,
      hostname: new URL(currentUrl).hostname,
      replace: jest.fn(),
    },
    localStorage,
  }) as unknown as Window;

describe("handleOsCookieReturn", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("when stored cookies match incoming, returns kind:ready with target (mediator routes onward)", () => {
    localStorage[keys.WMA_COOKIES] = "matching-cookies";
    localStorage[keys.CASE_REVIEW_COOKIES] = "matching-cookies";
    localStorage[keys.HOME_COOKIES] = "matching-cookies";
    localStorage[keys.VCA_COOKIES] = "matching-cookies";

    const win = makeWindow(
      "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=https%3A%2F%2Fpolaris.example%2Fauth-handover.js&stage=os-cookie-return&cc=matching-cookies&r=https%3A%2F%2Fexample.com%2Ftarget",
    );

    const outcome = handleOsCookieReturn(win, { tokenHandoverUrl, cmsAuthStorageKeys: keys });

    expect(outcome).toEqual({ kind: "ready", target: "https://example.com/target" });
    // No direct navigation — caller (mediator) is responsible.
    expect(win.location.replace).not.toHaveBeenCalled();
  });

  test("when stored cookies differ, returns kind:needs-token with the token-handover href", () => {
    localStorage[keys.WMA_COOKIES] = "stale-cookies";
    localStorage[keys.CASE_REVIEW_COOKIES] = "stale-cookies";
    localStorage[keys.HOME_COOKIES] = "stale-cookies";

    const win = makeWindow(
      "https://cps-tst.outsystemsenterprise.com/AuthHandover/index.html?r=https%3A%2F%2Fexample.com%2Ftarget&stage=os-cookie-return&cc=fresh-cookies",
    );

    const outcome = handleOsCookieReturn(win, { tokenHandoverUrl, cmsAuthStorageKeys: keys });

    expect(outcome.kind).toBe("needs-token");
    if (outcome.kind === "needs-token") {
      const next = new URL(outcome.href);
      expect(next.origin + next.pathname).toBe(tokenHandoverUrl);
      expect(next.searchParams.get("cc")).toBe("fresh-cookies");
      const r = new URL(next.searchParams.get("r")!);
      expect(r.searchParams.get("stage")).toBe("os-token-return");
    }
    expect(win.location.replace).not.toHaveBeenCalled();
  });

  test("with no stored cookies, also returns kind:needs-token (mismatch counts as needs-token)", () => {
    const win = makeWindow(
      "https://cps-tst.outsystemsenterprise.com/AuthHandover/index.html?r=https%3A%2F%2Fexample.com%2Ftarget&stage=os-cookie-return&cc=incoming",
    );

    const outcome = handleOsCookieReturn(win, { tokenHandoverUrl, cmsAuthStorageKeys: keys });

    expect(outcome.kind).toBe("needs-token");
  });
});
