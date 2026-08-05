import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import type { CmsAuthStorageKeys, Config } from "cps-global-configuration";

jest.mock("cps-global-auth", () => ({
  handleMsalLogin: jest.fn(),
  handleMsalTermination: jest.fn(),
  handleMsalEnsureAd: jest.fn(),
  // resolveReturnTo is a pure helper — keep its real implementation so the
  // mediator's same-origin validation actually runs in tests.
  resolveReturnTo: jest.requireActual<typeof import("cps-global-auth")>("cps-global-auth").resolveReturnTo,
}));
jest.mock("cps-global-os-handover", () => ({
  handleOsCookieReturn: jest.fn(),
  handleOsTokenReturn: jest.fn(),
}));
// Mock fetchConfig so tests can supply config directly without sharing
// global.fetch with the authHint fetches. Everything else from
// cps-global-configuration (schemas, constants, fetchState) is real.
jest.mock("cps-global-configuration", () => {
  const actual = jest.requireActual<typeof import("cps-global-configuration")>(
    "cps-global-configuration",
  );
  return {
    ...actual,
    fetchConfig: jest.fn(),
    // Real implementation by default (restored in beforeEach). The redirect
    // allowlist is unreachable through the real transposition — that is the
    // point of it — so the only way to prove the guard bites is to make this
    // return a host it should never produce.
    applyRegionToString: jest.fn(),
  };
});

// global.fetch mock — used only for the authHint lookup and write-back
// (config fetching is mocked separately via fetchConfig).
const mockFetch = jest.fn<(input: unknown, init?: RequestInit) => Promise<unknown>>();
global.fetch = mockFetch as unknown as typeof fetch;

import { applyRegionToString, fetchConfig } from "cps-global-configuration";
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

const mockFetchConfig = fetchConfig as jest.MockedFunction<typeof fetchConfig>;

const mockApplyRegionToString = applyRegionToString as jest.MockedFunction<
  typeof applyRegionToString
>;
const realApplyRegionToString = jest.requireActual<
  typeof import("cps-global-configuration")
>("cps-global-configuration").applyRegionToString;

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
// FEATURE_FLAG_USE_MSAL_FULL_REDIRECT_USERS defaults to generally-available so the
// AD-cascade path is exercised; tests that need the short-circuit override it off.
const config = {
  AD_CLIENT_ID: "client-id",
  AD_TENANT_AUTHORITY: "https://login.microsoftonline.com/tenant",
  AD_GATEWAY_SCOPES: ["User.Read"],
  CMS_AUTH_STORAGE_KEYS: cmsAuthStorageKeys,
  FEATURE_FLAG_USE_MSAL_FULL_REDIRECT_USERS: { generallyAvailable: true },
} as Config;

const scriptUrl = new URL(
  "https://polaris.example/global-components/test/auth-handover.js",
);

const makeWindow = (currentUrl: string) => {
  const url = new URL(currentUrl);
  return {
    location: {
      href: currentUrl,
      origin: url.origin,
      hostname: url.hostname,
      hash: url.hash,
      replace: jest.fn(),
    },
    localStorage: {
      setItem: jest.fn(),
      getItem: jest.fn(),
    },
  } as unknown as Window;
};

describe("dispatchHandover", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    // clearAllMocks doesn't drop implementations, so restore the real
    // transposition explicitly — otherwise the allowlist test below leaks.
    mockApplyRegionToString.mockImplementation(realApplyRegionToString);
    // Default outcomes for sub-modules. Per-test setup overrides as needed.
    mockHandleMsalTermination.mockResolvedValue({ outcome: "handled" });
    mockHandleOsCookieReturn.mockReturnValue({
      kind: "ready",
      target: "https://example.com/target",
    });
    mockHandleOsTokenReturn.mockResolvedValue({
      kind: "ready",
      target: "https://example.com/target",
    });
    mockHandleMsalEnsureAd.mockResolvedValue("silent-success");
    // dispatchHandover fetches config internally; default it to the test config.
    mockFetchConfig.mockResolvedValue({
      ok: true,
      json: async () => config,
    } as never);
  });

  // Override the configured response for a single test (e.g. to flip a
  // feature flag on). Affects only the next dispatchHandover invocation.
  const withConfigOverrides = (overrides: Partial<Config>) =>
    mockFetchConfig.mockResolvedValue({
      ok: true,
      json: async () => ({ ...config, ...overrides }),
    } as never);

  describe("os-cookie-return stage", () => {
    test("on kind:ready, navigates straight to target — OS handover is decoupled from AD (kill switch off)", async () => {
      mockHandleOsCookieReturn.mockReturnValue({
        kind: "ready",
        target: "https://cps-tst.outsystemsenterprise.com/casework_blocks/home",
      });
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=https%3A%2F%2Fpolaris.example%2Fauth-handover.js&stage=os-cookie-return&cc=abc&r=https%3A%2F%2Fcps-tst.outsystemsenterprise.com%2Fcasework_blocks%2Fhome",
      );

      await dispatchHandover(win, scriptUrl);

      expect(mockHandleOsCookieReturn).toHaveBeenCalledWith(win, {
        tokenHandoverUrl: "https://polaris.example/auth-refresh-cms-modern-token",
        cmsAuthStorageKeys,
      });
      expect(mockHandleMsalEnsureAd).not.toHaveBeenCalled();
      expect(win.location.replace).toHaveBeenCalledWith(
        "https://cps-tst.outsystemsenterprise.com/casework_blocks/home",
      );
    });

    test("on kind:needs-token navigates directly to the token-handover href returned by the OS handler", async () => {
      mockHandleOsCookieReturn.mockReturnValue({
        kind: "needs-token",
        href: "https://polaris.example/auth-handover-cms-modern-token?cc=x&r=y",
      });
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=os-cookie-return&cc=x&r=y",
      );

      await dispatchHandover(win, scriptUrl);

      expect(mockHandleMsalEnsureAd).not.toHaveBeenCalled();
      expect(win.location.replace).toHaveBeenCalledWith(
        "https://polaris.example/auth-handover-cms-modern-token?cc=x&r=y",
      );
    });
  });

  describe("os-token-return stage", () => {
    test("navigates straight to stored target — OS handover is decoupled from AD (kill switch off)", async () => {
      mockHandleOsTokenReturn.mockResolvedValue({
        kind: "ready",
        target: "https://cps-tst.outsystemsenterprise.com/casework_blocks/home",
      });
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=https%3A%2F%2Fpolaris.example%2Fauth-handover.js&stage=os-token-return&cc=abc&cms-modern-token=tok&r=https%3A%2F%2Fcps-tst.outsystemsenterprise.com%2Fcasework_blocks%2Fhome",
      );

      await dispatchHandover(win, scriptUrl);

      expect(mockHandleOsTokenReturn).toHaveBeenCalledWith(win, {
        cmsAuthStorageKeys,
      });
      expect(mockHandleMsalEnsureAd).not.toHaveBeenCalled();
      expect(win.location.replace).toHaveBeenCalledWith(
        "https://cps-tst.outsystemsenterprise.com/casework_blocks/home",
      );
    });
  });

  describe("ensure-ad stage", () => {
    test("delegates to handleMsalEnsureAd with the returnTo and an ad-redirect-shaped redirectUri", async () => {
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=https%3A%2F%2Fpolaris.example%2Fauth-handover.js&stage=ensure-ad&returnTo=https%3A%2F%2Fexample.com%2Fdeep%2Flink",
      );

      await dispatchHandover(win, scriptUrl);

      expect(mockHandleMsalEnsureAd).toHaveBeenCalledWith(
        win,
        {
          clientId: "client-id",
          authority: "https://login.microsoftonline.com/tenant",
        },
        "https://example.com/deep/link",
        // stage swapped to ad-redirect for the AAD bounce-back routing, src preserved.
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=https%3A%2F%2Fpolaris.example%2Fauth-handover.js&stage=ad-redirect",
        ["User.Read"],
      );
    });

    test("on silent-success the mediator (not the auth handler) navigates to returnTo", async () => {
      mockHandleMsalEnsureAd.mockResolvedValue("silent-success");
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ensure-ad&returnTo=https%3A%2F%2Fcps-tst.outsystemsenterprise.com%2Fcasework_blocks%2Fhome",
      );

      await dispatchHandover(win, scriptUrl);

      expect(win.location.replace).toHaveBeenCalledWith(
        "https://cps-tst.outsystemsenterprise.com/casework_blocks/home",
      );
    });

    test("on silent-success with cross-origin returnTo, mediator falls back to handover origin root", async () => {
      mockHandleMsalEnsureAd.mockResolvedValue("silent-success");
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ensure-ad&returnTo=https%3A%2F%2Fevil.example%2Fphish",
      );

      await dispatchHandover(win, scriptUrl);

      expect(win.location.replace).toHaveBeenCalledWith(
        "https://cps-tst.outsystemsenterprise.com/",
      );
    });

    test("on redirect-initiated the mediator does not navigate (MSAL is driving)", async () => {
      mockHandleMsalEnsureAd.mockResolvedValue("redirect-initiated");
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ensure-ad&returnTo=https%3A%2F%2Fexample.com%2Ftarget",
      );

      await dispatchHandover(win, scriptUrl);

      expect(win.location.replace).not.toHaveBeenCalled();
    });

    test("passes returnTo=null when ?returnTo is absent", async () => {
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ensure-ad",
      );

      await dispatchHandover(win, scriptUrl);

      expect(mockHandleMsalEnsureAd).toHaveBeenCalledWith(
        win,
        expect.any(Object),
        null,
        expect.any(String),
        ["User.Read"],
      );
    });
  });

  describe("ad-redirect stage", () => {
    test("dispatches to handleMsalTermination when the URL hash carries an AAD response", async () => {
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=https%3A%2F%2Fpolaris.example%2Fauth-handover.js&stage=ad-redirect#code=abc&state=xyz",
      );

      await dispatchHandover(win, scriptUrl);

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

      await dispatchHandover(win, scriptUrl);

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
        ["User.Read"],
      );
      expect(mockHandleMsalTermination).not.toHaveBeenCalled();
    });

    test("hash trumps action — termination wins even when returnTo is present (bounce-back)", async () => {
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ad-redirect&returnTo=https%3A%2F%2Fexample.com%2Fhome#code=abc&state=xyz",
      );

      await dispatchHandover(win, scriptUrl);

      expect(mockHandleMsalTermination).toHaveBeenCalledTimes(1);
      expect(mockHandleMsalLogin).not.toHaveBeenCalled();
    });

    test("passes returnTo=null to handleMsalLogin when ?returnTo is absent", async () => {
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ad-redirect",
      );

      await dispatchHandover(win, scriptUrl);

      expect(mockHandleMsalLogin).toHaveBeenCalledWith(
        win,
        expect.any(Object),
        null,
        expect.any(String),
        ["User.Read"],
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

      await dispatchHandover(win, scriptUrl);

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

      await dispatchHandover(win, scriptUrl);

      expect(win.location.replace).toHaveBeenCalledWith(
        "https://cps-tst.outsystemsenterprise.com/casework_blocks/home",
      );
    });

    test("on failed termination with no returnTo, does not navigate (user left on handover page)", async () => {
      mockHandleMsalTermination.mockResolvedValue({ outcome: "handled-with-error" });
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ad-redirect#error=invalid",
      );

      await dispatchHandover(win, scriptUrl);

      expect(win.location.replace).not.toHaveBeenCalled();
    });
  });

  describe("auth-hint write-back (drop 10)", () => {
    test("on successful termination, PUTs a fresh AuthHint with the new sid", async () => {
      mockHandleMsalTermination.mockResolvedValue({
        outcome: "handled",
        account: {
          homeAccountId: "h",
          environment: "e",
          tenantId: "t",
          username: "Stefan.Stachow@cps.gov.uk",
          localAccountId: "obj-123",
          idTokenClaims: { groups: ["g1", "g2"] },
        } as never,
        sid: "session-id-abc",
        me: { department: "Innovation" },
        returnTo: "https://cps-tst.outsystemsenterprise.com/casework_blocks/home",
      });
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ad-redirect#code=abc",
      );

      await dispatchHandover(win, scriptUrl);

      const putCall = mockFetch.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === "PUT",
      );
      expect(putCall).toBeDefined();
      expect(String(putCall![0])).toMatch(/\/state\/auth-hint$/);
      const init = putCall![1] as RequestInit;
      expect(init.credentials).toBe("include");
      const body = JSON.parse(init.body as string);
      expect(body.authResult.username).toBe("stefan.stachow@cps.gov.uk");
      expect(body.authResult.objectId).toBe("obj-123");
      expect(body.authResult.groups).toEqual(["g1", "g2"]);
      // The /me slice fetched on the bounce-back is baked into the written hint
      // so the host reads department without re-hitting Graph.
      expect(body.authResult.me).toEqual({ department: "Innovation" });
      expect(body.lastKnownSid).toBe("session-id-abc");
      expect(typeof body.timestamp).toBe("number");
    });

    test("on successful termination without sid, still PUTs but omits lastKnownSid", async () => {
      mockHandleMsalTermination.mockResolvedValue({
        outcome: "handled",
        account: {
          username: "u",
          localAccountId: "l",
          idTokenClaims: {},
        } as never,
        // sid intentionally undefined — tenant might not emit it
      });
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ad-redirect#code=abc",
      );

      await dispatchHandover(win, scriptUrl);

      const putCall = mockFetch.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === "PUT",
      );
      expect(putCall).toBeDefined();
      const body = JSON.parse((putCall![1] as RequestInit).body as string);
      expect(body.lastKnownSid).toBeUndefined();
    });

    test("on failed termination, skips the write-back", async () => {
      mockHandleMsalTermination.mockResolvedValue({
        outcome: "handled-with-error",
      });
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ad-redirect#error=invalid",
      );

      await dispatchHandover(win, scriptUrl);

      const putCall = mockFetch.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === "PUT",
      );
      expect(putCall).toBeUndefined();
    });

    test("skips the write-back when account is missing required fields", async () => {
      mockHandleMsalTermination.mockResolvedValue({
        outcome: "handled",
        account: { idTokenClaims: {} } as never, // no username, no localAccountId
      });
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ad-redirect#code=abc",
      );

      await dispatchHandover(win, scriptUrl);

      const putCall = mockFetch.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === "PUT",
      );
      expect(putCall).toBeUndefined();
    });
  });

  describe("entra-id OS ClientVar write (FCT2-21199)", () => {
    const handledWithObjectId = (localAccountId: string) =>
      mockHandleMsalTermination.mockResolvedValue({
        outcome: "handled",
        account: {
          username: "u",
          localAccountId,
          idTokenClaims: {},
        } as never,
        returnTo: "https://cps-tst.outsystemsenterprise.com/casework_blocks/home",
      });

    test("writes the Entra objectId to the configured key on successful termination", async () => {
      withConfigOverrides({
        OS_ENTRA_ID_STORAGE_KEY: "$OS_Users$Casework_Blocks$ClientVars$EntraID",
      });
      handledWithObjectId("obj-123");
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ad-redirect#code=abc",
      );

      await dispatchHandover(win, scriptUrl);

      expect(win.localStorage.setItem).toHaveBeenCalledWith(
        "$OS_Users$Casework_Blocks$ClientVars$EntraID",
        "obj-123",
      );
    });

    test("no-op when the config key is absent (feature off)", async () => {
      // Base config has no OS_ENTRA_ID_STORAGE_KEY.
      handledWithObjectId("obj-123");
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ad-redirect#code=abc",
      );

      await dispatchHandover(win, scriptUrl);

      expect(win.localStorage.setItem).not.toHaveBeenCalled();
    });

    test("no-op on failed termination (no account, so no objectId)", async () => {
      withConfigOverrides({
        OS_ENTRA_ID_STORAGE_KEY: "$OS_Users$Casework_Blocks$ClientVars$EntraID",
      });
      mockHandleMsalTermination.mockResolvedValue({ outcome: "handled-with-error" });
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ad-redirect#error=invalid",
      );

      await dispatchHandover(win, scriptUrl);

      expect(win.localStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe("feature-flag gate (shouldUseFullPageMsalRedirect)", () => {
    // Applies only to the ENSURE_AD branch. The OS handover branches no
    // longer route through runEnsureAd at all (the kill switch keeps them
    // decoupled from AD), so the FF gate is irrelevant there.

    test("ensure-ad: when FF is off, navigates straight to (validated) returnTo without calling handleMsalEnsureAd", async () => {
      withConfigOverrides({ FEATURE_FLAG_USE_MSAL_FULL_REDIRECT_USERS: undefined });
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ensure-ad&returnTo=https%3A%2F%2Fcps-tst.outsystemsenterprise.com%2Fcasework_blocks%2Fhome",
      );

      await dispatchHandover(win, scriptUrl);

      expect(mockHandleMsalEnsureAd).not.toHaveBeenCalled();
      expect(win.location.replace).toHaveBeenCalledWith(
        "https://cps-tst.outsystemsenterprise.com/casework_blocks/home",
      );
    });

    test("ensure-ad: preview override enables the AD cascade even when config flag is off", async () => {
      withConfigOverrides({ FEATURE_FLAG_USE_MSAL_FULL_REDIRECT_USERS: undefined });
      mockFetch.mockImplementation(async (input: unknown) => {
        const url = String(input);
        if (url.includes("/state/preview")) {
          return {
            ok: true,
            json: async () => ({ useFullPageMsalRedirect: true }),
          } as never;
        }
        return { ok: false, status: 404, statusText: "Not Found" } as never;
      });
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=ensure-ad&returnTo=https%3A%2F%2Fcps-tst.outsystemsenterprise.com%2Fcasework_blocks%2Fhome",
      );

      await dispatchHandover(win, scriptUrl);

      expect(mockHandleMsalEnsureAd).toHaveBeenCalledTimes(1);
    });
  });

  describe("region override redirect (FCT2-20670)", () => {
    const withPreview = (preview: unknown) =>
      mockFetch.mockImplementation(async (input: unknown) =>
        String(input).includes("/state/preview")
          ? ({ ok: true, json: async () => preview } as never)
          : ({ ok: false, status: 404, statusText: "Not Found" } as never),
      );

    test("moves a Dublin user to London, transposing the host and every OS param", async () => {
      withPreview({ region: "london" });
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?stage=ensure-ad&returnTo=https%3A%2F%2Fcps-tst.outsystemsenterprise.com%2Fcasework_blocks%2Fhome",
      );

      await dispatchHandover(win, scriptUrl);

      const target = new URL(
        (win.location.replace as jest.Mock).mock.calls[0][0] as string,
      );
      expect(target.hostname).toBe("cpslon-tst.outsystemsenterprise.com");
      // returnTo has to come across too — resolveReturnTo demands same-origin,
      // so a Dublin returnTo would be rejected once we land on London.
      expect(target.searchParams.get("returnTo")).toBe(
        "https://cpslon-tst.outsystemsenterprise.com/casework_blocks/home",
      );
      expect(target.searchParams.get("stage")).toBe("ensure-ad");
    });

    test("redirects before the stage is dispatched — handover storage doesn't cross origins", async () => {
      withPreview({ region: "london" });
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?stage=os-cookie-return&cc=abc",
      );

      await dispatchHandover(win, scriptUrl);

      expect(mockHandleOsCookieReturn).not.toHaveBeenCalled();
      expect(win.location.replace).toHaveBeenCalledTimes(1);
    });

    test.each([
      ["already on London", "https://cpslon-tst.outsystemsenterprise.com"],
      ["the polaris-served variant, not an OS host", "https://polaris.example"],
    ])("does not redirect when %s", async (_label, origin) => {
      withPreview({ region: "london" });
      const win = makeWindow(
        `${origin}/Casework_Patterns/auth-handover.html?stage=ensure-ad`,
      );

      await dispatchHandover(win, scriptUrl);

      expect(mockHandleMsalEnsureAd).toHaveBeenCalledTimes(1);
    });

    test.each([
      ["there is no region override", {}],
      ["the region is frontDoor, which has no host yet", { region: "frontDoor" }],
    ])("does not redirect when %s", async (_label, preview) => {
      withPreview(preview);
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?stage=ensure-ad",
      );

      await dispatchHandover(win, scriptUrl);

      expect(mockHandleMsalEnsureAd).toHaveBeenCalledTimes(1);
    });

    // The allowlist exists for the day a region's host comes from config (the
    // front-door option) rather than from the origin we're already on. Forcing
    // a bad transposition is the only way to reach it.
    test("fails closed on an off-domain host, dispatching normally instead", async () => {
      withPreview({ region: "london" });
      mockApplyRegionToString.mockImplementation(() => "https://evil.example");
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?stage=ensure-ad&returnTo=https%3A%2F%2Fcps-tst.outsystemsenterprise.com%2Fhome",
      );

      await dispatchHandover(win, scriptUrl);

      expect(win.location.replace).not.toHaveBeenCalledWith(
        expect.stringContaining("evil.example"),
      );
      // Failing closed means the user still gets a working handover.
      expect(mockHandleMsalEnsureAd).toHaveBeenCalledTimes(1);
    });

    // Setting .host never changes the scheme, so target.protocol is always the
    // page's own — the guard is really "don't bounce an http page onward".
    test("fails closed when the page itself is not https", async () => {
      withPreview({ region: "london" });
      mockApplyRegionToString.mockImplementation(
        () => "https://cpslon-tst.outsystemsenterprise.com",
      );
      const win = makeWindow(
        "http://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?stage=ensure-ad",
      );

      await dispatchHandover(win, scriptUrl);

      expect(win.location.replace).not.toHaveBeenCalledWith(
        expect.stringContaining("cpslon-tst"),
      );
      expect(mockHandleMsalEnsureAd).toHaveBeenCalledTimes(1);
    });
  });

  describe("unknown / missing stage", () => {
    test("no-ops when stage is absent (direct access)", async () => {
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html",
      );

      await dispatchHandover(win, scriptUrl);

      expect(mockHandleOsCookieReturn).not.toHaveBeenCalled();
      expect(mockHandleOsTokenReturn).not.toHaveBeenCalled();
      expect(mockHandleMsalLogin).not.toHaveBeenCalled();
      expect(mockHandleMsalTermination).not.toHaveBeenCalled();
    });

    test("no-ops on an unrecognised stage value", async () => {
      const win = makeWindow(
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?stage=something-else",
      );

      await dispatchHandover(win, scriptUrl);

      expect(mockHandleOsCookieReturn).not.toHaveBeenCalled();
      expect(mockHandleOsTokenReturn).not.toHaveBeenCalled();
      expect(mockHandleMsalLogin).not.toHaveBeenCalled();
      expect(mockHandleMsalTermination).not.toHaveBeenCalled();
    });
  });
});
