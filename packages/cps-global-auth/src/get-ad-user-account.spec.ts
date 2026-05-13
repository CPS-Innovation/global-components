import {
  AccountInfo,
  AuthenticationResult,
  PublicClientApplication,
} from "@azure/msal-browser";

const mockInstance = {
  initialize: jest.fn(),
  getActiveAccount: jest.fn(),
  getAllAccounts: jest.fn(),
  setActiveAccount: jest.fn(),
  acquireTokenSilent: jest.fn(),
  ssoSilent: jest.fn(),
  loginRedirect: jest.fn(),
} as unknown as PublicClientApplication;

import { getAdUserAccount } from "./get-ad-user-account";

describe("get-ad-user-account", () => {
  let mockAccount: AccountInfo;

  const msalRedirectUrl =
    "https://example.com/global-components/test/msal-redirect.html";

  const defaultProps = {
    instance: mockInstance,
    config: { SSO_SILENT_DELAY_MS: 0 },
    logError: jest.fn(),
    window,
    msalRedirectUrl,
  };

  // The redirect path now calls window.location.replace rather than
  // instance.loginRedirect. jsdom's Location.replace is non-writable so we
  // redefine the whole location property with a stubbed replace (and assign,
  // belt-and-braces for any incidental callers). Restored after each test.
  const originalLocation = window.location;
  let assignSpy: jest.Mock;
  let replaceSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAccount = {
      homeAccountId: "test-home-account-id",
      environment: "test-environment",
      tenantId: "test-tenant-id",
      username: "test@example.com",
      localAccountId: "test-local-account-id",
      name: "Test User",
      idTokenClaims: {},
    };

    (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
    (mockInstance.getAllAccounts as jest.Mock).mockReturnValue([]);
    (mockInstance.setActiveAccount as jest.Mock).mockReset();
    (mockInstance.acquireTokenSilent as jest.Mock).mockReset();
    (mockInstance.ssoSilent as jest.Mock).mockReset();
    (mockInstance.loginRedirect as jest.Mock).mockReset();
    window.sessionStorage.clear();

    assignSpy = jest.fn();
    replaceSpy = jest.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        href: originalLocation.href,
        origin: originalLocation.origin,
        pathname: originalLocation.pathname,
        search: originalLocation.search,
        hash: originalLocation.hash,
        assign: assignSpy,
        replace: replaceSpy,
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  describe("default cascade (acquireTokenSilent → ssoSilent)", () => {
    it("returns account via acquireTokenSilent when an active account exists", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(mockAccount);
      (mockInstance.acquireTokenSilent as jest.Mock).mockResolvedValue({
        account: mockAccount,
        fromCache: true,
      } as AuthenticationResult);

      const result = await getAdUserAccount(defaultProps);

      expect(result.account).toBe(mockAccount);
      expect(result.mechanism).toBe("cache");
      expect(result.redirectCompletionId).toBeUndefined();
      expect(mockInstance.acquireTokenSilent).toHaveBeenCalledWith({
        scopes: ["User.Read"],
        account: mockAccount,
        cacheLookupPolicy: 2,
      });
      expect(mockInstance.ssoSilent).not.toHaveBeenCalled();
    });

    it("tries acquireTokenSilent when getActiveAccount returns null but getAllAccounts has an entry", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.getAllAccounts as jest.Mock).mockReturnValue([mockAccount]);
      (mockInstance.acquireTokenSilent as jest.Mock).mockResolvedValue({
        account: mockAccount,
        fromCache: true,
      } as AuthenticationResult);

      const result = await getAdUserAccount(defaultProps);

      expect(result.account).toBe(mockAccount);
      expect(result.mechanism).toBe("cache");
      expect(mockInstance.acquireTokenSilent).toHaveBeenCalledWith({
        scopes: ["User.Read"],
        account: mockAccount,
        cacheLookupPolicy: 2,
      });
      expect(mockInstance.ssoSilent).not.toHaveBeenCalled();
    });

    it("falls through to ssoSilent when acquireTokenSilent rejects", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.getAllAccounts as jest.Mock).mockReturnValue([mockAccount]);
      (mockInstance.acquireTokenSilent as jest.Mock).mockRejectedValue(
        new Error("token expired"),
      );
      (mockInstance.ssoSilent as jest.Mock).mockResolvedValue({
        account: mockAccount,
      } as AuthenticationResult);

      const result = await getAdUserAccount(defaultProps);

      expect(result.account).toBe(mockAccount);
      expect(result.mechanism).toBe("silent");
      expect(mockInstance.acquireTokenSilent).toHaveBeenCalledTimes(1);
      expect(mockInstance.ssoSilent).toHaveBeenCalledWith({
        scopes: ["User.Read"],
        loginHint: "test@example.com",
      });
    });

    it("skips acquireTokenSilent and goes straight to ssoSilent when no cached accounts exist", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.getAllAccounts as jest.Mock).mockReturnValue([]);
      (mockInstance.ssoSilent as jest.Mock).mockResolvedValue({
        account: mockAccount,
      } as AuthenticationResult);

      const result = await getAdUserAccount(defaultProps);

      expect(result.account).toBe(mockAccount);
      expect(result.mechanism).toBe("silent");
      expect(mockInstance.acquireTokenSilent).not.toHaveBeenCalled();
      expect(mockInstance.ssoSilent).toHaveBeenCalledWith({
        scopes: ["User.Read"],
      });
    });

    it("throws when ssoSilent fails — no popup fallback any more", async () => {
      const error = new Error("SSO failed");
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.ssoSilent as jest.Mock).mockRejectedValue(error);

      await expect(getAdUserAccount(defaultProps)).rejects.toThrow(error);
    });

    it("does not fire loginRedirect on the default cascade", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.ssoSilent as jest.Mock).mockResolvedValue({
        account: mockAccount,
      } as AuthenticationResult);

      await getAdUserAccount(defaultProps);

      expect(mockInstance.loginRedirect).not.toHaveBeenCalled();
    });

    it("is defined and a function", () => {
      expect(getAdUserAccount).toBeDefined();
      expect(typeof getAdUserAccount).toBe("function");
    });
  });

  describe("useFullPageRedirect cascade (acquireTokenSilent → hand off to msal-redirect.html)", () => {
    it("uses acquireTokenSilent from cache when available, never handing off to the redirect page", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(mockAccount);
      (mockInstance.acquireTokenSilent as jest.Mock).mockResolvedValue({
        account: mockAccount,
      } as AuthenticationResult);

      const result = await getAdUserAccount({
        ...defaultProps,
        useFullPageRedirect: true,
      });

      expect(result.account).toBe(mockAccount);
      expect(result.mechanism).toBe("cache");
      expect(replaceSpy).not.toHaveBeenCalled();
      expect(assignSpy).not.toHaveBeenCalled();
      expect(mockInstance.loginRedirect).not.toHaveBeenCalled();
      expect(mockInstance.ssoSilent).not.toHaveBeenCalled();
    });

    it("hands off to msal-redirect.html when no cached account exists, skipping ssoSilent entirely", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.getAllAccounts as jest.Mock).mockReturnValue([]);

      await getAdUserAccount({ ...defaultProps, useFullPageRedirect: true });

      expect(replaceSpy).toHaveBeenCalledTimes(1);
      expect(assignSpy).not.toHaveBeenCalled();
      // No MSAL interactive call on the host page — that's the whole point.
      expect(mockInstance.loginRedirect).not.toHaveBeenCalled();
      expect(mockInstance.ssoSilent).not.toHaveBeenCalled();
      expect(
        window.sessionStorage.getItem(
          "cps_global_components_msal_redirect_in_flight_at",
        ),
      ).not.toBeNull();
    });

    it("hand-off URL is msalRedirectUrl with stage=ad-redirect and returnTo=current href", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.getAllAccounts as jest.Mock).mockReturnValue([]);

      await getAdUserAccount({ ...defaultProps, useFullPageRedirect: true });

      const handedOff = new URL(replaceSpy.mock.calls[0]![0] as string);
      expect(`${handedOff.origin}${handedOff.pathname}`).toBe(msalRedirectUrl);
      expect(handedOff.searchParams.get("stage")).toBe("ad-redirect");
      expect(handedOff.searchParams.get("returnTo")).toBe(window.location.href);
    });

    it("refuses to hand off when the loop-guard sentinel is recent (<30s)", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.getAllAccounts as jest.Mock).mockReturnValue([]);
      window.sessionStorage.setItem(
        "cps_global_components_msal_redirect_in_flight_at",
        String(Date.now() - 1000),
      );

      await expect(
        getAdUserAccount({ ...defaultProps, useFullPageRedirect: true }),
      ).rejects.toThrow(/already in-flight/);

      expect(replaceSpy).not.toHaveBeenCalled();
      expect(assignSpy).not.toHaveBeenCalled();
    });

    it("re-fires the hand-off when the loop-guard sentinel is stale (>30s)", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.getAllAccounts as jest.Mock).mockReturnValue([]);
      window.sessionStorage.setItem(
        "cps_global_components_msal_redirect_in_flight_at",
        String(Date.now() - 60_000),
      );

      await getAdUserAccount({ ...defaultProps, useFullPageRedirect: true });

      expect(replaceSpy).toHaveBeenCalledTimes(1);
      expect(assignSpy).not.toHaveBeenCalled();
    });

    it("clears the loop-guard sentinel and surfaces if URL construction throws", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.getAllAccounts as jest.Mock).mockReturnValue([]);

      await expect(
        getAdUserAccount({
          ...defaultProps,
          useFullPageRedirect: true,
          msalRedirectUrl: "not a url",
        }),
      ).rejects.toThrow();

      expect(
        window.sessionStorage.getItem(
          "cps_global_components_msal_redirect_in_flight_at",
        ),
      ).toBeNull();
    });
  });

  describe("redirect completion-id + four-state mechanism", () => {
    it("returns mechanism 'redirect-success' and surfaces the completion id when the bounce-back signal is present", async () => {
      window.sessionStorage.setItem(
        "cps_global_components_msal_redirect_completion_id",
        "uuid-from-termination",
      );
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(mockAccount);
      (mockInstance.acquireTokenSilent as jest.Mock).mockResolvedValue({
        account: mockAccount,
      } as AuthenticationResult);

      const result = await getAdUserAccount({
        ...defaultProps,
        useFullPageRedirect: true,
      });

      expect(result.account).toBe(mockAccount);
      expect(result.mechanism).toBe("redirect-success");
      expect(result.redirectCompletionId).toBe("uuid-from-termination");
      // One-shot consumption — the key must be cleared after read.
      expect(
        window.sessionStorage.getItem(
          "cps_global_components_msal_redirect_completion_id",
        ),
      ).toBeNull();
    });

    it("prefers 'redirect-success' over 'cache' when both signals would otherwise apply", async () => {
      // No completion id → would be plain "cache". Adding the completion id
      // promotes it to "redirect-success" because the round-trip is the more
      // interesting analytics fact.
      window.sessionStorage.setItem(
        "cps_global_components_msal_redirect_completion_id",
        "uuid-x",
      );
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(mockAccount);
      (mockInstance.acquireTokenSilent as jest.Mock).mockResolvedValue({
        account: mockAccount,
      } as AuthenticationResult);

      const result = await getAdUserAccount(defaultProps);

      expect(result.mechanism).toBe("redirect-success");
    });

    it("returns mechanism 'redirect-failure' when the silent cascade yields no account and the in-flight sentinel was live at entry", async () => {
      // Scenario: termination errored on the previous round-trip, leaving the
      // in-flight sentinel intact. User reloads to the host page on the silent
      // cascade (no useFullPageRedirect for this run); ssoSilent fails too.
      window.sessionStorage.setItem(
        "cps_global_components_msal_redirect_in_flight_at",
        String(Date.now() - 1000),
      );
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.getAllAccounts as jest.Mock).mockReturnValue([]);
      (mockInstance.ssoSilent as jest.Mock).mockResolvedValue({
        account: null,
      } as unknown as AuthenticationResult);

      const result = await getAdUserAccount(defaultProps);

      expect(result.account).toBeNull();
      expect(result.mechanism).toBe("redirect-failure");
      expect(result.redirectCompletionId).toBeUndefined();
    });

    it("treats an expired (>30s) in-flight sentinel as no signal — mechanism is null on a clean miss", async () => {
      window.sessionStorage.setItem(
        "cps_global_components_msal_redirect_in_flight_at",
        String(Date.now() - 60_000),
      );
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.getAllAccounts as jest.Mock).mockReturnValue([]);
      (mockInstance.ssoSilent as jest.Mock).mockResolvedValue({
        account: null,
      } as unknown as AuthenticationResult);

      const result = await getAdUserAccount(defaultProps);

      expect(result.account).toBeNull();
      expect(result.mechanism).toBeNull();
    });

    it("returns mechanism null and no completion id on a vanilla cache miss with nothing else going on", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.getAllAccounts as jest.Mock).mockReturnValue([]);
      (mockInstance.ssoSilent as jest.Mock).mockResolvedValue({
        account: null,
      } as unknown as AuthenticationResult);

      const result = await getAdUserAccount(defaultProps);

      expect(result.account).toBeNull();
      expect(result.mechanism).toBeNull();
      expect(result.redirectCompletionId).toBeUndefined();
    });
  });
});
