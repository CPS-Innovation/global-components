import { AccountInfo, AuthenticationResult, PublicClientApplication } from "@azure/msal-browser";

const mockInstance = {
  initialize: jest.fn(),
  getActiveAccount: jest.fn(),
  getAllAccounts: jest.fn(),
  setActiveAccount: jest.fn(),
  acquireTokenSilent: jest.fn(),
  ssoSilent: jest.fn(),
  loginRedirect: jest.fn(),
} as unknown as PublicClientApplication;

jest.mock("./internal/logging", () => ({
  ...jest.requireActual("./internal/logging"),
  withLogging: jest.fn((_name, fn) => fn),
}));

import { getAdUserAccount } from "./get-ad-user-account";

describe("get-ad-user-account", () => {
  let mockAccount: AccountInfo;

  const defaultProps = {
    instance: mockInstance,
    config: { SSO_SILENT_DELAY_MS: 0 },
  };

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
  });

  describe("default cascade (acquireTokenSilent → ssoSilent)", () => {
    it("returns account via acquireTokenSilent when an active account exists", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(mockAccount);
      (mockInstance.acquireTokenSilent as jest.Mock).mockResolvedValue({ account: mockAccount, fromCache: true } as AuthenticationResult);

      const result = await getAdUserAccount(defaultProps);

      expect(result).toBe(mockAccount);
      expect(mockInstance.acquireTokenSilent).toHaveBeenCalledWith({ scopes: ["User.Read"], account: mockAccount, cacheLookupPolicy: 2 });
      expect(mockInstance.ssoSilent).not.toHaveBeenCalled();
    });

    it("tries acquireTokenSilent when getActiveAccount returns null but getAllAccounts has an entry", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.getAllAccounts as jest.Mock).mockReturnValue([mockAccount]);
      (mockInstance.acquireTokenSilent as jest.Mock).mockResolvedValue({ account: mockAccount, fromCache: true } as AuthenticationResult);

      const result = await getAdUserAccount(defaultProps);

      expect(result).toBe(mockAccount);
      expect(mockInstance.acquireTokenSilent).toHaveBeenCalledWith({ scopes: ["User.Read"], account: mockAccount, cacheLookupPolicy: 2 });
      expect(mockInstance.ssoSilent).not.toHaveBeenCalled();
    });

    it("falls through to ssoSilent when acquireTokenSilent rejects", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.getAllAccounts as jest.Mock).mockReturnValue([mockAccount]);
      (mockInstance.acquireTokenSilent as jest.Mock).mockRejectedValue(new Error("token expired"));
      (mockInstance.ssoSilent as jest.Mock).mockResolvedValue({ account: mockAccount } as AuthenticationResult);

      const result = await getAdUserAccount(defaultProps);

      expect(result).toBe(mockAccount);
      expect(mockInstance.acquireTokenSilent).toHaveBeenCalledTimes(1);
      expect(mockInstance.ssoSilent).toHaveBeenCalledWith({ scopes: ["User.Read"], loginHint: "test@example.com" });
    });

    it("skips acquireTokenSilent and goes straight to ssoSilent when no cached accounts exist", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.getAllAccounts as jest.Mock).mockReturnValue([]);
      (mockInstance.ssoSilent as jest.Mock).mockResolvedValue({ account: mockAccount } as AuthenticationResult);

      const result = await getAdUserAccount(defaultProps);

      expect(result).toBe(mockAccount);
      expect(mockInstance.acquireTokenSilent).not.toHaveBeenCalled();
      expect(mockInstance.ssoSilent).toHaveBeenCalledWith({ scopes: ["User.Read"] });
    });

    it("throws when ssoSilent fails — no popup fallback any more", async () => {
      const error = new Error("SSO failed");
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.ssoSilent as jest.Mock).mockRejectedValue(error);

      await expect(getAdUserAccount(defaultProps)).rejects.toThrow(error);
    });

    it("does not fire loginRedirect on the default cascade", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.ssoSilent as jest.Mock).mockResolvedValue({ account: mockAccount } as AuthenticationResult);

      await getAdUserAccount(defaultProps);

      expect(mockInstance.loginRedirect).not.toHaveBeenCalled();
    });

    it("is defined and a function", () => {
      expect(getAdUserAccount).toBeDefined();
      expect(typeof getAdUserAccount).toBe("function");
    });
  });

  describe("useFullPageRedirect cascade (acquireTokenSilent → loginRedirect)", () => {
    it("uses acquireTokenSilent from cache when available, never firing loginRedirect", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(mockAccount);
      (mockInstance.acquireTokenSilent as jest.Mock).mockResolvedValue({ account: mockAccount } as AuthenticationResult);

      const result = await getAdUserAccount({ ...defaultProps, useFullPageRedirect: true });

      expect(result).toBe(mockAccount);
      expect(mockInstance.loginRedirect).not.toHaveBeenCalled();
      expect(mockInstance.ssoSilent).not.toHaveBeenCalled();
    });

    it("fires loginRedirect when no cached account exists, skipping ssoSilent entirely", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.getAllAccounts as jest.Mock).mockReturnValue([]);
      (mockInstance.loginRedirect as jest.Mock).mockImplementation(() => new Promise(() => {})); // never resolves

      // loginRedirect promise never resolves (page navigates away). Race against a timeout.
      const racing = Promise.race([
        getAdUserAccount({ ...defaultProps, useFullPageRedirect: true }),
        new Promise(resolve => setTimeout(() => resolve("timeout"), 50)),
      ]);
      await expect(racing).resolves.toBe("timeout");

      expect(mockInstance.loginRedirect).toHaveBeenCalledTimes(1);
      expect(mockInstance.ssoSilent).not.toHaveBeenCalled();
      expect(window.sessionStorage.getItem("cps_global_components_msal_redirect_in_flight_at")).not.toBeNull();
    });

    it("refuses to re-fire loginRedirect when the loop-guard sentinel is recent (<30s)", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.getAllAccounts as jest.Mock).mockReturnValue([]);
      window.sessionStorage.setItem("cps_global_components_msal_redirect_in_flight_at", String(Date.now() - 1000));

      await expect(getAdUserAccount({ ...defaultProps, useFullPageRedirect: true })).rejects.toThrow(/already in-flight/);

      expect(mockInstance.loginRedirect).not.toHaveBeenCalled();
    });

    it("re-fires loginRedirect when the loop-guard sentinel is stale (>30s)", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.getAllAccounts as jest.Mock).mockReturnValue([]);
      (mockInstance.loginRedirect as jest.Mock).mockImplementation(() => new Promise(() => {}));
      window.sessionStorage.setItem("cps_global_components_msal_redirect_in_flight_at", String(Date.now() - 60_000));

      await Promise.race([
        getAdUserAccount({ ...defaultProps, useFullPageRedirect: true }),
        new Promise(resolve => setTimeout(resolve, 50)),
      ]);

      expect(mockInstance.loginRedirect).toHaveBeenCalledTimes(1);
    });

    it("clears the loop-guard sentinel and surfaces if loginRedirect itself rejects", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.getAllAccounts as jest.Mock).mockReturnValue([]);
      (mockInstance.loginRedirect as jest.Mock).mockRejectedValue(new Error("interaction_in_progress"));

      await expect(getAdUserAccount({ ...defaultProps, useFullPageRedirect: true })).rejects.toThrow("interaction_in_progress");

      expect(window.sessionStorage.getItem("cps_global_components_msal_redirect_in_flight_at")).toBeNull();
    });
  });
});
