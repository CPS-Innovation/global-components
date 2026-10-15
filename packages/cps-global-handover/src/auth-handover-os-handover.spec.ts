import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import type { CmsAuthStorageKeys, Config } from "cps-global-configuration";

// End-to-end through the dispatcher with the REAL cps-global-os-handover and
// jsdom localStorage — only config fetching (and the unrelated MSAL module) is
// mocked. Proves the one-page-load path when Polaris /init has appended the
// modern token to the os-cookie-return URL, and that its absence still bounces.

jest.mock("cps-global-auth", () => ({
  handleMsalLogin: jest.fn(),
  handleMsalTermination: jest.fn(),
  handleMsalEnsureAd: jest.fn(),
  resolveReturnTo:
    jest.requireActual<typeof import("cps-global-auth")>("cps-global-auth")
      .resolveReturnTo,
}));
jest.mock("cps-global-configuration", () => {
  const actual = jest.requireActual<typeof import("cps-global-configuration")>(
    "cps-global-configuration",
  );
  const fetchConfig = jest.fn<typeof actual.fetchConfig>();
  return {
    ...actual,
    fetchConfig,
    loadConfig: (configUrl: string) =>
      actual.loadConfig(configUrl, [fetchConfig]),
  };
});

import { fetchConfig } from "cps-global-configuration";
import { dispatchHandover } from "./auth-handover";

const mockFetchConfig = fetchConfig as jest.MockedFunction<typeof fetchConfig>;

const cmsAuthStorageKeys: CmsAuthStorageKeys = {
  WMA_JSON: "wma-json",
  WMA_COOKIES: "wma-cookies",
  CASE_REVIEW_JSON: "cr-json",
  CASE_REVIEW_COOKIES: "cr-cookies",
  HOME_JSON: "home-json",
  HOME_COOKIES: "home-cookies",
  HOME_IS_FROM_PROXY: "home-is-from-proxy",
};

const config: Config = {
  ENVIRONMENT: "test",
  LINKS: [],
  BANNER_TITLE_HREF: "https://example.com",
  CONTEXTS: [],
  AD_GATEWAY_SCOPES: [],
  CMS_AUTH_STORAGE_KEYS: cmsAuthStorageKeys,
};

const scriptUrl = new URL(
  "https://polaris.example/global-components/test/auth-handover.js",
);

// Not an OS home path, so stage 2 skips the cms-session-hint fetch.
const target = "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/TaskList";
const tasklistFilterKey =
  "$OS_Users$WorkManagementApp$ClientVars$TaskFilters_URN";

const handoverUrl = (query: string) =>
  `https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=x&stage=os-cookie-return&r=${encodeURIComponent(target)}${query}`;

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
    localStorage,
  } as unknown as Window;
};

const storedToken = () =>
  JSON.parse(localStorage[cmsAuthStorageKeys.WMA_JSON]).Token;

describe("os-cookie-return end-to-end (real os-handover)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  const withConfig = (overrides: Partial<Config> = {}) =>
    mockFetchConfig.mockResolvedValue({
      ok: true,
      json: async () => ({ ...config, ...overrides }),
    } as never);

  test("with the token appended: stores auth and lands at target in one page load", async () => {
    withConfig();
    const win = makeWindow(
      handoverUrl("&cc=fresh-cookies&cms-modern-token=fresh-token"),
    );

    await dispatchHandover(win, scriptUrl);

    expect(win.location.replace).toHaveBeenCalledTimes(1);
    expect(win.location.replace).toHaveBeenCalledWith(target);
    expect(localStorage[cmsAuthStorageKeys.WMA_COOKIES]).toBe("fresh-cookies");
    expect(localStorage[cmsAuthStorageKeys.HOME_COOKIES]).toBe("fresh-cookies");
    expect(storedToken()).toBe("fresh-token");
  });

  test("without the token and with changed cookies: still bounces via the token-handover endpoint", async () => {
    withConfig();
    const win = makeWindow(handoverUrl("&cc=fresh-cookies"));

    await dispatchHandover(win, scriptUrl);

    expect(win.location.replace).toHaveBeenCalledTimes(1);
    const next = new URL(
      (win.location.replace as jest.Mock).mock.calls[0]![0] as string,
    );
    expect(next.origin + next.pathname).toBe(
      "https://polaris.example/auth-refresh-cms-modern-token",
    );
    expect(localStorage[cmsAuthStorageKeys.WMA_COOKIES]).toBeUndefined();
  });

  describe("tasklist filter reset matches the stage-2 path", () => {
    const seedStored = (cookies: string, token: string) => {
      localStorage[cmsAuthStorageKeys.WMA_COOKIES] = cookies;
      localStorage[cmsAuthStorageKeys.CASE_REVIEW_COOKIES] = cookies;
      localStorage[cmsAuthStorageKeys.HOME_COOKIES] = cookies;
      localStorage[cmsAuthStorageKeys.WMA_JSON] = JSON.stringify({
        Cookies: cookies,
        Token: token,
      });
      localStorage[tasklistFilterKey] = "some-urn";
    };

    test("fresh token + flag on: filters reset", async () => {
      withConfig({ OS_RESET_TASKLIST_FILTERS_ON_FRESH_TOKEN: true });
      seedStored("old-cookies", "old-token");
      const win = makeWindow(
        handoverUrl("&cc=new-cookies&cms-modern-token=new-token"),
      );

      await dispatchHandover(win, scriptUrl);

      expect(localStorage[tasklistFilterKey]).toBeUndefined();
    });

    test("fresh token + flag off: filters kept", async () => {
      withConfig();
      seedStored("old-cookies", "old-token");
      const win = makeWindow(
        handoverUrl("&cc=new-cookies&cms-modern-token=new-token"),
      );

      await dispatchHandover(win, scriptUrl);

      expect(localStorage[tasklistFilterKey]).toBe("some-urn");
    });

    test("same cookies + same token + flag on: filters kept", async () => {
      withConfig({ OS_RESET_TASKLIST_FILTERS_ON_FRESH_TOKEN: true });
      seedStored("same-cookies", "same-token");
      const win = makeWindow(
        handoverUrl("&cc=same-cookies&cms-modern-token=same-token"),
      );

      await dispatchHandover(win, scriptUrl);

      expect(localStorage[tasklistFilterKey]).toBe("some-urn");
      expect(win.location.replace).toHaveBeenCalledWith(target);
    });
  });
});
