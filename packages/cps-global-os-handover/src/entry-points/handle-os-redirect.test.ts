import { describe, test, expect, beforeEach } from "@jest/globals";
import { handleOsRedirectInternal } from "./handle-os-redirect";

describe("handleOsRedirectInternal", () => {
  describe("os-outbound stage", () => {
    test("redirects to cookie handover URL with correct parameters", () => {
      const result = handleOsRedirectInternal({
        currentUrl:
          "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-outbound",
        cookieHandoverUrl: "https://cin3.cps.gov.uk/polaris",
        tokenHandoverUrl:
          "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
      });

      expect(result.stage).toBe("os-outbound");
      const url = new URL(result.nextUrl);
      expect(url.origin + url.pathname).toBe("https://cin3.cps.gov.uk/polaris");

      const returnUrl = new URL(url.searchParams.get("r")!);
      expect(returnUrl.searchParams.get("stage")).toBe("os-cookie-return");
      expect(returnUrl.searchParams.get("r")).toBe(
        "https://example.com/target",
      );
    });

    test("preserves additional parameters in return URL", () => {
      const result = handleOsRedirectInternal({
        currentUrl:
          "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-outbound&extra=value",
        cookieHandoverUrl: "https://cin3.cps.gov.uk/polaris",
        tokenHandoverUrl:
          "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
      });

      const url = new URL(result.nextUrl);
      const returnUrl = new URL(url.searchParams.get("r")!);
      expect(returnUrl.searchParams.get("extra")).toBe("value");
      expect(returnUrl.searchParams.get("stage")).toBe("os-cookie-return");
    });

    test("strips cc parameter to prevent duplicate parameters (FCT2-10942)", () => {
      const result = handleOsRedirectInternal({
        currentUrl:
          "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-outbound&cc=existing-cookies",
        cookieHandoverUrl: "https://cin3.cps.gov.uk/polaris",
        tokenHandoverUrl:
          "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
      });

      const url = new URL(result.nextUrl);
      expect(url.origin + url.pathname).toBe("https://cin3.cps.gov.uk/polaris");

      const returnUrl = new URL(url.searchParams.get("r")!);
      expect(returnUrl.searchParams.get("stage")).toBe("os-cookie-return");
      expect(returnUrl.searchParams.get("r")).toBe(
        "https://example.com/target",
      );
      // The cc parameter should be stripped from the return URL
      expect(returnUrl.searchParams.get("cc")).toBeNull();
    });
  });

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
        cookieHandoverUrl: "https://cin3.cps.gov.uk/polaris",
        tokenHandoverUrl:
          "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
      });

      expect(result.stage).toBe("os-cookie-return");
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
        cookieHandoverUrl: "https://cin3.cps.gov.uk/polaris",
        tokenHandoverUrl:
          "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
      });

      expect(result.stage).toBe("os-cookie-return");
      expect(result.nextUrl).toBe("https://example.com/target");
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
        cookieHandoverUrl: "https://cin3.cps.gov.uk/polaris",
        tokenHandoverUrl:
          "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
      });

      expect(result.nextUrl).toBe("https://example.com/target");
    });

    test("redirects to token handover when localStorage cookies are undefined", () => {
      const result = handleOsRedirectInternal({
        currentUrl:
          "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-cookie-return&cc=test-cookies",
        cookieHandoverUrl: "https://cin3.cps.gov.uk/polaris",
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
        cookieHandoverUrl: "https://cin3.cps.gov.uk/polaris",
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
        cookieHandoverUrl: "https://cin3.cps.gov.uk/polaris",
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
        cookieHandoverUrl: "https://cin3.cps.gov.uk/polaris",
        tokenHandoverUrl:
          "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
      });

      expect(result.stage).toBe("os-token-return");
      expect(result.nextUrl).toBe("https://example.com/target");

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
        cookieHandoverUrl: "https://cin3.cps.gov.uk/polaris",
        tokenHandoverUrl:
          "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
      });

      expect(result.nextUrl).toBe(targetWithQuery);
    });

    test("handles empty token value", () => {
      const result = handleOsRedirectInternal({
        currentUrl:
          "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-token-return&cc=test-cookies&cms-modern-token=",
        cookieHandoverUrl: "https://cin3.cps.gov.uk/polaris",
        tokenHandoverUrl:
          "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
      });

      expect(result.nextUrl).toBe("https://example.com/target");

      // Verify empty token is stored
      const storedJson = JSON.parse(localStorage["$OS_Users$WorkManagementApp$ClientVars$JSONString"]);
      expect(storedJson.Token).toBe("");
    });
  });

  describe("unknown stage", () => {
    test("throws error for unknown stage", () => {
      expect(() => {
        handleOsRedirectInternal({
          currentUrl:
            "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=unknown",
          cookieHandoverUrl: "https://cin3.cps.gov.uk/polaris",
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
          cookieHandoverUrl: "https://cin3.cps.gov.uk/polaris",
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
          cookieHandoverUrl: "https://cin3.cps.gov.uk/polaris",
          tokenHandoverUrl:
            "https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token",
        });
      }).toThrow("Unknown stage query parameter: empty");
    });
  });
});
