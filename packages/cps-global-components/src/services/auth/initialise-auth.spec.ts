import { Config } from "cps-global-configuration";
import { FoundContext } from "../context/FoundContext";
import { ApplicationFlags } from "../application-flags/ApplicationFlags";

// Mock the dependencies
const mockInitialiseMockAuth = jest.fn();
jest.mock("./initialise-mock-auth", () => ({
  initialiseMockAuth: (props: any) => mockInitialiseMockAuth(props),
}));

const mockInitialiseAdAuth = jest.fn();
jest.mock("./initialise-ad-auth", () => ({
  initialiseAdAuth: (props: any) => mockInitialiseAdAuth(props),
}));

import { initialiseAuth } from "./initialise-auth";

describe("initialiseAuth", () => {
  const mockConfig = {} as Config;

  const mockContext: FoundContext = {
    found: true,
    path: "/test",
    contextIds: "test-context",
    pathTags: {},
    domTagDefinitions: undefined,
    contextIndex: 0,
    msalRedirectUrl: "https://redirect.example.com",
    cmsAuthFromStorageKey: undefined,
    cmsAuth: "",
    currentHref: "https://example.com/test",
  };

  const mockAuthResult = {
    auth: { isAuthed: true, username: "testuser", name: "Test User", groups: [], objectId: "obj-123" },
    getToken: jest.fn().mockResolvedValue("mock-token"),
  };

  const mockRegister = jest.fn();
  const mockRegisterAuthWithAnalytics = jest.fn();
  const mockSetAuthHint = jest.fn();

  const makeProps = (overrides: Pick<Parameters<typeof initialiseAuth>[0], "flags"> & Partial<Parameters<typeof initialiseAuth>[0]>) => ({
    config: mockConfig,
    context: mockContext,
    register: mockRegister,
    registerAuthWithAnalytics: mockRegisterAuthWithAnalytics,
    setAuthHint: mockSetAuthHint,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockInitialiseMockAuth.mockResolvedValue(mockAuthResult);
    mockInitialiseAdAuth.mockResolvedValue(mockAuthResult);
  });

  describe("when e2eTestMode is enabled", () => {
    const e2eFlags: ApplicationFlags = {
      e2eTestMode: { isE2eTestMode: true, isAuthed: true, adGroups: [] },
      isOutSystems: false,
      isLocalDevelopment: false,
      environment: "test",
      origin: "",
    };

    it("should call initialiseMockAuth", async () => {
      await initialiseAuth(makeProps({ flags: e2eFlags }));

      expect(mockInitialiseMockAuth).toHaveBeenCalledTimes(1);
      expect(mockInitialiseAdAuth).not.toHaveBeenCalled();
    });

    it("should pass flags to initialiseMockAuth", async () => {
      await initialiseAuth(makeProps({ flags: e2eFlags }));

      expect(mockInitialiseMockAuth).toHaveBeenCalledWith({ flags: e2eFlags });
    });

    it("should return the result from initialiseMockAuth", async () => {
      const expectedResult = {
        auth: { isAuthed: true, username: "e2e-user", groups: ["e2e"], objectId: "e2e-obj" },
        getToken: jest.fn(),
      };
      mockInitialiseMockAuth.mockResolvedValue(expectedResult);

      const result = await initialiseAuth(makeProps({ flags: e2eFlags }));

      expect(result).toBe(expectedResult);
    });
  });

  describe("when e2eTestMode is disabled", () => {
    const normalFlags: ApplicationFlags = {
      e2eTestMode: { isE2eTestMode: false },
      isOutSystems: false,
      isLocalDevelopment: false,
      environment: "test",
      origin: "",
    };

    it("should call initialiseAdAuth", async () => {
      await initialiseAuth(makeProps({ flags: normalFlags }));

      expect(mockInitialiseAdAuth).toHaveBeenCalledTimes(1);
      expect(mockInitialiseMockAuth).not.toHaveBeenCalled();
    });

    it("should pass config and context to initialiseAdAuth", async () => {
      await initialiseAuth(makeProps({ flags: normalFlags }));

      expect(mockInitialiseAdAuth).toHaveBeenCalledWith({
        config: mockConfig,
        context: mockContext,
      });
    });

    it("should return the result from initialiseAdAuth", async () => {
      const expectedResult = {
        auth: { isAuthed: true, username: "ad-user", groups: ["group1"], objectId: "ad-obj" },
        getToken: jest.fn(),
      };
      mockInitialiseAdAuth.mockResolvedValue(expectedResult);

      const result = await initialiseAuth(makeProps({ flags: normalFlags }));

      expect(result).toBe(expectedResult);
    });
  });

  describe("register and callbacks", () => {
    const normalFlags: ApplicationFlags = {
      e2eTestMode: { isE2eTestMode: false },
      isOutSystems: false,
      isLocalDevelopment: false,
      environment: "test",
      origin: "",
    };

    it("should call register with auth result", async () => {
      await initialiseAuth(makeProps({ flags: normalFlags }));

      expect(mockRegister).toHaveBeenCalledWith({ auth: mockAuthResult.auth });
    });

    it("should call registerAuthWithAnalytics with auth result", async () => {
      await initialiseAuth(makeProps({ flags: normalFlags }));

      expect(mockRegisterAuthWithAnalytics).toHaveBeenCalledWith(mockAuthResult.auth);
    });

    it("should call setAuthHint when auth is successful", async () => {
      await initialiseAuth(makeProps({ flags: normalFlags }));

      expect(mockSetAuthHint).toHaveBeenCalledWith(mockAuthResult.auth);
    });

    it("should not call setAuthHint when auth fails", async () => {
      const failedResult = {
        auth: { isAuthed: false, knownErrorType: "Unknown", reason: "test failure" },
        getToken: jest.fn(),
      };
      mockInitialiseAdAuth.mockResolvedValue(failedResult);

      await initialiseAuth(makeProps({ flags: normalFlags }));

      expect(mockSetAuthHint).not.toHaveBeenCalled();
    });

    it("should call register and registerAuthWithAnalytics even when context prevents AD calls", async () => {
      const preventedContext: FoundContext = {
        ...mockContext,
        preventADAndDataCalls: true,
      };

      await initialiseAuth(makeProps({ flags: normalFlags, context: preventedContext }));

      expect(mockRegister).toHaveBeenCalledWith({
        auth: { isAuthed: false, knownErrorType: "ADPreventedByContext", reason: "AD auth prevented by context configuration" },
      });
      expect(mockRegisterAuthWithAnalytics).toHaveBeenCalled();
      expect(mockSetAuthHint).not.toHaveBeenCalled();
    });
  });
});
