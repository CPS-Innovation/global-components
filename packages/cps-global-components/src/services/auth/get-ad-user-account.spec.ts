import { AccountInfo, AuthenticationResult, InteractionRequiredAuthError } from "@azure/msal-browser";

// Mock MSAL before importing the module under test
const mockInstance = {
  initialize: jest.fn(),
  getActiveAccount: jest.fn(),
  ssoSilent: jest.fn(),
  loginPopup: jest.fn(),
};

const MockPublicClientApplication = jest.fn(() => mockInstance);

jest.mock("@azure/msal-browser", () => {
  const actual = jest.requireActual("@azure/msal-browser");
  return {
    ...actual,
    PublicClientApplication: MockPublicClientApplication,
  };
});

jest.mock("./get-error-type");
jest.mock("../../logging/with-logging", () => ({
  withLogging: jest.fn((_name, fn) => fn),
}));
jest.mock("../../logging/_console", () => ({
  _console: {
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

// Import after mocks
import { internalGetAdUserAccount, getAdUserAccount } from "./get-ad-user-account";
import { getErrorType } from "./get-error-type";

describe("get-ad-user-account", () => {
  let mockAccount: AccountInfo;

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

    mockInstance.initialize.mockResolvedValue(undefined);
    mockInstance.getActiveAccount.mockReturnValue(null);
    mockInstance.ssoSilent.mockReset();
    mockInstance.loginPopup.mockReset();
  });

  describe("internalGetAdUserAccount", () => {
    const defaultProps = {
      authority: "https://login.microsoftonline.com/test-tenant",
      clientId: "test-client-id",
      redirectUri: "http://localhost:3333",
      config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: false },
    };

    it("should create and initialize MSAL instance with correct configuration", async () => {
      mockInstance.getActiveAccount.mockReturnValue(mockAccount);

      await internalGetAdUserAccount(defaultProps);

      expect(MockPublicClientApplication).toHaveBeenCalled();
      const calls = MockPublicClientApplication.mock.calls as any[][];
      const callArgs = calls[0][0];

      expect(callArgs.auth).toEqual({
        authority: defaultProps.authority,
        clientId: defaultProps.clientId,
        redirectUri: defaultProps.redirectUri,
      });
      expect(callArgs.cache).toEqual({
        cacheLocation: "localStorage",
      });
      expect(callArgs.system.loggerOptions.logLevel).toBe(3); // LogLevel.Verbose
      expect(typeof callArgs.system.loggerOptions.loggerCallback).toBe("function");
      expect(mockInstance.initialize).toHaveBeenCalledTimes(1);
    });

    it("should use _console.error for Error and Warning log levels", async () => {
      const { _console } = require("../../logging/_console");
      mockInstance.getActiveAccount.mockReturnValue(mockAccount);

      await internalGetAdUserAccount(defaultProps);

      expect(MockPublicClientApplication).toHaveBeenCalled();
      const calls = MockPublicClientApplication.mock.calls as any[][];
      const callArgs = calls[0][0];
      const loggerCallback = callArgs.system.loggerOptions.loggerCallback;

      // Test Error level (LogLevel.Error = 0)
      loggerCallback(0, "Error message", false);
      expect(_console.error).toHaveBeenCalledWith("initialiseAuth", "MSAL logging", 0, "Error message", false);

      // Test Warning level (LogLevel.Warning = 1)
      loggerCallback(1, "Warning message", false);
      expect(_console.error).toHaveBeenCalledWith("initialiseAuth", "MSAL logging", 1, "Warning message", false);
    });

    it("should use _console.debug for Info and Verbose log levels", async () => {
      const { _console } = require("../../logging/_console");
      mockInstance.getActiveAccount.mockReturnValue(mockAccount);

      await internalGetAdUserAccount(defaultProps);

      expect(MockPublicClientApplication).toHaveBeenCalled();
      const calls = MockPublicClientApplication.mock.calls as any[][];
      const callArgs = calls[0][0];
      const loggerCallback = callArgs.system.loggerOptions.loggerCallback;

      // Test Info level (LogLevel.Info = 2)
      loggerCallback(2, "Info message", false);
      expect(_console.debug).toHaveBeenCalledWith("initialiseAuth", "MSAL logging", 2, "Info message", false);

      // Test Verbose level (LogLevel.Verbose = 3)
      loggerCallback(3, "Verbose message", false);
      expect(_console.debug).toHaveBeenCalledWith("initialiseAuth", "MSAL logging", 3, "Verbose message", false);
    });

    it("should return account from cache if available", async () => {
      mockInstance.getActiveAccount.mockReturnValue(mockAccount);

      const result = await internalGetAdUserAccount(defaultProps);

      expect(result).toBe(mockAccount);
      expect(mockInstance.getActiveAccount).toHaveBeenCalledTimes(1);
      expect(mockInstance.ssoSilent).not.toHaveBeenCalled();
      expect(mockInstance.loginPopup).not.toHaveBeenCalled();
    });

    it("should try ssoSilent if no account in cache", async () => {
      mockInstance.getActiveAccount.mockReturnValue(null);
      mockInstance.ssoSilent.mockResolvedValue({ account: mockAccount } as AuthenticationResult);

      const result = await internalGetAdUserAccount(defaultProps);

      expect(result).toBe(mockAccount);
      expect(mockInstance.getActiveAccount).toHaveBeenCalledTimes(1);
      expect(mockInstance.ssoSilent).toHaveBeenCalledWith({ scopes: ["User.Read"] });
      expect(mockInstance.loginPopup).not.toHaveBeenCalled();
    });

    it("should throw error if ssoSilent fails with non-MultipleIdentities error", async () => {
      const error = new Error("SSO failed");
      mockInstance.getActiveAccount.mockReturnValue(null);
      mockInstance.ssoSilent.mockRejectedValue(error);

      await expect(internalGetAdUserAccount(defaultProps)).rejects.toThrow(error);

      expect(mockInstance.getActiveAccount).toHaveBeenCalledTimes(1);
      expect(mockInstance.ssoSilent).toHaveBeenCalledWith({ scopes: ["User.Read"] });
      expect(mockInstance.loginPopup).not.toHaveBeenCalled();
    });

    it("should handle MultipleIdentities error when FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN is enabled", async () => {
      const multipleIdentitiesError = new InteractionRequiredAuthError("AADSTS16000");
      mockInstance.getActiveAccount.mockReturnValue(null);
      mockInstance.ssoSilent.mockRejectedValue(multipleIdentitiesError);
      mockInstance.loginPopup.mockResolvedValue({ account: mockAccount } as AuthenticationResult);
      (getErrorType as jest.Mock).mockReturnValue("MultipleIdentities");

      const props = {
        ...defaultProps,
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: true },
      };

      const result = await internalGetAdUserAccount(props);

      expect(result).toBe(mockAccount);
      expect(getErrorType).toHaveBeenCalledWith(multipleIdentitiesError);
      expect(mockInstance.loginPopup).toHaveBeenCalledWith({ scopes: ["User.Read"] });
    });

    it("should throw MultipleIdentities error when FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN is disabled", async () => {
      const multipleIdentitiesError = new InteractionRequiredAuthError("AADSTS16000");
      mockInstance.getActiveAccount.mockReturnValue(null);
      mockInstance.ssoSilent.mockRejectedValue(multipleIdentitiesError);
      (getErrorType as jest.Mock).mockReturnValue("MultipleIdentities");

      const props = {
        ...defaultProps,
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: false },
      };

      await expect(internalGetAdUserAccount(props)).rejects.toThrow(multipleIdentitiesError);
      expect(mockInstance.loginPopup).not.toHaveBeenCalled();
    });

    it("should throw non-MultipleIdentities errors during ssoSilent", async () => {
      const error = new InteractionRequiredAuthError("AADSTS53003");
      mockInstance.getActiveAccount.mockReturnValue(null);
      mockInstance.ssoSilent.mockRejectedValue(error);
      (getErrorType as jest.Mock).mockReturnValue("ConditionalAccessRule");

      const props = {
        ...defaultProps,
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: true },
      };

      await expect(internalGetAdUserAccount(props)).rejects.toThrow(error);
      expect(mockInstance.loginPopup).not.toHaveBeenCalled();
    });

    it("should return null from ssoSilent when MultipleIdentities error occurs with feature flag enabled", async () => {
      const multipleIdentitiesError = new InteractionRequiredAuthError("AADSTS16000");
      mockInstance.getActiveAccount.mockReturnValue(null);
      mockInstance.ssoSilent.mockRejectedValue(multipleIdentitiesError);
      mockInstance.loginPopup.mockResolvedValue({ account: mockAccount } as AuthenticationResult);
      (getErrorType as jest.Mock).mockReturnValue("MultipleIdentities");

      const props = {
        ...defaultProps,
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: true },
      };

      const result = await internalGetAdUserAccount(props);

      expect(result).toBe(mockAccount);
      expect(mockInstance.ssoSilent).toHaveBeenCalledWith({ scopes: ["User.Read"] });
      expect(mockInstance.loginPopup).toHaveBeenCalledWith({ scopes: ["User.Read"] });
    });

    it("should handle undefined FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN as false", async () => {
      const multipleIdentitiesError = new InteractionRequiredAuthError("AADSTS16000");
      mockInstance.getActiveAccount.mockReturnValue(null);
      mockInstance.ssoSilent.mockRejectedValue(multipleIdentitiesError);
      (getErrorType as jest.Mock).mockReturnValue("MultipleIdentities");

      const props = {
        ...defaultProps,
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: undefined },
      };

      await expect(internalGetAdUserAccount(props)).rejects.toThrow(multipleIdentitiesError);
      expect(mockInstance.loginPopup).not.toHaveBeenCalled();
    });

    it("should propagate errors from loginPopup when ssoSilent returns null", async () => {
      const multipleIdentitiesError = new InteractionRequiredAuthError("AADSTS16000");
      const popupError = new Error("Popup blocked");
      mockInstance.getActiveAccount.mockReturnValue(null);
      mockInstance.ssoSilent.mockRejectedValue(multipleIdentitiesError);
      mockInstance.loginPopup.mockRejectedValue(popupError);
      (getErrorType as jest.Mock).mockReturnValue("MultipleIdentities");

      const props = {
        ...defaultProps,
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: true },
      };

      await expect(internalGetAdUserAccount(props)).rejects.toThrow(popupError);
    });

    it("should call ssoSilent and loginPopup with correct login request when MultipleIdentities error occurs", async () => {
      const multipleIdentitiesError = new InteractionRequiredAuthError("AADSTS16000");
      mockInstance.getActiveAccount.mockReturnValue(null);
      mockInstance.ssoSilent.mockRejectedValue(multipleIdentitiesError);
      mockInstance.loginPopup.mockResolvedValue({ account: mockAccount } as AuthenticationResult);
      (getErrorType as jest.Mock).mockReturnValue("MultipleIdentities");

      const props = {
        ...defaultProps,
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: true },
      };

      await internalGetAdUserAccount(props);

      expect(mockInstance.ssoSilent).toHaveBeenCalledWith({ scopes: ["User.Read"] });
      expect(mockInstance.loginPopup).toHaveBeenCalledWith({ scopes: ["User.Read"] });
    });

    it("should follow complete fallback chain: cache -> ssoSilent -> loginPopup", async () => {
      const multipleIdentitiesError = new InteractionRequiredAuthError("AADSTS16000");
      mockInstance.getActiveAccount.mockReturnValue(null);
      mockInstance.ssoSilent.mockRejectedValue(multipleIdentitiesError);
      mockInstance.loginPopup.mockResolvedValue({ account: mockAccount } as AuthenticationResult);
      (getErrorType as jest.Mock).mockReturnValue("MultipleIdentities");

      const props = {
        ...defaultProps,
        config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: true },
      };

      const result = await internalGetAdUserAccount(props);

      expect(mockInstance.getActiveAccount).toHaveBeenCalledTimes(1);
      expect(mockInstance.ssoSilent).toHaveBeenCalledTimes(1);
      expect(mockInstance.loginPopup).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockAccount);
    });
  });

  describe("getAdUserAccount", () => {
    it("should be defined and be a function", () => {
      expect(getAdUserAccount).toBeDefined();
      expect(typeof getAdUserAccount).toBe("function");
    });
  });
});
