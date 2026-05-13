import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import type { CmsAuthStorageKeys } from "cps-global-configuration";

jest.mock("cps-global-auth", () => ({
  handleMsalLogin: jest.fn(),
  handleMsalTermination: jest.fn(),
}));
jest.mock("cps-global-os-handover", () => ({
  handleOsCookieReturn: jest.fn(),
  handleOsTokenReturn: jest.fn(),
}));

import { handleMsalLogin, handleMsalTermination } from "cps-global-auth";
import {
  handleOsCookieReturn,
  handleOsTokenReturn,
} from "cps-global-os-handover";
import { dispatchHandover, type HandoverConfig } from "./auth-handover";

const mockHandleMsalLogin = handleMsalLogin as jest.MockedFunction<
  typeof handleMsalLogin
>;
const mockHandleMsalTermination = handleMsalTermination as jest.MockedFunction<
  typeof handleMsalTermination
>;
const mockHandleOsCookieReturn = handleOsCookieReturn as jest.MockedFunction<
  typeof handleOsCookieReturn
>;
const mockHandleOsTokenReturn = handleOsTokenReturn as jest.MockedFunction<
  typeof handleOsTokenReturn
>;

const cmsAuthStorageKeys: CmsAuthStorageKeys = {
  WMA_JSON: "wma-json",
  WMA_COOKIES: "wma-cookies",
  CASE_REVIEW_JSON: "cr-json",
  CASE_REVIEW_COOKIES: "cr-cookies",
  HOME_JSON: "home-json",
  HOME_COOKIES: "home-cookies",
  HOME_IS_FROM_PROXY: "home-is-from-proxy",
};

const config: HandoverConfig = {
  AD_CLIENT_ID: "client-id",
  AD_TENANT_AUTHORITY: "https://login.microsoftonline.com/tenant",
  CMS_AUTH_STORAGE_KEYS: cmsAuthStorageKeys,
  tokenHandoverUrl: "https://polaris.example/auth-handover-cms-modern-token",
};

const makeWindow = (currentUrl: string) => {
  const url = new URL(currentUrl);
  return {
    location: {
      href: currentUrl,
      hostname: url.hostname,
      hash: url.hash,
      replace: jest.fn(),
    },
  } as unknown as Window;
};

describe("dispatchHandover", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  describe("os-cookie-return stage", () => {
    test("delegates to handleOsCookieReturn with tokenHandoverUrl and cmsAuthStorageKeys", async () => {
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=os-cookie-return&cc=abc&r=https%3A%2F%2Fexample.com%2Ftarget",
      );

      await dispatchHandover(win, config);

      expect(mockHandleOsCookieReturn).toHaveBeenCalledTimes(1);
      expect(mockHandleOsCookieReturn).toHaveBeenCalledWith(win, {
        tokenHandoverUrl: config.tokenHandoverUrl,
        cmsAuthStorageKeys,
      });
      expect(mockHandleOsTokenReturn).not.toHaveBeenCalled();
      expect(mockHandleMsalLogin).not.toHaveBeenCalled();
      expect(mockHandleMsalTermination).not.toHaveBeenCalled();
    });
  });

  describe("os-token-return stage", () => {
    test("delegates to handleOsTokenReturn with cmsAuthStorageKeys", async () => {
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=os-token-return&cc=abc&cms-modern-token=tok&r=https%3A%2F%2Fexample.com%2Ftarget",
      );

      await dispatchHandover(win, config);

      expect(mockHandleOsTokenReturn).toHaveBeenCalledTimes(1);
      expect(mockHandleOsTokenReturn).toHaveBeenCalledWith(win, {
        cmsAuthStorageKeys,
      });
      expect(mockHandleOsCookieReturn).not.toHaveBeenCalled();
    });
  });

  describe("ad-redirect stage", () => {
    test("dispatches to handleMsalTermination when the URL hash carries an AAD response", async () => {
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=https%3A%2F%2Fpolaris.example%2Fauth-handover.js&stage=ad-redirect#code=abc&state=xyz",
      );

      await dispatchHandover(win, config);

      expect(mockHandleMsalTermination).toHaveBeenCalledTimes(1);
      expect(mockHandleMsalTermination).toHaveBeenCalledWith(win, {
        clientId: "client-id",
        authority: "https://login.microsoftonline.com/tenant",
      });
      expect(mockHandleMsalLogin).not.toHaveBeenCalled();
    });

    test("dispatches to handleMsalLogin when there is no response hash (host-initiated entry)", async () => {
      const returnTo =
        "https://cps-tst.outsystemsenterprise.com/casework_blocks/home";
      const win = makeWindow(
        `https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=https%3A%2F%2Fpolaris.example%2Fauth-handover.js&stage=ad-redirect&returnTo=${encodeURIComponent(
          returnTo,
        )}`,
      );

      await dispatchHandover(win, config);

      expect(mockHandleMsalLogin).toHaveBeenCalledTimes(1);
      // redirectUri should keep ?src= and ?stage= but strip returnTo and any hash.
      expect(mockHandleMsalLogin).toHaveBeenCalledWith(
        win,
        {
          clientId: "client-id",
          authority: "https://login.microsoftonline.com/tenant",
        },
        returnTo,
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=https%3A%2F%2Fpolaris.example%2Fauth-handover.js&stage=ad-redirect",
      );
      expect(mockHandleMsalTermination).not.toHaveBeenCalled();
    });

    test("hash trumps action — termination wins even when returnTo is present (bounce-back)", async () => {
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ad-redirect&returnTo=https%3A%2F%2Fexample.com%2Fhome#code=abc&state=xyz",
      );

      await dispatchHandover(win, config);

      expect(mockHandleMsalTermination).toHaveBeenCalledTimes(1);
      expect(mockHandleMsalLogin).not.toHaveBeenCalled();
    });

    test("passes returnTo=null to handleMsalLogin when ?returnTo is absent", async () => {
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ad-redirect",
      );

      await dispatchHandover(win, config);

      expect(mockHandleMsalLogin).toHaveBeenCalledWith(
        win,
        expect.any(Object),
        null,
        expect.any(String),
      );
    });
  });

  describe("unknown / missing stage", () => {
    test("no-ops when stage is absent (direct access)", async () => {
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html",
      );

      await dispatchHandover(win, config);

      expect(mockHandleOsCookieReturn).not.toHaveBeenCalled();
      expect(mockHandleOsTokenReturn).not.toHaveBeenCalled();
      expect(mockHandleMsalLogin).not.toHaveBeenCalled();
      expect(mockHandleMsalTermination).not.toHaveBeenCalled();
    });

    test("no-ops on an unrecognised stage value", async () => {
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?stage=something-else",
      );

      await dispatchHandover(win, config);

      expect(mockHandleOsCookieReturn).not.toHaveBeenCalled();
      expect(mockHandleOsTokenReturn).not.toHaveBeenCalled();
      expect(mockHandleMsalLogin).not.toHaveBeenCalled();
      expect(mockHandleMsalTermination).not.toHaveBeenCalled();
    });
  });
});
