import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import { handleOsRedirectInternal, handleOsRedirect } from "./handle-os-redirect";

jest.mock("../core/get-cms-session-hint");
jest.mock("../application-logic/reset-tasklist-filters");

import { getCmsSessionHint } from "../core/get-cms-session-hint";
import { resetTasklistFilters } from "../application-logic/reset-tasklist-filters";

describe("handleOsRedirectInternal", () => {
  describe("os-cookie-return stage", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    test("redirects to token handover URL when cookies do not match localStorage", () => {
      // Set up localStorage with different cookies
      localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] =
        "different-cookies";
      localStorage["$OS_Users$CaseReview$ClientVars$Cookies"] =
        "different-cookies";
      localStorage["$OS_Users$Casework_Blocks$ClientVars$Cookies"] =
        "different-cookies";

      const result = handleOsRedirectInternal({
        currentUrl:
          "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-cookie-return&cc=test-cookies",
        tokenHandoverUrl:
          "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
      });

      expect(result.stage).toBe("os-cookie-return");
      expect(result.didUpdateToken).toBe(false);
      const url = new URL(result.nextUrl);
      expect(url.origin + url.pathname).toBe(
        "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
      );
      expect(url.searchParams.get("cc")).toBe("test-cookies");

      const returnUrlParam = url.searchParams.get("r")!;
      const returnUrl = new URL(returnUrlParam);
      expect(returnUrl.searchParams.get("stage")).toBe("os-token-return");
      expect(returnUrl.searchParams.get("r")).toBe(
        "https://example.com/target",
      );
      expect(url.searchParams.get("cc")).toBe("test-cookies");
    });

    test("returns target URL directly when cookies match localStorage", () => {
      // Set up localStorage with matching cookies
      localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] =
        "test-cookies";
      localStorage["$OS_Users$CaseReview$ClientVars$Cookies"] =
        "test-cookies";
      localStorage["$OS_Users$Casework_Blocks$ClientVars$Cookies"] =
        "test-cookies";

      const result = handleOsRedirectInternal({
        currentUrl:
          "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-cookie-return&cc=test-cookies",
        tokenHandoverUrl:
          "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
      });

      expect(result.stage).toBe("os-cookie-return");
      expect(result.nextUrl).toBe("https://example.com/target");
      expect(result.didUpdateToken).toBe(false);
    });

    test("returns target URL when cookies match but are in different order", () => {
      // Set up localStorage with cookies in different order
      localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] =
        "b=2; a=1; c=3";
      localStorage["$OS_Users$CaseReview$ClientVars$Cookies"] =
        "a=1; c=3; b=2";
      localStorage["$OS_Users$Casework_Blocks$ClientVars$Cookies"] =
        "c=3; a=1; b=2";

      const result = handleOsRedirectInternal({
        currentUrl:
          "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-cookie-return&cc=c=3; b=2; a=1",
        tokenHandoverUrl:
          "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
      });

      expect(result.nextUrl).toBe("https://example.com/target");
    });

    test("redirects to token handover when localStorage cookies are undefined", () => {
      const result = handleOsRedirectInternal({
        currentUrl:
          "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-cookie-return&cc=test-cookies",
        tokenHandoverUrl:
          "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
      });

      const url = new URL(result.nextUrl);
      expect(url.origin + url.pathname).toBe(
        "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
      );
    });

    test("redirects to token handover when only one localStorage entry matches", () => {
      // Only one localStorage entry matches
      localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] =
        "test-cookies";
      localStorage["$OS_Users$CaseReview$ClientVars$Cookies"] =
        "different-cookies";
      localStorage["$OS_Users$Casework_Blocks$ClientVars$Cookies"] =
        "test-cookies";

      const result = handleOsRedirectInternal({
        currentUrl:
          "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-cookie-return&cc=test-cookies",
        tokenHandoverUrl:
          "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
      });

      const url = new URL(result.nextUrl);
      expect(url.origin + url.pathname).toBe(
        "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
      );
    });

    test("preserves target URL with query parameters when redirecting", () => {
      localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] =
        "different-cookies";
      localStorage["$OS_Users$CaseReview$ClientVars$Cookies"] =
        "different-cookies";
      localStorage["$OS_Users$Casework_Blocks$ClientVars$Cookies"] =
        "different-cookies";

      const targetWithQuery = "https://example.com/target?foo=bar&baz=qux";
      const result = handleOsRedirectInternal({
        currentUrl: `https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=${encodeURIComponent(targetWithQuery)}&stage=os-cookie-return&cc=test-cookies`,
        tokenHandoverUrl:
          "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
      });

      const url = new URL(result.nextUrl);
      const returnUrl = new URL(url.searchParams.get("r")!);
      expect(returnUrl.searchParams.get("r")).toBe(targetWithQuery);
    });
  });

  describe("os-token-return stage", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    test("returns target URL and stores auth data", () => {
      const mockDate = new Date("2024-01-15T10:00:00.000Z");
      jest.spyOn(global, "Date").mockImplementation(() => mockDate);

      const result = handleOsRedirectInternal({
        currentUrl:
          "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-token-return&cc=test-cookies&cms-modern-token=test-token",
        tokenHandoverUrl:
          "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
      });

      expect(result.stage).toBe("os-token-return");
      expect(result.nextUrl).toBe("https://example.com/target");
      expect(result.didUpdateToken).toBe(true);

      // Verify auth data was stored
      expect(localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"]).toBe("test-cookies");
      expect(localStorage["$OS_Users$CaseReview$ClientVars$Cookies"]).toBe("test-cookies");
      expect(localStorage["$OS_Users$Casework_Blocks$ClientVars$Cookies"]).toBe("test-cookies");

      const expectedJson = JSON.stringify({
        Cookies: "test-cookies",
        Token: "test-token",
        ExpiryTime: "2024-01-15T10:00:00.000Z",
      });
      expect(localStorage["$OS_Users$WorkManagementApp$ClientVars$JSONString"]).toBe(expectedJson);
      expect(localStorage["$OS_Users$CaseReview$ClientVars$CmsAuthValues"]).toBe(expectedJson);
      expect(localStorage["$OS_Users$Casework_Blocks$ClientVars$JSONString"]).toBe(expectedJson);
    });

    test("handles target URL with query parameters", () => {
      const targetWithQuery = "https://example.com/target?foo=bar&baz=qux#section";
      const result = handleOsRedirectInternal({
        currentUrl: `https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=${encodeURIComponent(targetWithQuery)}&stage=os-token-return&cc=test-cookies&cms-modern-token=test-token`,
        tokenHandoverUrl:
          "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
      });

      expect(result.nextUrl).toBe(targetWithQuery);
    });

    test("handles empty token value", () => {
      const result = handleOsRedirectInternal({
        currentUrl:
          "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-token-return&cc=test-cookies&cms-modern-token=",
        tokenHandoverUrl:
          "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
      });

      expect(result.nextUrl).toBe("https://example.com/target");

      // Verify empty token is stored
      const storedJson = JSON.parse(localStorage["$OS_Users$WorkManagementApp$ClientVars$JSONString"]);
      expect(storedJson.Token).toBe("");
    });

    test("returns didUpdateToken=false when incoming token matches stored token", () => {
      localStorage["$OS_Users$WorkManagementApp$ClientVars$JSONString"] = JSON.stringify({
        Cookies: "stored-cookies",
        Token: "same-token",
        ExpiryTime: "2024-01-15T10:00:00.000Z",
      });

      const result = handleOsRedirectInternal({
        currentUrl:
          "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-token-return&cc=test-cookies&cms-modern-token=same-token",
        tokenHandoverUrl:
          "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
      });

      expect(result.didUpdateToken).toBe(false);
    });

    test("returns didUpdateToken=true when incoming token differs from stored token", () => {
      localStorage["$OS_Users$WorkManagementApp$ClientVars$JSONString"] = JSON.stringify({
        Cookies: "stored-cookies",
        Token: "old-token",
        ExpiryTime: "2024-01-15T10:00:00.000Z",
      });

      const result = handleOsRedirectInternal({
        currentUrl:
          "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-token-return&cc=test-cookies&cms-modern-token=new-token",
        tokenHandoverUrl:
          "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
      });

      expect(result.didUpdateToken).toBe(true);
    });

    test("returns didUpdateToken=true when there is no previously stored token", () => {
      const result = handleOsRedirectInternal({
        currentUrl:
          "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-token-return&cc=test-cookies&cms-modern-token=fresh-token",
        tokenHandoverUrl:
          "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
      });

      expect(result.didUpdateToken).toBe(true);
    });
  });

  describe("unknown stage", () => {
    test("throws error for unknown stage", () => {
      expect(() => {
        handleOsRedirectInternal({
          currentUrl:
            "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=unknown",
          tokenHandoverUrl:
            "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
        });
      }).toThrow("Unknown stage query parameter: unknown");
    });

    test("throws error for missing stage", () => {
      expect(() => {
        handleOsRedirectInternal({
          currentUrl:
            "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target",
          tokenHandoverUrl:
            "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
        });
      }).toThrow("Unknown stage query parameter: empty");
    });

    test("throws error for empty stage value", () => {
      expect(() => {
        handleOsRedirectInternal({
          currentUrl:
            "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=",
          tokenHandoverUrl:
            "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
        });
      }).toThrow("Unknown stage query parameter: empty");
    });
  });
});

const mockGetCmsSessionHint = getCmsSessionHint as jest.MockedFunction<
  typeof getCmsSessionHint
>;
const mockResetTasklistFilters = resetTasklistFilters as jest.MockedFunction<
  typeof resetTasklistFilters
>;

describe("handleOsRedirect", () => {
  const tokenHandoverUrl = "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token";

  const makeWindow = (currentUrl: string) =>
    ({
      location: {
        href: currentUrl,
        hostname: new URL(currentUrl).hostname,
        replace: jest.fn(),
      },
    }) as unknown as Window;

  beforeEach(() => {
    localStorage.clear();
    mockGetCmsSessionHint.mockReset();
    mockResetTasklistFilters.mockReset();
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  describe("handleSettingCmsSessionHint", () => {
    test("does not call getCmsSessionHint for os-cookie-return stage", async () => {
      const win = makeWindow(
        "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-cookie-return&cc=test-cookies",
      );

      await handleOsRedirect(win, tokenHandoverUrl);

      expect(mockGetCmsSessionHint).not.toHaveBeenCalled();
    });

    test("does not call getCmsSessionHint when nextUrl is not under /casework_blocks/", async () => {
      const win = makeWindow(
        "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/WorkManagementApp/page&stage=os-token-return&cc=test-cookies&cms-modern-token=test-token",
      );

      await handleOsRedirect(win, tokenHandoverUrl);

      expect(mockGetCmsSessionHint).not.toHaveBeenCalled();
    });

    test("fetches and stores CmsSessionHint for os-token-return with /Casework_Blocks/ path", async () => {
      const hint = {
        cmsDomains: ["example.com"],
        isProxySession: true,
        handoverEndpoint: null,
      };
      mockGetCmsSessionHint.mockResolvedValue(hint);

      const win = makeWindow(
        "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/Casework_Blocks/Home&stage=os-token-return&cc=test-cookies&cms-modern-token=test-token",
      );

      await handleOsRedirect(win, tokenHandoverUrl);

      expect(mockGetCmsSessionHint).toHaveBeenCalledTimes(1);
      expect(
        localStorage["$OS_Users$Casework_Blocks$ClientVars$IsFromProxy"],
      ).toBe("true");
    });

    test("stores isProxySession false when hint says so", async () => {
      const hint = {
        cmsDomains: ["example.com"],
        isProxySession: false,
        handoverEndpoint: null,
      };
      mockGetCmsSessionHint.mockResolvedValue(hint);

      const win = makeWindow(
        "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/Casework_Blocks/Home&stage=os-token-return&cc=test-cookies&cms-modern-token=test-token",
      );

      await handleOsRedirect(win, tokenHandoverUrl);

      expect(
        localStorage["$OS_Users$Casework_Blocks$ClientVars$IsFromProxy"],
      ).toBe("false");
    });

    test("does not block redirect when getCmsSessionHint throws", async () => {
      mockGetCmsSessionHint.mockRejectedValue(new Error("network failure"));

      const win = makeWindow(
        "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/Casework_Blocks/Home&stage=os-token-return&cc=test-cookies&cms-modern-token=test-token",
      );

      await handleOsRedirect(win, tokenHandoverUrl);

      expect(win.location.replace).toHaveBeenCalledWith(
        "https://example.com/Casework_Blocks/Home",
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("handleSettingCmsSessionHint error"),
      );
    });

    test("handles case-insensitive /casework_blocks/ path matching", async () => {
      const hint = {
        cmsDomains: [],
        isProxySession: true,
        handoverEndpoint: null,
      };
      mockGetCmsSessionHint.mockResolvedValue(hint);

      const win = makeWindow(
        "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/casework_blocks/Home&stage=os-token-return&cc=test-cookies&cms-modern-token=test-token",
      );

      await handleOsRedirect(win, tokenHandoverUrl);

      expect(mockGetCmsSessionHint).toHaveBeenCalledTimes(1);
    });

    test("always calls window.location.replace with the correct nextUrl", async () => {
      mockGetCmsSessionHint.mockResolvedValue({
        cmsDomains: [],
        isProxySession: false,
        handoverEndpoint: null,
      });

      const win = makeWindow(
        "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/Casework_Blocks/Home&stage=os-token-return&cc=test-cookies&cms-modern-token=test-token",
      );

      await handleOsRedirect(win, tokenHandoverUrl);

      expect(win.location.replace).toHaveBeenCalledWith(
        "https://example.com/Casework_Blocks/Home",
      );
    });
  });

  describe("resetTasklistFilters trigger", () => {
    test("calls resetTasklistFilters when token-return brings a new token on a cps-tst host", async () => {
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/WorkManagementApp/page&stage=os-token-return&cc=test-cookies&cms-modern-token=fresh-token",
      );

      await handleOsRedirect(win, tokenHandoverUrl);

      expect(mockResetTasklistFilters).toHaveBeenCalledTimes(1);
      expect(mockResetTasklistFilters).toHaveBeenCalledWith(win);
    });

    test("does not call resetTasklistFilters when hostname is not cps-tst (temporary feature gate)", async () => {
      const win = makeWindow(
        "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/WorkManagementApp/page&stage=os-token-return&cc=test-cookies&cms-modern-token=fresh-token",
      );

      await handleOsRedirect(win, tokenHandoverUrl);

      expect(mockResetTasklistFilters).not.toHaveBeenCalled();
    });

    test("does not call resetTasklistFilters when token-return brings the same token already in storage", async () => {
      localStorage["$OS_Users$WorkManagementApp$ClientVars$JSONString"] = JSON.stringify({
        Cookies: "test-cookies",
        Token: "same-token",
        ExpiryTime: "2024-01-15T10:00:00.000Z",
      });

      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/WorkManagementApp/page&stage=os-token-return&cc=test-cookies&cms-modern-token=same-token",
      );

      await handleOsRedirect(win, tokenHandoverUrl);

      expect(mockResetTasklistFilters).not.toHaveBeenCalled();
    });

    test("does not call resetTasklistFilters on os-cookie-return (no token written)", async () => {
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-cookie-return&cc=test-cookies",
      );

      await handleOsRedirect(win, tokenHandoverUrl);

      expect(mockResetTasklistFilters).not.toHaveBeenCalled();
    });
  });
});
