import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import { handleOsRedirectInternal, handleOsRedirect } from "./handle-os-redirect";

jest.mock("../core/get-cms-session-hint");

import { getCmsSessionHint } from "../core/get-cms-session-hint";

describe("handleOsRedirectInternal", () => {
  describe("os-cookie-return stage", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    test("returns target URL and stores auth data", () => {
      const mockDate = new Date("2024-01-15T10:00:00.000Z");
      jest.spyOn(global, "Date").mockImplementation(() => mockDate);

      const result = handleOsRedirectInternal(
        "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-cookie-return&cc=test-cookies&cms-modern-token=test-token",
      );

      expect(result.stage).toBe("os-cookie-return");
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
      const result = handleOsRedirectInternal(
        `https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=${encodeURIComponent(targetWithQuery)}&stage=os-cookie-return&cc=test-cookies&cms-modern-token=test-token`,
      );

      expect(result.nextUrl).toBe(targetWithQuery);
    });

    test("handles empty token value", () => {
      const result = handleOsRedirectInternal(
        "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-cookie-return&cc=test-cookies&cms-modern-token=",
      );

      expect(result.nextUrl).toBe("https://example.com/target");

      // Verify empty token is stored
      const storedJson = JSON.parse(localStorage["$OS_Users$WorkManagementApp$ClientVars$JSONString"]);
      expect(storedJson.Token).toBe("");
    });
  });

  describe("unknown stage", () => {
    test("throws error for unknown stage", () => {
      expect(() => {
        handleOsRedirectInternal(
          "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=unknown",
        );
      }).toThrow("Unknown stage query parameter: unknown");
    });

    test("throws error for missing stage", () => {
      expect(() => {
        handleOsRedirectInternal(
          "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target",
        );
      }).toThrow("Unknown stage query parameter: empty");
    });

    test("throws error for empty stage value", () => {
      expect(() => {
        handleOsRedirectInternal(
          "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=",
        );
      }).toThrow("Unknown stage query parameter: empty");
    });
  });
});

const mockGetCmsSessionHint = getCmsSessionHint as jest.MockedFunction<
  typeof getCmsSessionHint
>;

describe("handleOsRedirect", () => {
  const makeWindow = (currentUrl: string) =>
    ({
      location: {
        href: currentUrl,
        replace: jest.fn(),
      },
    }) as unknown as Window;

  beforeEach(() => {
    localStorage.clear();
    mockGetCmsSessionHint.mockReset();
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  describe("handleSettingCmsSessionHint", () => {
    test("does not call getCmsSessionHint when nextUrl is not under /casework_blocks/", async () => {
      const win = makeWindow(
        "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/WorkManagementApp/page&stage=os-cookie-return&cc=test-cookies&cms-modern-token=test-token",
      );

      await handleOsRedirect(win);

      expect(mockGetCmsSessionHint).not.toHaveBeenCalled();
    });

    test("fetches and stores CmsSessionHint for os-cookie-return with /Casework_Blocks/ path", async () => {
      const hint = {
        cmsDomains: ["example.com"],
        isProxySession: true,
        handoverEndpoint: null,
      };
      mockGetCmsSessionHint.mockResolvedValue(hint);

      const win = makeWindow(
        "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/Casework_Blocks/Home&stage=os-cookie-return&cc=test-cookies&cms-modern-token=test-token",
      );

      await handleOsRedirect(win);

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
        "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/Casework_Blocks/Home&stage=os-cookie-return&cc=test-cookies&cms-modern-token=test-token",
      );

      await handleOsRedirect(win);

      expect(
        localStorage["$OS_Users$Casework_Blocks$ClientVars$IsFromProxy"],
      ).toBe("false");
    });

    test("does not block redirect when getCmsSessionHint throws", async () => {
      mockGetCmsSessionHint.mockRejectedValue(new Error("network failure"));

      const win = makeWindow(
        "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/Casework_Blocks/Home&stage=os-cookie-return&cc=test-cookies&cms-modern-token=test-token",
      );

      await handleOsRedirect(win);

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
        "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/casework_blocks/Home&stage=os-cookie-return&cc=test-cookies&cms-modern-token=test-token",
      );

      await handleOsRedirect(win);

      expect(mockGetCmsSessionHint).toHaveBeenCalledTimes(1);
    });

    test("always calls window.location.replace with the correct nextUrl", async () => {
      mockGetCmsSessionHint.mockResolvedValue({
        cmsDomains: [],
        isProxySession: false,
        handoverEndpoint: null,
      });

      const win = makeWindow(
        "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/Casework_Blocks/Home&stage=os-cookie-return&cc=test-cookies&cms-modern-token=test-token",
      );

      await handleOsRedirect(win);

      expect(win.location.replace).toHaveBeenCalledWith(
        "https://example.com/Casework_Blocks/Home",
      );
    });
  });
});
