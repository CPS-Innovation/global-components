import { AccountInfo, AuthenticationResult, InteractionRequiredAuthError, PublicClientApplication } from "@azure/msal-browser";

// Mock the instance methods
const mockInstance = {
  initialize: jest.fn(),
  getActiveAccount: jest.fn(),
  setActiveAccount: jest.fn(),
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
  let mockSetAuthHint: jest.Mock;

  const defaultProps = {
    instance: mockInstance,
    config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: false },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockSetAuthHint = jest.fn();

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
    (mockInstance.setActiveAccount as jest.Mock).mockReset();
    (mockInstance.ssoSilent as jest.Mock).mockReset();
    (mockInstance.loginPopup as jest.Mock).mockReset();
  });

  describe("getAdUserAccount", () => {
    it("should return account from cache if available", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(mockAccount);

      const result = await getAdUserAccount(defaultProps);

      expect(result).toBe(mockAccount);
      expect(mockInstance.getActiveAccount).toHaveBeenCalledTimes(1);
      expect(mockInstance.setActiveAccount).toHaveBeenCalledWith(mockAccount);
      expect(mockInstance.ssoSilent).not.toHaveBeenCalled();
      expect(mockInstance.loginPopup).not.toHaveBeenCalled();
    });

    it("should try ssoSilent if no account in cache", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.ssoSilent as jest.Mock).mockResolvedValue({ account: mockAccount } as AuthenticationResult);

      const result = await getAdUserAccount(defaultProps);

      expect(result).toBe(mockAccount);
      expect(mockInstance.getActiveAccount).toHaveBeenCalledTimes(1);
      expect(mockInstance.setActiveAccount).toHaveBeenCalledWith(mockAccount);
      expect(mockInstance.ssoSilent).toHaveBeenCalledWith({ scopes: ["User.Read"] });
      expect(mockInstance.loginPopup).not.toHaveBeenCalled();
    });

    it("should throw error if ssoSilent fails with non-MultipleIdentities error", async () => {
      const error = new Error("SSO failed");
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.ssoSilent as jest.Mock).mockRejectedValue(error);

      await expect(getAdUserAccount(defaultProps)).rejects.toThrow(error);

      expect(mockInstance.getActiveAccount).toHaveBeenCalledTimes(1);
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
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: true },
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

    it("should throw non-MultipleIdentities errors during ssoSilent when no authHint provided", async () => {
      const error = new InteractionRequiredAuthError("AADSTS53003");
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.ssoSilent as jest.Mock).mockRejectedValue(error);
      (getErrorType as jest.Mock).mockReturnValue("ConditionalAccessRule");

      const props = {
        instance: mockInstance,
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: true },
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
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: true },
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
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: undefined },
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
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: true },
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
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: true },
      };

      await getAdUserAccount(props);

      expect(mockInstance.setActiveAccount).toHaveBeenCalledWith(mockAccount);
      expect(mockInstance.ssoSilent).toHaveBeenCalledWith({ scopes: ["User.Read"] });
      expect(mockInstance.loginPopup).toHaveBeenCalledWith({ scopes: ["User.Read"] });
    });

    it("should follow complete fallback chain: cache -> ssoSilent -> loginPopup", async () => {
      const multipleIdentitiesError = new InteractionRequiredAuthError("AADSTS16000");
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.ssoSilent as jest.Mock).mockRejectedValue(multipleIdentitiesError);
      (mockInstance.loginPopup as jest.Mock).mockResolvedValue({ account: mockAccount } as AuthenticationResult);
      (getErrorType as jest.Mock).mockReturnValue("MultipleIdentities");

      const props = {
        instance: mockInstance,
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: true },
      };

      const result = await getAdUserAccount(props);

      expect(mockInstance.getActiveAccount).toHaveBeenCalledTimes(1);
      expect(mockInstance.ssoSilent).toHaveBeenCalledTimes(1);
      expect(mockInstance.loginPopup).toHaveBeenCalledTimes(1);
      expect(mockInstance.setActiveAccount).toHaveBeenCalledWith(mockAccount);
      expect(result).toBe(mockAccount);
    });

    it("should be defined and be a function", () => {
      expect(getAdUserAccount).toBeDefined();
      expect(typeof getAdUserAccount).toBe("function");
    });

    it("should pass sid to ssoSilent when authHint is provided and flag is enabled", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.ssoSilent as jest.Mock).mockResolvedValue({ account: mockAccount } as AuthenticationResult);

      const props = {
        instance: mockInstance,
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: true },
        authHint: { found: true as const, result: "session-id-123" },
      };

      await getAdUserAccount(props);

      expect(mockInstance.ssoSilent).toHaveBeenCalledWith({ scopes: ["User.Read"], sid: "session-id-123" });
    });

    it("should not pass sid to ssoSilent when flag is disabled even if authHint is provided", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.ssoSilent as jest.Mock).mockResolvedValue({ account: mockAccount } as AuthenticationResult);

      const props = {
        instance: mockInstance,
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: false },
        authHint: { found: true as const, result: "session-id-123" },
      };

      await getAdUserAccount(props);

      expect(mockInstance.ssoSilent).toHaveBeenCalledWith({ scopes: ["User.Read"] });
    });

    it("should not pass sid to ssoSilent when authHint was not found", async () => {
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.ssoSilent as jest.Mock).mockResolvedValue({ account: mockAccount } as AuthenticationResult);

      const props = {
        instance: mockInstance,
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: true },
        authHint: { found: false as const, error: new Error("no hint") },
      };

      await getAdUserAccount(props);

      expect(mockInstance.ssoSilent).toHaveBeenCalledWith({ scopes: ["User.Read"] });
    });

    it("should fall through to popup when ssoSilent fails with a stale sid", async () => {
      const error = new Error("SSO failed - stale session");
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.ssoSilent as jest.Mock).mockRejectedValue(error);
      (mockInstance.loginPopup as jest.Mock).mockResolvedValue({ account: mockAccount } as AuthenticationResult);
      (getErrorType as jest.Mock).mockReturnValue("Unknown");

      const props = {
        instance: mockInstance,
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: true },
        authHint: { found: true as const, result: "stale-session-id" },
      };

      const result = await getAdUserAccount(props);

      expect(result).toBe(mockAccount);
      expect(mockInstance.loginPopup).toHaveBeenCalledWith({ scopes: ["User.Read"] });
    });

    it("should call setAuthHint with sid after successful account retrieval from cache", async () => {
      mockAccount.idTokenClaims = { sid: "new-session-id" };
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(mockAccount);

      const props = {
        ...defaultProps,
        setAuthHint: mockSetAuthHint,
      };

      await getAdUserAccount(props);

      expect(mockSetAuthHint).toHaveBeenCalledWith("new-session-id");
    });

    it("should call setAuthHint with sid after successful ssoSilent", async () => {
      mockAccount.idTokenClaims = { sid: "silent-session-id" };
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.ssoSilent as jest.Mock).mockResolvedValue({ account: mockAccount } as AuthenticationResult);

      const props = {
        ...defaultProps,
        setAuthHint: mockSetAuthHint,
      };

      await getAdUserAccount(props);

      expect(mockSetAuthHint).toHaveBeenCalledWith("silent-session-id");
    });

    it("should call setAuthHint with sid after successful popup", async () => {
      mockAccount.idTokenClaims = { sid: "popup-session-id" };
      const multipleIdentitiesError = new InteractionRequiredAuthError("AADSTS16000");
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(null);
      (mockInstance.ssoSilent as jest.Mock).mockRejectedValue(multipleIdentitiesError);
      (mockInstance.loginPopup as jest.Mock).mockResolvedValue({ account: mockAccount } as AuthenticationResult);
      (getErrorType as jest.Mock).mockReturnValue("MultipleIdentities");

      const props = {
        instance: mockInstance,
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: true },
        setAuthHint: mockSetAuthHint,
      };

      await getAdUserAccount(props);

      expect(mockSetAuthHint).toHaveBeenCalledWith("popup-session-id");
    });

    it("should not call setAuthHint when no sid in idTokenClaims", async () => {
      mockAccount.idTokenClaims = {};
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(mockAccount);

      const props = {
        ...defaultProps,
        setAuthHint: mockSetAuthHint,
      };

      await getAdUserAccount(props);

      expect(mockSetAuthHint).not.toHaveBeenCalled();
    });

    it("should not call setAuthHint when setAuthHint is not provided", async () => {
      mockAccount.idTokenClaims = { sid: "session-id" };
      (mockInstance.getActiveAccount as jest.Mock).mockReturnValue(mockAccount);

      await getAdUserAccount(defaultProps);

      // Should not throw - just silently skip
    });
  });
});
