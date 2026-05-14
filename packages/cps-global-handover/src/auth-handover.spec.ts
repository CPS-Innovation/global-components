import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import type { CmsAuthStorageKeys, Config } from "cps-global-configuration";

jest.mock("cps-global-auth", () => ({
  handleMsalLogin: jest.fn(),
  handleMsalTermination: jest.fn(),
  handleMsalEnsureAd: jest.fn(),
}));
jest.mock("cps-global-os-handover", () => ({
  handleOsCookieReturn: jest.fn(),
  handleOsTokenReturn: jest.fn(),
}));

// fetch mock — both for the beacon and for the authHint lookup on the
// failure branch. Per-test setup decides what each call resolves to.
const mockFetch = jest.fn<(input: unknown, init?: RequestInit) => Promise<unknown>>();
global.fetch = mockFetch as unknown as typeof fetch;

import {
  handleMsalEnsureAd,
  handleMsalLogin,
  handleMsalTermination,
} from "cps-global-auth";
import {
  handleOsCookieReturn,
  handleOsTokenReturn,
} from "cps-global-os-handover";
import { dispatchHandover } from "./auth-handover";

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
const mockHandleMsalEnsureAd = handleMsalEnsureAd as jest.MockedFunction<
  typeof handleMsalEnsureAd
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

// Cast — Config has many optional fields we don't need to set here.
const config = {
  AD_CLIENT_ID: "client-id",
  AD_TENANT_AUTHORITY: "https://login.microsoftonline.com/tenant",
  CMS_AUTH_STORAGE_KEYS: cmsAuthStorageKeys,
} as Config;

const scriptUrl = new URL(
  "https://polaris.example/global-components/test/auth-handover.js",
);

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
    // Default success outcome with no account / no returnTo — sufficient for
    // tests that don't care about the beacon / navigation paths.
    mockHandleMsalTermination.mockResolvedValue({ outcome: "handled" });
  });

  describe("os-cookie-return stage", () => {
    test("delegates to handleOsCookieReturn with tokenHandoverUrl and cmsAuthStorageKeys", async () => {
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=os-cookie-return&cc=abc&r=https%3A%2F%2Fexample.com%2Ftarget",
      );

      await dispatchHandover(win, config, scriptUrl);

      expect(mockHandleOsCookieReturn).toHaveBeenCalledTimes(1);
      expect(mockHandleOsCookieReturn).toHaveBeenCalledWith(win, {
        // Derived from scriptUrl.origin at dispatch time.
        tokenHandoverUrl: "https://polaris.example/auth-refresh-cms-modern-token",
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

      await dispatchHandover(win, config, scriptUrl);

      expect(mockHandleOsTokenReturn).toHaveBeenCalledTimes(1);
      expect(mockHandleOsTokenReturn).toHaveBeenCalledWith(win, {
        cmsAuthStorageKeys,
      });
      expect(mockHandleOsCookieReturn).not.toHaveBeenCalled();
    });
  });

  describe("ensure-ad stage", () => {
    test("delegates to handleMsalEnsureAd with the returnTo and an ad-redirect-shaped redirectUri", async () => {
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=https%3A%2F%2Fpolaris.example%2Fauth-handover.js&stage=ensure-ad&returnTo=https%3A%2F%2Fexample.com%2Fdeep%2Flink",
      );

      await dispatchHandover(win, config, scriptUrl);

      expect(mockHandleMsalEnsureAd).toHaveBeenCalledTimes(1);
      expect(mockHandleMsalEnsureAd).toHaveBeenCalledWith(
        win,
        {
          clientId: "client-id",
          authority: "https://login.microsoftonline.com/tenant",
        },
        "https://example.com/deep/link",
        // stage swapped to ad-redirect for the AAD bounce-back routing, src/srcs preserved.
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=https%3A%2F%2Fpolaris.example%2Fauth-handover.js&stage=ad-redirect",
      );
      expect(mockHandleMsalLogin).not.toHaveBeenCalled();
      expect(mockHandleMsalTermination).not.toHaveBeenCalled();
    });

    test("passes returnTo=null when ?returnTo is absent (handleMsalEnsureAd falls back to origin root)", async () => {
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ensure-ad",
      );

      await dispatchHandover(win, config, scriptUrl);

      expect(mockHandleMsalEnsureAd).toHaveBeenCalledWith(
        win,
        expect.any(Object),
        null,
        expect.any(String),
      );
    });
  });

  describe("ad-redirect stage", () => {
    test("dispatches to handleMsalTermination when the URL hash carries an AAD response", async () => {
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=https%3A%2F%2Fpolaris.example%2Fauth-handover.js&stage=ad-redirect#code=abc&state=xyz",
      );

      await dispatchHandover(win, config, scriptUrl);

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

      await dispatchHandover(win, config, scriptUrl);

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

      await dispatchHandover(win, config, scriptUrl);

      expect(mockHandleMsalTermination).toHaveBeenCalledTimes(1);
      expect(mockHandleMsalLogin).not.toHaveBeenCalled();
    });

    test("passes returnTo=null to handleMsalLogin when ?returnTo is absent", async () => {
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ad-redirect",
      );

      await dispatchHandover(win, config, scriptUrl);

      expect(mockHandleMsalLogin).toHaveBeenCalledWith(
        win,
        expect.any(Object),
        null,
        expect.any(String),
      );
    });

    test("on successful termination, navigates to returnTo via location.replace", async () => {
      mockHandleMsalTermination.mockResolvedValue({
        outcome: "handled",
        returnTo: "https://cps-tst.outsystemsenterprise.com/casework_blocks/home",
      });
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ad-redirect#code=abc",
      );

      await dispatchHandover(win, config, scriptUrl);

      expect(win.location.replace).toHaveBeenCalledWith(
        "https://cps-tst.outsystemsenterprise.com/casework_blocks/home",
      );
    });

    test("on failed termination with a surfaced returnTo, navigates back to the host page", async () => {
      // Termination surfaces returnTo on the failure path so the user lands on
      // the host's FailedAuth UI rather than a blank handover page. See
      // packages/cps-global-handover/AD-FAILURE-MODES.md.
      mockHandleMsalTermination.mockResolvedValue({
        outcome: "handled-with-error",
        returnTo: "https://cps-tst.outsystemsenterprise.com/casework_blocks/home",
      });
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ad-redirect#error=invalid",
      );

      await dispatchHandover(win, config, scriptUrl);

      expect(win.location.replace).toHaveBeenCalledWith(
        "https://cps-tst.outsystemsenterprise.com/casework_blocks/home",
      );
    });

    test("on failed termination with no returnTo, does not navigate (user left on handover page)", async () => {
      mockHandleMsalTermination.mockResolvedValue({ outcome: "handled-with-error" });
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ad-redirect#error=invalid",
      );

      await dispatchHandover(win, config, scriptUrl);

      expect(win.location.replace).not.toHaveBeenCalled();
    });
  });

  describe("ad-redirect beacon firing", () => {
    test("fires success beacon when SUCCESSES_ENABLED and termination returns an account with oid", async () => {
      mockHandleMsalTermination.mockResolvedValue({
        outcome: "handled",
        account: {
          homeAccountId: "h",
          environment: "e",
          tenantId: "t",
          username: "u",
          localAccountId: "l",
          idTokenClaims: { oid: "obj-success-123" },
        } as never,
        returnTo: "https://cps-tst.outsystemsenterprise.com/casework_blocks/home",
      });
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ad-redirect#code=abc",
      );

      await dispatchHandover(win, { ...config, BEACON_AD_REDIRECT_SUCCESSES_ENABLED: true } as Config, scriptUrl);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [calledUrl] = mockFetch.mock.calls[0]!;
      const parsed = new URL(String(calledUrl));
      expect(parsed.pathname).toMatch(/\/ad-redirect-beacon$/);
      expect(parsed.searchParams.get("outcome")).toBe("success");
      expect(parsed.searchParams.get("auth-hint-object-id")).toBe("obj-success-123");
    });

    test("does NOT fire success beacon when SUCCESSES_ENABLED is false (default)", async () => {
      mockHandleMsalTermination.mockResolvedValue({
        outcome: "handled",
        account: { idTokenClaims: { oid: "obj-1" } } as never,
      });
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ad-redirect#code=abc",
      );

      await dispatchHandover(win, config, scriptUrl);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    test("success beacon falls back to 'unknown' when account has no oid claim", async () => {
      mockHandleMsalTermination.mockResolvedValue({
        outcome: "handled",
        account: { idTokenClaims: {} } as never,
      });
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ad-redirect#code=abc",
      );

      await dispatchHandover(win, { ...config, BEACON_AD_REDIRECT_SUCCESSES_ENABLED: true } as Config, scriptUrl);

      const [calledUrl] = mockFetch.mock.calls[0]!;
      expect(new URL(String(calledUrl)).searchParams.get("auth-hint-object-id")).toBe("unknown");
    });

    test("fires failure beacon when FAILURES_ENABLED and authHint fetch returns an objectId", async () => {
      mockHandleMsalTermination.mockResolvedValue({ outcome: "handled-with-error" });
      // authHint fetch — full AuthHintSchema shape (AuthSchema requires isAuthed,
      // username, objectId, groups).
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authResult: {
            isAuthed: true,
            username: "user@example.com",
            objectId: "obj-failure-456",
            groups: [],
          },
          timestamp: 1,
        }),
      } as never);
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ad-redirect#error=invalid",
      );

      await dispatchHandover(win, { ...config, BEACON_AD_REDIRECT_FAILURES_ENABLED: true } as Config, scriptUrl);

      // Two fetches: authHint lookup + the beacon itself
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const beaconUrl = new URL(String(mockFetch.mock.calls[1]![0]));
      expect(beaconUrl.searchParams.get("outcome")).toBe("failure");
      expect(beaconUrl.searchParams.get("auth-hint-object-id")).toBe("obj-failure-456");
    });

    test("failure beacon falls back to 'unknown' when authHint fetch fails", async () => {
      mockHandleMsalTermination.mockResolvedValue({ outcome: "handled-with-error" });
      mockFetch.mockRejectedValueOnce(new Error("CORS blocked"));
      // Second call (the beacon itself) — succeed silently
      mockFetch.mockResolvedValueOnce({ ok: true } as never);
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ad-redirect#error=invalid",
      );

      await dispatchHandover(win, { ...config, BEACON_AD_REDIRECT_FAILURES_ENABLED: true } as Config, scriptUrl);

      const beaconUrl = new URL(String(mockFetch.mock.calls[1]![0]));
      expect(beaconUrl.searchParams.get("auth-hint-object-id")).toBe("unknown");
    });

    test("does NOT fire failure beacon when FAILURES_ENABLED is false (default)", async () => {
      mockHandleMsalTermination.mockResolvedValue({ outcome: "handled-with-error" });
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ad-redirect#error=invalid",
      );

      await dispatchHandover(win, config, scriptUrl);

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("unknown / missing stage", () => {
    test("no-ops when stage is absent (direct access)", async () => {
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html",
      );

      await dispatchHandover(win, config, scriptUrl);

      expect(mockHandleOsCookieReturn).not.toHaveBeenCalled();
      expect(mockHandleOsTokenReturn).not.toHaveBeenCalled();
      expect(mockHandleMsalLogin).not.toHaveBeenCalled();
      expect(mockHandleMsalTermination).not.toHaveBeenCalled();
    });

    test("no-ops on an unrecognised stage value", async () => {
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?stage=something-else",
      );

      await dispatchHandover(win, config, scriptUrl);

      expect(mockHandleOsCookieReturn).not.toHaveBeenCalled();
      expect(mockHandleOsTokenReturn).not.toHaveBeenCalled();
      expect(mockHandleMsalLogin).not.toHaveBeenCalled();
      expect(mockHandleMsalTermination).not.toHaveBeenCalled();
    });
  });
});
