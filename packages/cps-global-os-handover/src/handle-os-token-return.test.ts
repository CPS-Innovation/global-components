import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import { CmsAuthStorageKeys } from "cps-global-configuration";

jest.mock("./core/get-cms-session-hint");
jest.mock("./application-logic/reset-tasklist-filters");

import { handleOsTokenReturn } from "./handle-os-token-return";
import { getCmsSessionHint } from "./core/get-cms-session-hint";
import { resetTasklistFilters } from "./application-logic/reset-tasklist-filters";

const mockGetCmsSessionHint = getCmsSessionHint as jest.MockedFunction<typeof getCmsSessionHint>;
const mockResetTasklistFilters = resetTasklistFilters as jest.MockedFunction<typeof resetTasklistFilters>;

const keys: CmsAuthStorageKeys = {
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

const makeWindow = (currentUrl: string) =>
  ({
    location: {
      href: currentUrl,
      hostname: new URL(currentUrl).hostname,
      replace: jest.fn(),
    },
    localStorage,
  }) as unknown as Window;

describe("handleOsTokenReturn", () => {
  beforeEach(() => {
    localStorage.clear();
    mockGetCmsSessionHint.mockReset();
    mockResetTasklistFilters.mockReset();
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  test("stores auth in OS-shape localStorage and returns kind:ready with target", async () => {
    const win = makeWindow(
      "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&r=https%3A%2F%2Fexample.com%2Ftarget&stage=os-token-return&cc=test-cookies&cms-modern-token=test-token",
    );

    const outcome = await handleOsTokenReturn(win, { cmsAuthStorageKeys: keys });

    expect(outcome).toEqual({ kind: "ready", target: "https://example.com/target" });
    expect(localStorage[keys.WMA_COOKIES]).toBe("test-cookies");
    expect(JSON.parse(localStorage[keys.WMA_JSON]!).Token).toBe("test-token");
    // No direct navigation — mediator's job.
    expect(win.location.replace).not.toHaveBeenCalled();
  });

  test("calls resetTasklistFilters when new token differs from stored AND host is cps-tst", async () => {
    localStorage[keys.WMA_JSON] = JSON.stringify({ Cookies: "x", Token: "old-token", ExpiryTime: "x" });

    const win = makeWindow(
      "https://cps-tst.outsystemsenterprise.com/AuthHandover/index.html?r=https%3A%2F%2Fexample.com%2FWorkManagementApp%2Fpage&stage=os-token-return&cc=test-cookies&cms-modern-token=fresh-token",
    );

    await handleOsTokenReturn(win, { cmsAuthStorageKeys: keys });

    expect(mockResetTasklistFilters).toHaveBeenCalledTimes(1);
    expect(mockResetTasklistFilters).toHaveBeenCalledWith(win);
  });

  test("does NOT call resetTasklistFilters when hostname is not cps-tst", async () => {
    const win = makeWindow(
      "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https%3A%2F%2Fexample.com%2FWorkManagementApp%2Fpage&stage=os-token-return&cc=test-cookies&cms-modern-token=fresh-token",
    );

    await handleOsTokenReturn(win, { cmsAuthStorageKeys: keys });

    expect(mockResetTasklistFilters).not.toHaveBeenCalled();
  });

  test("does NOT call resetTasklistFilters when incoming token matches stored", async () => {
    localStorage[keys.WMA_JSON] = JSON.stringify({ Cookies: "x", Token: "same-token", ExpiryTime: "x" });

    const win = makeWindow(
      "https://cps-tst.outsystemsenterprise.com/AuthHandover/index.html?r=https%3A%2F%2Fexample.com%2FWorkManagementApp%2Fpage&stage=os-token-return&cc=test-cookies&cms-modern-token=same-token",
    );

    await handleOsTokenReturn(win, { cmsAuthStorageKeys: keys });

    expect(mockResetTasklistFilters).not.toHaveBeenCalled();
  });

  test("sets CmsSessionHint when target lands on /casework_blocks/", async () => {
    mockGetCmsSessionHint.mockResolvedValue({ cmsDomains: [], isProxySession: true, handoverEndpoint: null });

    const win = makeWindow(
      "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https%3A%2F%2Fexample.com%2FCasework_Blocks%2FHome&stage=os-token-return&cc=test-cookies&cms-modern-token=test-token",
    );

    await handleOsTokenReturn(win, { cmsAuthStorageKeys: keys });

    expect(mockGetCmsSessionHint).toHaveBeenCalledTimes(1);
    expect(localStorage[keys.HOME_IS_FROM_PROXY]).toBe("true");
  });

  test("sets CmsSessionHint when target lands on /casework/ (new home location)", async () => {
    mockGetCmsSessionHint.mockResolvedValue({ cmsDomains: [], isProxySession: true, handoverEndpoint: null });

    const win = makeWindow(
      "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https%3A%2F%2Fexample.com%2FCasework%2FHome&stage=os-token-return&cc=test-cookies&cms-modern-token=test-token",
    );

    await handleOsTokenReturn(win, { cmsAuthStorageKeys: keys });

    expect(mockGetCmsSessionHint).toHaveBeenCalledTimes(1);
    expect(localStorage[keys.HOME_IS_FROM_PROXY]).toBe("true");
  });

  test("does NOT call getCmsSessionHint when target is not under /casework_blocks/", async () => {
    const win = makeWindow(
      "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https%3A%2F%2Fexample.com%2FWorkManagementApp%2Fpage&stage=os-token-return&cc=test-cookies&cms-modern-token=test-token",
    );

    await handleOsTokenReturn(win, { cmsAuthStorageKeys: keys });

    expect(mockGetCmsSessionHint).not.toHaveBeenCalled();
  });

  test("swallows getCmsSessionHint errors and still returns kind:ready with target", async () => {
    mockGetCmsSessionHint.mockRejectedValue(new Error("network down"));

    const win = makeWindow(
      "https://cps-dev.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?r=https%3A%2F%2Fexample.com%2FCasework_Blocks%2FHome&stage=os-token-return&cc=test-cookies&cms-modern-token=test-token",
    );

    const outcome = await handleOsTokenReturn(win, { cmsAuthStorageKeys: keys });

    expect(outcome).toEqual({ kind: "ready", target: "https://example.com/Casework_Blocks/Home" });
  });
});
