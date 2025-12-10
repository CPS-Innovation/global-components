import { Config } from "cps-global-configuration";
import { AuthResult } from "../auth/AuthResult";
import { Build, ReadyStateHelper } from "../../store/store";
import { CmsSessionHintResult } from "../cms-session/CmsSessionHint";
import { ApplicationFlags } from "../application-flags/ApplicationFlags";

// Mock the dependencies
const mockInitialiseMockAnalytics = jest.fn();
jest.mock("./initialise-mock-analytics", () => ({
  initialiseMockAnalytics: () => mockInitialiseMockAnalytics(),
}));

const mockInitialiseAiAnalytics = jest.fn();
jest.mock("./initialise-ai-analytics", () => ({
  initialiseAiAnalytics: (props: any) => mockInitialiseAiAnalytics(props),
}));

import { initialiseAnalytics } from "./initialise-analytics";

describe("initialiseAnalytics", () => {
  const mockWindow = {} as Window;

  const mockConfig = {} as Config;

  const mockAuth = {} as AuthResult;

  const mockReadyState = jest.fn() as unknown as ReadyStateHelper;

  const mockBuild = {} as Build;

  const mockCmsSessionHint = {} as CmsSessionHintResult;

  const mockAnalyticsResult = {
    trackPageView: jest.fn(),
    trackEvent: jest.fn(),
    trackException: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockInitialiseMockAnalytics.mockReturnValue(mockAnalyticsResult);
    mockInitialiseAiAnalytics.mockReturnValue(mockAnalyticsResult);
  });

  describe("when e2eTestMode is enabled", () => {
    const e2eFlags: ApplicationFlags = {
      e2eTestMode: { isE2eTestMode: true, isAuthed: true, adGroups: [] },
      isOverrideMode: false,
      isOutSystems: false,
      isLocalDevelopment: false,
    };

    it("should call initialiseMockAnalytics", () => {
      initialiseAnalytics({
        window: mockWindow,
        config: mockConfig,
        auth: mockAuth,
        readyState: mockReadyState,
        build: mockBuild,
        cmsSessionHint: mockCmsSessionHint,
        flags: e2eFlags,
      });

      expect(mockInitialiseMockAnalytics).toHaveBeenCalledTimes(1);
      expect(mockInitialiseAiAnalytics).not.toHaveBeenCalled();
    });

    it("should return the result from initialiseMockAnalytics", () => {
      const expectedResult = {
        trackPageView: jest.fn(),
        trackEvent: jest.fn(),
        trackException: jest.fn(),
      };
      mockInitialiseMockAnalytics.mockReturnValue(expectedResult);

      const result = initialiseAnalytics({
        window: mockWindow,
        config: mockConfig,
        auth: mockAuth,
        readyState: mockReadyState,
        build: mockBuild,
        cmsSessionHint: mockCmsSessionHint,
        flags: e2eFlags,
      });

      expect(result).toBe(expectedResult);
    });
  });

  describe("when e2eTestMode is disabled", () => {
    const normalFlags: ApplicationFlags = {
      e2eTestMode: { isE2eTestMode: false },
      isOverrideMode: false,
      isOutSystems: false,
      isLocalDevelopment: false,
    };

    it("should call initialiseAiAnalytics", () => {
      initialiseAnalytics({
        window: mockWindow,
        config: mockConfig,
        auth: mockAuth,
        readyState: mockReadyState,
        build: mockBuild,
        cmsSessionHint: mockCmsSessionHint,
        flags: normalFlags,
      });

      expect(mockInitialiseAiAnalytics).toHaveBeenCalledTimes(1);
      expect(mockInitialiseMockAnalytics).not.toHaveBeenCalled();
    });

    it("should pass all dependencies except flags to initialiseAiAnalytics", () => {
      initialiseAnalytics({
        window: mockWindow,
        config: mockConfig,
        auth: mockAuth,
        readyState: mockReadyState,
        build: mockBuild,
        cmsSessionHint: mockCmsSessionHint,
        flags: normalFlags,
      });

      expect(mockInitialiseAiAnalytics).toHaveBeenCalledWith({
        window: mockWindow,
        config: mockConfig,
        auth: mockAuth,
        readyState: mockReadyState,
        build: mockBuild,
        cmsSessionHint: mockCmsSessionHint,
      });
    });

    it("should return the result from initialiseAiAnalytics", () => {
      const expectedResult = {
        trackPageView: jest.fn(),
        trackEvent: jest.fn(),
        trackException: jest.fn(),
      };
      mockInitialiseAiAnalytics.mockReturnValue(expectedResult);

      const result = initialiseAnalytics({
        window: mockWindow,
        config: mockConfig,
        auth: mockAuth,
        readyState: mockReadyState,
        build: mockBuild,
        cmsSessionHint: mockCmsSessionHint,
        flags: normalFlags,
      });

      expect(result).toBe(expectedResult);
    });
  });
});
