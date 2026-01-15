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
    };

    it("should call initialiseMockAuth", async () => {
      await initialiseAuth({ config: mockConfig, context: mockContext, flags: e2eFlags });

      expect(mockInitialiseMockAuth).toHaveBeenCalledTimes(1);
      expect(mockInitialiseAdAuth).not.toHaveBeenCalled();
    });

    it("should pass flags to initialiseMockAuth", async () => {
      await initialiseAuth({ config: mockConfig, context: mockContext, flags: e2eFlags });

      expect(mockInitialiseMockAuth).toHaveBeenCalledWith({ flags: e2eFlags });
    });

    it("should return the result from initialiseMockAuth", async () => {
      const expectedResult = {
        auth: { isAuthed: true, username: "e2e-user", groups: ["e2e"], objectId: "e2e-obj" },
        getToken: jest.fn(),
      };
      mockInitialiseMockAuth.mockResolvedValue(expectedResult);

      const result = await initialiseAuth({ config: mockConfig, context: mockContext, flags: e2eFlags });

      expect(result).toBe(expectedResult);
    });
  });

  describe("when e2eTestMode is disabled", () => {
    const normalFlags: ApplicationFlags = {
      e2eTestMode: { isE2eTestMode: false },
      isOutSystems: false,
      isLocalDevelopment: false,
      environment: "test",
    };

    it("should call initialiseAdAuth", async () => {
      await initialiseAuth({ config: mockConfig, context: mockContext, flags: normalFlags });

      expect(mockInitialiseAdAuth).toHaveBeenCalledTimes(1);
      expect(mockInitialiseMockAuth).not.toHaveBeenCalled();
    });

    it("should pass config and context to initialiseAdAuth", async () => {
      await initialiseAuth({ config: mockConfig, context: mockContext, flags: normalFlags });

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

      const result = await initialiseAuth({ config: mockConfig, context: mockContext, flags: normalFlags });

      expect(result).toBe(expectedResult);
    });
  });
});
