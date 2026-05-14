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

  test("stores auth and bounces through ensure-ad with returnTo=target", async () => {
    const win = makeWindow(
      "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=https%3A%2F%2Fpolaris.example%2Fauth-handover.js&r=https%3A%2F%2Fexample.com%2Ftarget&stage=os-token-return&cc=test-cookies&cms-modern-token=test-token",
    );

    await handleOsTokenReturn(win, { cmsAuthStorageKeys: keys });

    expect(win.location.replace).toHaveBeenCalledTimes(1);
    const next = new URL((win.location.replace as jest.Mock).mock.calls[0]![0] as string);
    expect(next.origin + next.pathname).toBe(
      "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html",
    );
    expect(next.searchParams.get("stage")).toBe("ensure-ad");
    expect(next.searchParams.get("returnTo")).toBe("https://example.com/target");
    // OS-handover params dropped, ?src= preserved.
    expect(next.searchParams.get("src")).toBe(
      "https://polaris.example/auth-handover.js",
    );
    expect(next.searchParams.has("cc")).toBe(false);
    expect(next.searchParams.has("r")).toBe(false);
    expect(next.searchParams.has("cms-modern-token")).toBe(false);

    expect(localStorage[keys.WMA_COOKIES]).toBe("test-cookies");
    expect(JSON.parse(localStorage[keys.WMA_JSON]!).Token).toBe("test-token");
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

  test("does NOT call getCmsSessionHint when target is not under /casework_blocks/", async () => {
    const win = makeWindow(
      "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https%3A%2F%2Fexample.com%2FWorkManagementApp%2Fpage&stage=os-token-return&cc=test-cookies&cms-modern-token=test-token",
    );

    await handleOsTokenReturn(win, { cmsAuthStorageKeys: keys });

    expect(mockGetCmsSessionHint).not.toHaveBeenCalled();
  });

  test("swallows getCmsSessionHint errors and still navigates (via ensure-ad)", async () => {
    mockGetCmsSessionHint.mockRejectedValue(new Error("network down"));

    const win = makeWindow(
      "https://cps-dev.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?r=https%3A%2F%2Fexample.com%2FCasework_Blocks%2FHome&stage=os-token-return&cc=test-cookies&cms-modern-token=test-token",
    );

    await expect(
      handleOsTokenReturn(win, { cmsAuthStorageKeys: keys }),
    ).resolves.not.toThrow();
    expect(win.location.replace).toHaveBeenCalledTimes(1);
    const next = new URL((win.location.replace as jest.Mock).mock.calls[0]![0] as string);
    expect(next.searchParams.get("stage")).toBe("ensure-ad");
    expect(next.searchParams.get("returnTo")).toBe(
      "https://example.com/Casework_Blocks/Home",
    );
  });
});
