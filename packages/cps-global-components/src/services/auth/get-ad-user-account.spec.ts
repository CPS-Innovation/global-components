import { AccountInfo, AuthenticationResult, InteractionRequiredAuthError, PublicClientApplication } from "@azure/msal-browser";

// Mock the instance methods
const mockInstance = {
  initialize: jest.fn(),
  getActiveAccount: jest.fn(),
  getAllAccounts: jest.fn(),
  setActiveAccount: jest.fn(),
  acquireTokenSilent: jest.fn(),
  ssoSilent: jest.fn(),
  loginPopup: jest.fn(),
} as unknown as PublicClientApplication;

jest.mock("./get-error-type");
jest.mock("../../logging/with-logging", () => ({
  withLogging: jest.fn((_name, fn) => fn),
}));

// Import after mocks
import { getAdUserAccount } from "./get-ad-user-account";
import { getErrorType } from "./get-error-type";

describe("get-ad-user-account", () => {
  let mockAccount: AccountInfo;

  const defaultProps = {
    instance: mockInstance,
    config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: false, SSO_SILENT_DELAY_MS: 0 },
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
    (mockInstance.loginPopup as jest.Mock).mockReset();
  });

  describe("getAdUserAccount", () => {
    it("should return account via acquireTokenSilent when active account exists", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(mockAccount);
      (mockInstance.acquireTokenSilent as jest.Mock).mockResolvedValue({ account: mockAccount, fromCache: true } as AuthenticationResult);

      const result = await getAdUserAccount(defaultProps);

      expect(result).toBe(mockAccount);
      expect(mockInstance.acquireTokenSilent).toHaveBeenCalledWith({ scopes: ["User.Read"], account: mockAccount, cacheLookupPolicy: 2 });
      expect(mockInstance.ssoSilent).not.toHaveBeenCalled();
      expect(mockInstance.loginPopup).not.toHaveBeenCalled();
    });

    it("should try acquireTokenSilent when getActiveAccount returns null but getAllAccounts has accounts", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.getAllAccounts as jest.Mock).mockReturnValue([mockAccount]);
      (mockInstance.acquireTokenSilent as jest.Mock).mockResolvedValue({ account: mockAccount, fromCache: true } as AuthenticationResult);

      const result = await getAdUserAccount(defaultProps);

      expect(result).toBe(mockAccount);
      expect(mockInstance.acquireTokenSilent).toHaveBeenCalledWith({ scopes: ["User.Read"], account: mockAccount, cacheLookupPolicy: 2 });
      expect(mockInstance.ssoSilent).not.toHaveBeenCalled();
      expect(mockInstance.loginPopup).not.toHaveBeenCalled();
    });

    it("should fall through to ssoSilent when acquireTokenSilent fails", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.getAllAccounts as jest.Mock).mockReturnValue([mockAccount]);
      (mockInstance.acquireTokenSilent as jest.Mock).mockRejectedValue(new Error("token expired"));
      (mockInstance.ssoSilent as jest.Mock).mockResolvedValue({ account: mockAccount } as AuthenticationResult);

      const result = await getAdUserAccount(defaultProps);

      expect(result).toBe(mockAccount);
      expect(mockInstance.acquireTokenSilent).toHaveBeenCalledTimes(1);
      expect(mockInstance.ssoSilent).toHaveBeenCalledWith({ scopes: ["User.Read"], loginHint: "test@example.com" });
      expect(mockInstance.loginPopup).not.toHaveBeenCalled();
    });

    it("should skip acquireTokenSilent and try ssoSilent when no cached accounts exist", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.getAllAccounts as jest.Mock).mockReturnValue([]);
      (mockInstance.ssoSilent as jest.Mock).mockResolvedValue({ account: mockAccount } as AuthenticationResult);

      const result = await getAdUserAccount(defaultProps);

      expect(result).toBe(mockAccount);
      expect(mockInstance.acquireTokenSilent).not.toHaveBeenCalled();
      expect(mockInstance.ssoSilent).toHaveBeenCalledWith({ scopes: ["User.Read"] });
      expect(mockInstance.loginPopup).not.toHaveBeenCalled();
    });

    it("should throw error if ssoSilent fails with non-MultipleIdentities error", async () => {
      const error = new Error("SSO failed");
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.ssoSilent as jest.Mock).mockRejectedValue(error);

      await expect(getAdUserAccount(defaultProps)).rejects.toThrow(error);

      expect(mockInstance.ssoSilent).toHaveBeenCalledWith({ scopes: ["User.Read"] });
      expect(mockInstance.loginPopup).not.toHaveBeenCalled();
    });

    it("should handle MultipleIdentities error when FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN is enabled", async () => {
      const multipleIdentitiesError = new InteractionRequiredAuthError("AADSTS16000");
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.ssoSilent as jest.Mock).mockRejectedValue(multipleIdentitiesError);
      (mockInstance.loginPopup as jest.Mock).mockResolvedValue({ account: mockAccount } as AuthenticationResult);
      (getErrorType as jest.Mock).mockReturnValue("MultipleIdentities");

      const props = {
        instance: mockInstance,
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: true, SSO_SILENT_DELAY_MS: 0 },
      };

      const result = await getAdUserAccount(props);

      expect(result).toBe(mockAccount);
      expect(mockInstance.setActiveAccount).toHaveBeenCalledWith(mockAccount);
      expect(getErrorType).toHaveBeenCalledWith(multipleIdentitiesError);
      expect(mockInstance.loginPopup).toHaveBeenCalledWith({ scopes: ["User.Read"] });
    });

    it("should throw MultipleIdentities error when FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN is disabled", async () => {
      const multipleIdentitiesError = new InteractionRequiredAuthError("AADSTS16000");
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.ssoSilent as jest.Mock).mockRejectedValue(multipleIdentitiesError);
      (getErrorType as jest.Mock).mockReturnValue("MultipleIdentities");

      await expect(getAdUserAccount(defaultProps)).rejects.toThrow(multipleIdentitiesError);
      expect(mockInstance.loginPopup).not.toHaveBeenCalled();
    });

    it("should throw non-MultipleIdentities errors during ssoSilent", async () => {
      const error = new InteractionRequiredAuthError("AADSTS53003");
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.ssoSilent as jest.Mock).mockRejectedValue(error);
      (getErrorType as jest.Mock).mockReturnValue("ConditionalAccessRule");

      const props = {
        instance: mockInstance,
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: true, SSO_SILENT_DELAY_MS: 0 },
      };

      await expect(getAdUserAccount(props)).rejects.toThrow(error);
      expect(mockInstance.loginPopup).not.toHaveBeenCalled();
    });

    it("should return account from popup when MultipleIdentities error occurs with feature flag enabled", async () => {
      const multipleIdentitiesError = new InteractionRequiredAuthError("AADSTS16000");
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.ssoSilent as jest.Mock).mockRejectedValue(multipleIdentitiesError);
      (mockInstance.loginPopup as jest.Mock).mockResolvedValue({ account: mockAccount } as AuthenticationResult);
      (getErrorType as jest.Mock).mockReturnValue("MultipleIdentities");

      const props = {
        instance: mockInstance,
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: true, SSO_SILENT_DELAY_MS: 0 },
      };

      const result = await getAdUserAccount(props);

      expect(result).toBe(mockAccount);
      expect(mockInstance.setActiveAccount).toHaveBeenCalledWith(mockAccount);
      expect(mockInstance.ssoSilent).toHaveBeenCalledWith({ scopes: ["User.Read"] });
      expect(mockInstance.loginPopup).toHaveBeenCalledWith({ scopes: ["User.Read"] });
    });

    it("should handle undefined FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN as false", async () => {
      const multipleIdentitiesError = new InteractionRequiredAuthError("AADSTS16000");
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.ssoSilent as jest.Mock).mockRejectedValue(multipleIdentitiesError);
      (getErrorType as jest.Mock).mockReturnValue("MultipleIdentities");

      const props = {
        instance: mockInstance,
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: undefined, SSO_SILENT_DELAY_MS: 0 },
      };

      await expect(getAdUserAccount(props)).rejects.toThrow(multipleIdentitiesError);
      expect(mockInstance.loginPopup).not.toHaveBeenCalled();
    });

    it("should propagate errors from loginPopup", async () => {
      const multipleIdentitiesError = new InteractionRequiredAuthError("AADSTS16000");
      const popupError = new Error("Popup blocked");
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.ssoSilent as jest.Mock).mockRejectedValue(multipleIdentitiesError);
      (mockInstance.loginPopup as jest.Mock).mockRejectedValue(popupError);
      (getErrorType as jest.Mock).mockReturnValue("MultipleIdentities");

      const props = {
        instance: mockInstance,
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: true, SSO_SILENT_DELAY_MS: 0 },
      };

      await expect(getAdUserAccount(props)).rejects.toThrow(popupError);
    });

    it("should call ssoSilent and loginPopup with correct login request when MultipleIdentities error occurs", async () => {
      const multipleIdentitiesError = new InteractionRequiredAuthError("AADSTS16000");
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.ssoSilent as jest.Mock).mockRejectedValue(multipleIdentitiesError);
      (mockInstance.loginPopup as jest.Mock).mockResolvedValue({ account: mockAccount } as AuthenticationResult);
      (getErrorType as jest.Mock).mockReturnValue("MultipleIdentities");

      const props = {
        instance: mockInstance,
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: true, SSO_SILENT_DELAY_MS: 0 },
      };

      await getAdUserAccount(props);

      expect(mockInstance.setActiveAccount).toHaveBeenCalledWith(mockAccount);
      expect(mockInstance.ssoSilent).toHaveBeenCalledWith({ scopes: ["User.Read"] });
      expect(mockInstance.loginPopup).toHaveBeenCalledWith({ scopes: ["User.Read"] });
    });

    it("should follow complete fallback chain: cache -> acquireTokenSilent -> ssoSilent -> loginPopup", async () => {
      const multipleIdentitiesError = new InteractionRequiredAuthError("AADSTS16000");
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.getAllAccounts as jest.Mock).mockReturnValue([]);
      (mockInstance.ssoSilent as jest.Mock).mockRejectedValue(multipleIdentitiesError);
      (mockInstance.loginPopup as jest.Mock).mockResolvedValue({ account: mockAccount } as AuthenticationResult);
      (getErrorType as jest.Mock).mockReturnValue("MultipleIdentities");

      const props = {
        instance: mockInstance,
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: true, SSO_SILENT_DELAY_MS: 0 },
      };

      const result = await getAdUserAccount(props);

      expect(mockInstance.acquireTokenSilent).not.toHaveBeenCalled();
      expect(mockInstance.ssoSilent).toHaveBeenCalledTimes(1);
      expect(mockInstance.loginPopup).toHaveBeenCalledTimes(1);
      expect(mockInstance.setActiveAccount).toHaveBeenCalledWith(mockAccount);
      expect(result).toBe(mockAccount);
    });

    it("should be defined and be a function", () => {
      expect(getAdUserAccount).toBeDefined();
      expect(typeof getAdUserAccount).toBe("function");
    });
  });
});
