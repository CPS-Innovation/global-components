import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import { CmsAuthStorageKeys } from "cps-global-configuration";
import { handleOsCookieReturn } from "./handle-os-cookie-return";

const keys: CmsAuthStorageKeys = {
  WMA_JSON: "$OS_Users$Casework_Blocks$ClientVars$JSONString",
  WMA_COOKIES: "$OS_Users$Casework_Blocks$ClientVars$Cookies",
  CASE_REVIEW_JSON: "$OS_Users$CaseReview$ClientVars$CmsAuthValues",
  CASE_REVIEW_COOKIES: "$OS_Users$CaseReview$ClientVars$Cookies",
  HOME_JSON: "$OS_Users$Casework_Blocks$ClientVars$JSONString",
  HOME_COOKIES: "$OS_Users$Casework_Blocks$ClientVars$Cookies",
  HOME_IS_FROM_PROXY: "$OS_Users$Casework_Blocks$ClientVars$IsFromProxy",
};

const tokenHandoverUrl = "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token";

const makeWindow = (currentUrl: string) =>
  ({
    location: {
      href: currentUrl,
      hostname: new URL(currentUrl).hostname,
      replace: jest.fn(),
    },
    // jsdom-backed; handleOsCookieReturn reads via win.localStorage[key]
    localStorage,
  }) as unknown as Window;

describe("handleOsCookieReturn", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("when stored cookies match incoming, bounces through ensure-ad with returnTo=target (preemptive AD check)", () => {
    localStorage[keys.WMA_COOKIES] = "matching-cookies";
    localStorage[keys.CASE_REVIEW_COOKIES] = "matching-cookies";
    localStorage[keys.HOME_COOKIES] = "matching-cookies";

    const win = makeWindow(
      "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=https%3A%2F%2Fpolaris.example%2Fauth-handover.js&stage=os-cookie-return&cc=matching-cookies&r=https%3A%2F%2Fexample.com%2Ftarget",
    );

    handleOsCookieReturn(win, { tokenHandoverUrl, cmsAuthStorageKeys: keys });

    expect(win.location.replace).toHaveBeenCalledTimes(1);
    const next = new URL((win.location.replace as jest.Mock).mock.calls[0]![0] as string);
    expect(next.origin + next.pathname).toBe(
      "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html",
    );
    expect(next.searchParams.get("stage")).toBe("ensure-ad");
    expect(next.searchParams.get("returnTo")).toBe("https://example.com/target");
    // ?src= preserved for the bundle injection on the bounce-back.
    expect(next.searchParams.get("src")).toBe(
      "https://polaris.example/auth-handover.js",
    );
    // OS-handover params dropped — no longer needed past this point.
    expect(next.searchParams.has("cc")).toBe(false);
    expect(next.searchParams.has("r")).toBe(false);
  });

  test("redirects to tokenHandoverUrl with stage=os-token-return when stored cookies differ", () => {
    localStorage[keys.WMA_COOKIES] = "stale-cookies";
    localStorage[keys.CASE_REVIEW_COOKIES] = "stale-cookies";
    localStorage[keys.HOME_COOKIES] = "stale-cookies";

    const win = makeWindow(
      "https://cps-tst.outsystemsenterprise.com/AuthHandover/index.html?r=https%3A%2F%2Fexample.com%2Ftarget&stage=os-cookie-return&cc=fresh-cookies",
    );

    handleOsCookieReturn(win, { tokenHandoverUrl, cmsAuthStorageKeys: keys });

    expect(win.location.replace).toHaveBeenCalledTimes(1);
    const next = new URL((win.location.replace as jest.Mock).mock.calls[0]![0] as string);
    expect(next.origin + next.pathname).toBe(tokenHandoverUrl);
    expect(next.searchParams.get("cc")).toBe("fresh-cookies");

    const r = new URL(next.searchParams.get("r")!);
    expect(r.searchParams.get("stage")).toBe("os-token-return");
  });

  test("redirects to tokenHandoverUrl when no stored cookies exist", () => {
    const win = makeWindow(
      "https://cps-tst.outsystemsenterprise.com/AuthHandover/index.html?r=https%3A%2F%2Fexample.com%2Ftarget&stage=os-cookie-return&cc=incoming",
    );

    handleOsCookieReturn(win, { tokenHandoverUrl, cmsAuthStorageKeys: keys });

    expect(win.location.replace).toHaveBeenCalledTimes(1);
    const next = new URL((win.location.replace as jest.Mock).mock.calls[0]![0] as string);
    expect(next.origin + next.pathname).toBe(tokenHandoverUrl);
  });
});
