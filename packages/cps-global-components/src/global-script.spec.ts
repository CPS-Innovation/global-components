// We need to get fresh readyState after each test due to jest.resetModules()
// So we'll dynamically require it when needed
const getReadyState = () => {
  const { readyState } = require("./store/store");
  return readyState;
};

// We need to clear the cachedResult cache between tests
// Access the module's internal cache by importing the file fresh
const clearCachedResultCache = () => {
  jest.resetModules();
};

// Mock correlation IDs to return predictable values
const mockInitialiseCorrelationIds = jest.fn();
jest.mock("./services/correlation/initialise-correlation-ids", () => ({
  initialiseCorrelationIds: () => mockInitialiseCorrelationIds(),
}));

// Mock navigation subscription - captures the handler so tests can trigger navigation
const mockInitialiseNavigationSubscription = jest.fn();
let capturedNavigationHandler: (() => void) | null = null;
let capturedHandleError: ((err: Error) => void) | null = null;
jest.mock("./services/browser/navigation/initialise-navigation-subscription", () => ({
  initialiseNavigationSubscription: ({ handler, handleError }: { handler: () => void; handleError: (err: Error) => void }) => {
    capturedNavigationHandler = handler;
    capturedHandleError = handleError;
    mockInitialiseNavigationSubscription({ handler, handleError });
  },
}));

// Helper to trigger navigation in tests (mimics real behavior with error handling)
const triggerNavigation = () => {
  if (capturedNavigationHandler) {
    try {
      capturedNavigationHandler();
    } catch (err) {
      if (capturedHandleError) {
        capturedHandleError(err as Error);
      }
    }
  }
};

// Mock all the services - these return jest.fn() so we can inspect calls
const mockInitialiseAuth = jest.fn();
jest.mock("./services/auth/initialise-auth", () => ({
  initialiseAuth: mockInitialiseAuth,
}));

const mockInitialiseAnalytics = jest.fn();
jest.mock("./services/analytics/initialise-analytics", () => ({
  initialiseAnalytics: mockInitialiseAnalytics,
}));

const mockInitialiseConfig = jest.fn();
jest.mock("./services/config/initialise-config", () => ({
  initialiseConfig: mockInitialiseConfig,
}));

const mockInitialiseContext = jest.fn();
jest.mock("./services/context/initialise-context", () => ({
  initialiseContext: mockInitialiseContext,
}));

const mockGetApplicationFlags = jest.fn();
jest.mock("./services/application-flags/get-application-flags", () => ({
  getApplicationFlags: mockGetApplicationFlags,
}));

const mockInitialiseDomObservation = jest.fn();
jest.mock("./services/browser/dom/initialise-dom-observation", () => ({
  initialiseDomObservation: mockInitialiseDomObservation,
}));

jest.mock("./services/browser/dom/dom-tag-mutation-subscriber", () => ({
  domTagMutationSubscriber: jest.fn(),
}));

jest.mock("./services/browser/dom/footer-subscriber", () => ({
  footerSubscriber: jest.fn(),
}));

const mockAccessibilitySubscriber = jest.fn();
jest.mock("./services/browser/accessibility/accessibility-subscriber", () => ({
  accessibilitySubscriber: mockAccessibilitySubscriber,
}));

jest.mock("./services/outsystems-shim/outsystems-shim-subscriber", () => ({
  outSystemsShimSubscribers: [],
}));

const mockInitialiseCaseDetailsData = jest.fn();
jest.mock("./services/data/initialise-case-details-data", () => ({
  initialiseCaseDetailsData: mockInitialiseCaseDetailsData,
}));

const mockInitialiseCmsSessionHint = jest.fn();
jest.mock("./services/state/cms-session/initialise-cms-session-hint", () => ({
  initialiseCmsSessionHint: mockInitialiseCmsSessionHint,
}));

const mockInitialiseHandover = jest.fn();
jest.mock("./services/state/handover/intialise-handover", () => ({
  initialiseHandover: mockInitialiseHandover,
}));

const mockInitialiseInterimDcfNavigation = jest.fn();
jest.mock("./services/outsystems-shim/initialise-interim-dcf-navigation", () => ({
  initialiseInterimDcfNavigation: mockInitialiseInterimDcfNavigation,
}));

const mockInitialiseRootUrl = jest.fn();
jest.mock("./services/root-url/initialise-root-url", () => ({
  initialiseRootUrl: () => mockInitialiseRootUrl(),
}));

const mockInitialisePreview = jest.fn();
jest.mock("./services/state/preview/initialise-preview", () => ({
  initialisePreview: mockInitialisePreview,
}));


const mockInitialiseRecentCases = jest.fn();
jest.mock("./services/state/recent-cases/initialise-recent-cases", () => ({
  initialiseRecentCases: mockInitialiseRecentCases,
}));

// Mock makeConsole to return no-op functions
jest.mock("./logging/makeConsole", () => ({
  makeConsole: () => ({
    _debug: jest.fn(),
    _error: jest.fn(),
  }),
}));

// Helper to create a mock window with navigation API
const createMockWindow = () => {
  const navigationListeners: Map<string, ((event: any) => void)[]> = new Map();

  return {
    cps_global_components_build: {
      version: "1.0.0-test",
      buildDate: "2024-01-01",
    },
    location: {
      href: "https://example.com/test",
      pathname: "/test",
    },
    navigation: {
      addEventListener: jest.fn((event: string, handler: (event: any) => void) => {
        if (!navigationListeners.has(event)) {
          navigationListeners.set(event, []);
        }
        navigationListeners.get(event)!.push(handler);
      }),
      // Helper to trigger navigation events in tests
      _triggerEvent: (event: string, payload?: any) => {
        const handlers = navigationListeners.get(event) || [];
        handlers.forEach(handler => handler(payload));
      },
    },
  } as unknown as Window & { navigation: { _triggerEvent: (event: string, payload?: any) => void } };
};

// Default mock implementations
const setupDefaultMocks = () => {
  let correlationIdCounter = 0;
  mockInitialiseCorrelationIds.mockImplementation(() => {
    correlationIdCounter++;
    const navigationCorrelationId = `uuid-${correlationIdCounter}`;
    // scriptLoadCorrelationId is always uuid-1 (set on first call)
    const scriptLoadCorrelationId = "uuid-1";
    return { scriptLoadCorrelationId, navigationCorrelationId };
  });

  mockGetApplicationFlags.mockReturnValue({
    e2eTestMode: { isE2eTestMode: false },
    isDevelopment: false,
  });

  mockInitialiseConfig.mockResolvedValue({
    CONTEXTS: [],
    GATEWAY_URL: null,
  });

  mockInitialiseCmsSessionHint.mockResolvedValue({ hint: "test-hint" });

  mockInitialiseHandover.mockResolvedValue({
    handover: { caseId: null },
    setNextHandover: jest.fn(),
  });

  mockInitialiseContext.mockReturnValue({
    found: true,
    contextDefinition: { name: "test-context" },
    pathTags: { testTag: "testValue" },
  });

  const mockInitialiseDomForContext = jest.fn();
  mockInitialiseDomObservation.mockReturnValue({
    initialiseDomForContext: mockInitialiseDomForContext,
  });

  mockInitialiseAuth.mockResolvedValue({
    auth: { isAuthed: true, username: "testuser", groups: [], objectId: "obj-123" },
    getToken: jest.fn().mockResolvedValue("mock-token"),
  });

  const mockTrackPageView = jest.fn();
  const mockTrackEvent = jest.fn();
  const mockTrackException = jest.fn();
  mockInitialiseAnalytics.mockReturnValue({
    trackPageView: mockTrackPageView,
    trackEvent: mockTrackEvent,
    trackException: mockTrackException,
  });

  mockInitialiseInterimDcfNavigation.mockReturnValue({
    observe: jest.fn(),
    disconnect: jest.fn(),
  });

  mockInitialiseRootUrl.mockReturnValue("https://example.com/env/components/script.js");

  mockInitialisePreview.mockResolvedValue({ enabled: false, features: [] });

  mockInitialiseRecentCases.mockResolvedValue({
    recentCases: { found: false, error: new Error("No recent cases") },
    setNextRecentCases: jest.fn(),
  });

  return {
    mockTrackPageView,
    mockTrackEvent,
    mockTrackException,
    mockInitialiseDomForContext,
  };
};

describe("global-script", () => {
  let mockWindow: ReturnType<typeof createMockWindow>;
  let defaultMocks: ReturnType<typeof setupDefaultMocks>;

  beforeEach(() => {
    jest.resetAllMocks();
    clearCachedResultCache();
    capturedNavigationHandler = null;
    capturedHandleError = null;
    mockWindow = createMockWindow();
    defaultMocks = setupDefaultMocks();

    // Replace global window for tests
    (global as any).window = mockWindow;
  });

  afterEach(() => {
    delete (global as any).window;
  });

  describe("initial script load", () => {
    it("should use the same correlationId for scriptLoadCorrelationId and navigationCorrelationId on first load", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 10));

      // Check that initialiseCorrelationIds was called once
      expect(mockInitialiseCorrelationIds).toHaveBeenCalledTimes(1);

      // The trackPageView should have been called with matching correlation IDs
      expect(defaultMocks.mockTrackPageView).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationIds: {
            scriptLoadCorrelationId: "uuid-1",
            navigationCorrelationId: "uuid-1",
          },
        }),
      );
    });

    it("should register the navigation listener", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      // Wait for async initialization to complete (listener is registered inside initialise())
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseNavigationSubscription).toHaveBeenCalledWith({
        handler: expect.any(Function),
        handleError: expect.any(Function),
      });
    });

    it("should register build info to store", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      const state = getReadyState()("build");
      expect(state.isReady).toBe(true);
      if (state.isReady) {
        expect(state.state.build).toEqual({
          version: "1.0.0-test",
          buildDate: "2024-01-01",
        });
      }
    });

    it("should register flags to store", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      const state = getReadyState()("flags");
      expect(state.isReady).toBe(true);
      if (state.isReady) {
        expect(state.state.flags).toEqual({
          e2eTestMode: { isE2eTestMode: false },
          isDevelopment: false,
        });
      }
    });

    it("should register rootUrl to store", async () => {
      const testRootUrl = "https://test.example.com/env/script.js";
      mockInitialiseRootUrl.mockReturnValue(testRootUrl);

      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      const state = getReadyState()("rootUrl");
      expect(state.isReady).toBe(true);
      if (state.isReady) {
        expect(state.state.rootUrl).toBe(testRootUrl);
      }
    });

    it("should register preview to store", async () => {
      const testPreview = { enabled: true, features: ["feature1", "feature2"] };
      mockInitialisePreview.mockResolvedValue(testPreview);

      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      const state = getReadyState()("preview");
      expect(state.isReady).toBe(true);
      if (state.isReady) {
        expect(state.state.preview).toEqual(testPreview);
      }
    });

    it("should pass accessibilitySubscriber to initialiseDomObservation", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      const callArgs = mockInitialiseDomObservation.mock.calls[0];
      expect(callArgs).toContain(mockAccessibilitySubscriber);
    });

    it("should register config to store", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      const state = getReadyState()("config");
      expect(state.isReady).toBe(true);
      if (state.isReady) {
        expect(state.state.config).toEqual({
          CONTEXTS: [],
          GATEWAY_URL: null,
        });
      }
    });

    it("should register context to store", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      const state = getReadyState()("context");
      expect(state.isReady).toBe(true);
      if (state.isReady) {
        expect(state.state.context).toEqual({
          found: true,
          contextDefinition: { name: "test-context" },
          pathTags: { testTag: "testValue" },
        });
      }
    });

    it("should register auth to store", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      const state = getReadyState()("auth");
      expect(state.isReady).toBe(true);
      if (state.isReady) {
        expect(state.state.auth).toEqual({
          isAuthed: true,
          username: "testuser",
          groups: [],
          objectId: "obj-123",
        });
      }
    });

    it("should register pathTags from context to store", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      const state = getReadyState()("pathTags");
      expect(state.isReady).toBe(true);
      if (state.isReady) {
        expect(state.state.pathTags).toEqual({ testTag: "testValue" });
      }
    });

    it("should call initialiseDomForContext with context", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(defaultMocks.mockInitialiseDomForContext).toHaveBeenCalledWith({
        context: {
          found: true,
          contextDefinition: { name: "test-context" },
          pathTags: { testTag: "testValue" },
        },
      });
    });

    it("should track page view after initialization", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(defaultMocks.mockTrackPageView).toHaveBeenCalledWith({
        context: {
          found: true,
          contextDefinition: { name: "test-context" },
          pathTags: { testTag: "testValue" },
        },
        correlationIds: {
          scriptLoadCorrelationId: "uuid-1",
          navigationCorrelationId: "uuid-1",
        },
      });
    });

    it("should set initialisationStatus to complete on success", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      const state = getReadyState()();
      expect(state.state.initialisationStatus).toBe("complete");
    });

    it("should set initialisationStatus to complete BEFORE auth finishes (non-blocking auth)", async () => {
      let authResolved = false;

      mockInitialiseAuth.mockImplementation(
        () =>
          new Promise(resolve => {
            setTimeout(() => {
              authResolved = true;
              resolve({
                auth: { isAuthed: true, username: "test", groups: [], objectId: "123" },
                getToken: jest.fn(),
              });
            }, 100);
          }),
      );

      const globalScript = require("./global-script").default;
      globalScript();

      // Wait for initial setup but not for auth to complete
      await new Promise(resolve => setTimeout(resolve, 20));

      // Status should already be complete even though auth hasn't finished
      expect(authResolved).toBe(false);
      expect(getReadyState()().state.initialisationStatus).toBe("complete");

      // Wait for auth to finish
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(authResolved).toBe(true);
    });

    it("should register firstContext to store", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      const state = getReadyState()("firstContext");
      expect(state.isReady).toBe(true);
      if (state.isReady) {
        expect(state.state.firstContext).toEqual({
          found: true,
          contextDefinition: { name: "test-context" },
          pathTags: { testTag: "testValue" },
        });
      }
    });

    it("should pass flags to initialiseAuth so it can decide mock vs real internally", async () => {
      const testFlags = {
        e2eTestMode: { isE2eTestMode: true },
        isDevelopment: false,
      };
      mockGetApplicationFlags.mockReturnValue(testFlags);

      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      // initialiseAuth receives flags and decides internally whether to use mock
      expect(mockInitialiseAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          flags: testFlags,
        }),
      );
    });

    it("should pass flags to initialiseAnalytics so it can decide mock vs real internally", async () => {
      const testFlags = {
        e2eTestMode: { isE2eTestMode: true },
        isDevelopment: false,
      };
      mockGetApplicationFlags.mockReturnValue(testFlags);

      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      // initialiseAnalytics receives flags and decides internally whether to use mock
      expect(mockInitialiseAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({
          flags: testFlags,
        }),
      );
    });
  });

  describe("data access initialization", () => {
    it("should call initialiseCaseDetailsData with correct parameters", async () => {
      const testConfig = {
        CONTEXTS: [],
        GATEWAY_URL: "https://gateway.example.com/",
      };
      mockInitialiseConfig.mockResolvedValue(testConfig);

      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseCaseDetailsData).toHaveBeenCalledWith(
        expect.objectContaining({
          config: testConfig,
          context: expect.any(Object),
          subscribe: expect.any(Function),
          handover: expect.any(Object),
          setNextHandover: expect.any(Function),
          setNextRecentCases: expect.any(Function),
          getToken: expect.any(Function),
          readyState: expect.any(Function),
          trackEvent: expect.any(Function),
        }),
      );
    });
  });

  describe("SPA navigation handling", () => {
    it("should generate a new navigationCorrelationId on navigate but keep scriptLoadCorrelationId", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      // First call should have matching IDs
      expect(defaultMocks.mockTrackPageView).toHaveBeenNthCalledWith(1, {
        context: expect.any(Object),
        correlationIds: {
          scriptLoadCorrelationId: "uuid-1",
          navigationCorrelationId: "uuid-1",
        },
      });

      // Trigger SPA navigation
      triggerNavigation();

      await new Promise(resolve => setTimeout(resolve, 10));

      // Second call should have same scriptLoadCorrelationId but different navigationCorrelationId
      expect(defaultMocks.mockTrackPageView).toHaveBeenNthCalledWith(2, {
        context: expect.any(Object),
        correlationIds: {
          scriptLoadCorrelationId: "uuid-1",
          navigationCorrelationId: "uuid-2",
        },
      });
    });

    it("should call initialiseContext again on navigation", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      // On first load: called twice (once in loadPhase as firstContext, once in initialise as context)
      expect(mockInitialiseContext).toHaveBeenCalledTimes(2);

      // Trigger SPA navigation
      triggerNavigation();

      await new Promise(resolve => setTimeout(resolve, 10));

      // Context should be reinitialised on navigation (loadPhase cached, but initialise runs again)
      expect(mockInitialiseContext).toHaveBeenCalledTimes(3);
    });

    it("should NOT call getApplicationFlags again on navigation (cached)", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockGetApplicationFlags).toHaveBeenCalledTimes(1);

      // Trigger SPA navigation
      triggerNavigation();

      await new Promise(resolve => setTimeout(resolve, 10));

      // Flags should be cached, not called again
      expect(mockGetApplicationFlags).toHaveBeenCalledTimes(1);
    });

    it("should NOT call initialiseConfig again on navigation (cached)", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseConfig).toHaveBeenCalledTimes(1);

      // Trigger SPA navigation
      triggerNavigation();

      await new Promise(resolve => setTimeout(resolve, 10));

      // Config should be cached, not called again
      expect(mockInitialiseConfig).toHaveBeenCalledTimes(1);
    });

    it("should NOT call initialiseAuth again on navigation (cached)", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseAuth).toHaveBeenCalledTimes(1);

      // Trigger SPA navigation
      triggerNavigation();

      await new Promise(resolve => setTimeout(resolve, 10));

      // Auth should be cached, not called again
      expect(mockInitialiseAuth).toHaveBeenCalledTimes(1);
    });

    it("should NOT call initialiseAnalytics again on navigation (cached)", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseAnalytics).toHaveBeenCalledTimes(1);

      // Trigger SPA navigation
      triggerNavigation();

      await new Promise(resolve => setTimeout(resolve, 10));

      // Analytics should be cached, not called again
      expect(mockInitialiseAnalytics).toHaveBeenCalledTimes(1);
    });

    it("should call initialiseDomForContext with new context on navigation", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(defaultMocks.mockInitialiseDomForContext).toHaveBeenCalledTimes(1);

      // Update context mock to return different context on second call
      mockInitialiseContext.mockReturnValue({
        found: true,
        contextDefinition: { name: "new-context" },
        pathTags: { newTag: "newValue" },
      });

      // Trigger SPA navigation
      triggerNavigation();

      await new Promise(resolve => setTimeout(resolve, 10));

      // Should be called again with new context
      expect(defaultMocks.mockInitialiseDomForContext).toHaveBeenCalledTimes(2);
      expect(defaultMocks.mockInitialiseDomForContext).toHaveBeenLastCalledWith({
        context: {
          found: true,
          contextDefinition: { name: "new-context" },
          pathTags: { newTag: "newValue" },
        },
      });
    });

    it("should track page view on each navigation", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(defaultMocks.mockTrackPageView).toHaveBeenCalledTimes(1);

      // Trigger SPA navigation
      triggerNavigation();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(defaultMocks.mockTrackPageView).toHaveBeenCalledTimes(2);
    });

    it("should update context in store on navigation", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      let state = getReadyState()("context");
      expect(state.state.context).toEqual({
        found: true,
        contextDefinition: { name: "test-context" },
        pathTags: { testTag: "testValue" },
      });

      // Update context mock
      mockInitialiseContext.mockReturnValue({
        found: true,
        contextDefinition: { name: "new-context" },
        pathTags: { newTag: "newValue" },
      });

      // Trigger SPA navigation
      triggerNavigation();

      await new Promise(resolve => setTimeout(resolve, 10));

      state = getReadyState()("context");
      expect(state.state.context).toEqual({
        found: true,
        contextDefinition: { name: "new-context" },
        pathTags: { newTag: "newValue" },
      });
    });

    it("should update pathTags in store on navigation", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      let state = getReadyState()("pathTags");
      expect(state.state.pathTags).toEqual({ testTag: "testValue" });

      // Update context mock
      mockInitialiseContext.mockReturnValue({
        found: true,
        contextDefinition: { name: "new-context" },
        pathTags: { differentTag: "differentValue" },
      });

      // Trigger SPA navigation
      triggerNavigation();

      await new Promise(resolve => setTimeout(resolve, 10));

      state = getReadyState()("pathTags");
      expect(state.state.pathTags).toEqual({ differentTag: "differentValue" });
    });

    it("should handle multiple navigations correctly", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      // Trigger multiple SPA navigations
      triggerNavigation();
      await new Promise(resolve => setTimeout(resolve, 10));

      triggerNavigation();
      await new Promise(resolve => setTimeout(resolve, 10));

      triggerNavigation();
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should have 4 page views (initial + 3 navigations)
      expect(defaultMocks.mockTrackPageView).toHaveBeenCalledTimes(4);

      // Should have called initialiseCorrelationIds 4 times (1 for initial, 1 for each navigation)
      expect(mockInitialiseCorrelationIds).toHaveBeenCalledTimes(4);

      // Last call should have original scriptLoadCorrelationId with new navigationCorrelationId
      expect(defaultMocks.mockTrackPageView).toHaveBeenLastCalledWith({
        context: expect.any(Object),
        correlationIds: {
          scriptLoadCorrelationId: "uuid-1",
          navigationCorrelationId: "uuid-4",
        },
      });
    });
  });

  describe("error handling", () => {
    it("should set initialisationStatus to broken on error", async () => {
      mockInitialiseConfig.mockRejectedValue(new Error("Config failed"));

      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      const state = getReadyState()();
      expect(state.state.initialisationStatus).toBe("broken");
    });

    it("should register fatalInitialisationError on error", async () => {
      const testError = new Error("Test error");
      mockInitialiseConfig.mockRejectedValue(testError);

      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      const state = getReadyState()();
      expect(state.state.fatalInitialisationError).toBe(testError);
    });

    it("should track exception when error occurs after analytics is initialized", async () => {
      // First let analytics initialize successfully
      const mockTrackException = jest.fn();
      mockInitialiseAnalytics.mockReturnValue({
        trackPageView: jest.fn().mockImplementation(() => {
          throw new Error("Page view error");
        }),
        trackEvent: jest.fn(),
        trackException: mockTrackException,
      });

      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockTrackException).toHaveBeenCalledWith(expect.any(Error));
    });

    it("should recover from navigation error and allow subsequent navigation", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      // First navigation succeeds
      expect(getReadyState()().state.initialisationStatus).toBe("complete");

      // Make context throw on next call
      mockInitialiseContext.mockImplementationOnce(() => {
        throw new Error("Context error");
      });

      // Trigger navigation - should fail
      triggerNavigation();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(getReadyState()().state.initialisationStatus).toBe("broken");

      // Reset context mock
      mockInitialiseContext.mockReturnValue({
        found: true,
        contextDefinition: { name: "recovered-context" },
        pathTags: {},
      });

      // Trigger another navigation - should recover
      triggerNavigation();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(getReadyState()().state.initialisationStatus).toBe("complete");
    });
  });

  describe("window without navigation API", () => {
    it("should handle window without navigation API gracefully", async () => {
      // Create window without navigation
      const windowWithoutNav = {
        cps_global_components_build: { version: "1.0.0" },
        location: { href: "https://example.com", pathname: "/" },
        navigation: undefined,
      } as unknown as Window;

      (global as any).window = windowWithoutNav;

      const globalScript = require("./global-script").default;

      // Should not throw
      expect(() => globalScript()).not.toThrow();

      await new Promise(resolve => setTimeout(resolve, 10));

      // Should still complete initialization
      const state = getReadyState()();
      expect(state.state.initialisationStatus).toBe("complete");
    });
  });

  describe("cmsSessionHint, handover and recentCases initialization", () => {
    it("should register cmsSessionHint to store", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      const state = getReadyState()("cmsSessionHint");
      expect(state.isReady).toBe(true);
      if (state.isReady) {
        expect(state.state.cmsSessionHint).toEqual({ hint: "test-hint" });
      }
    });

    it("should register handover to store", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      const state = getReadyState()("handover");
      expect(state.isReady).toBe(true);
      if (state.isReady) {
        expect(state.state.handover).toEqual({ caseId: null });
      }
    });

    it("should NOT reinitialize cmsSessionHint on navigation (cached)", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseCmsSessionHint).toHaveBeenCalledTimes(1);

      // Trigger SPA navigation
      triggerNavigation();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseCmsSessionHint).toHaveBeenCalledTimes(1);
    });

    it("should NOT reinitialize handover on navigation (cached)", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseHandover).toHaveBeenCalledTimes(1);

      // Trigger SPA navigation
      triggerNavigation();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseHandover).toHaveBeenCalledTimes(1);
    });

    it("should register recentCases to store", async () => {
      const testRecentCases = { found: true, result: [{ caseId: 123, urn: "12AB3456789" }] };
      mockInitialiseRecentCases.mockResolvedValue({
        recentCases: testRecentCases,
        setNextRecentCases: jest.fn(),
      });

      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      const state = getReadyState()("recentCases");
      expect(state.isReady).toBe(true);
      if (state.isReady) {
        expect(state.state.recentCases).toEqual(testRecentCases);
      }
    });

    it("should NOT reinitialize recentCases on navigation (cached)", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseRecentCases).toHaveBeenCalledTimes(1);

      // Trigger SPA navigation
      triggerNavigation();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseRecentCases).toHaveBeenCalledTimes(1);
    });
  });

  describe("end-to-end data flow", () => {
    // These tests verify that the correct data flows from one step to the next
    // A control flow refactor should not break these dependencies

    it("should pass rootUrl, flags and preview to initialiseConfig", async () => {
      const testFlags = {
        e2eTestMode: { isE2eTestMode: false },
        isDevelopment: true,
        customFlag: "test-value",
      };
      const testRootUrl = "https://test.example.com/env/script.js";
      const testPreview = { enabled: true, features: ["feature1"] };
      mockGetApplicationFlags.mockReturnValue(testFlags);
      mockInitialiseRootUrl.mockReturnValue(testRootUrl);
      mockInitialisePreview.mockResolvedValue(testPreview);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseConfig).toHaveBeenCalledWith({ rootUrl: testRootUrl, flags: testFlags, preview: testPreview });
    });

    it("should pass rootUrl to initialiseCmsSessionHint", async () => {
      const testRootUrl = "https://test.example.com/env/script.js";
      mockInitialiseRootUrl.mockReturnValue(testRootUrl);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseCmsSessionHint).toHaveBeenCalledWith({
        rootUrl: testRootUrl,
      });
    });

    it("should pass rootUrl to initialiseHandover", async () => {
      const testRootUrl = "https://test.example.com/env/script.js";
      mockInitialiseRootUrl.mockReturnValue(testRootUrl);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseHandover).toHaveBeenCalledWith({
        rootUrl: testRootUrl,
      });
    });

    it("should pass rootUrl to initialisePreview", async () => {
      const testRootUrl = "https://test.example.com/env/script.js";
      mockInitialiseRootUrl.mockReturnValue(testRootUrl);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialisePreview).toHaveBeenCalledWith({
        rootUrl: testRootUrl,
      });
    });

    it("should pass rootUrl and preview to initialiseRecentCases", async () => {
      const testRootUrl = "https://test.example.com/env/script.js";
      const testPreview = { enabled: true, myRecentCases: true };
      mockInitialiseRootUrl.mockReturnValue(testRootUrl);
      mockInitialisePreview.mockResolvedValue(testPreview);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseRecentCases).toHaveBeenCalledWith({
        rootUrl: testRootUrl,
        preview: testPreview,
      });
    });

    it("should pass preview to initialiseDomObservation for accessibilitySubscriber", async () => {
      const testPreview = { result: { accessibility: true } };
      mockInitialisePreview.mockResolvedValue(testPreview);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      const callArgs = mockInitialiseDomObservation.mock.calls[0];
      // First arg is the options object containing window and preview
      expect(callArgs[0]).toEqual(
        expect.objectContaining({
          window: mockWindow,
          preview: testPreview,
        }),
      );
      // accessibilitySubscriber should be in the args
      expect(callArgs).toContain(mockAccessibilitySubscriber);
    });

    it("should pass window and config to initialiseContext", async () => {
      const testConfig = {
        CONTEXTS: [{ paths: ["/test"], contexts: "test-context" }],
        GATEWAY_URL: null,
      };
      mockInitialiseConfig.mockResolvedValue(testConfig);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseContext).toHaveBeenCalledWith({
        window: mockWindow,
        config: testConfig,
      });
    });

    it("should pass config, context and flags to initialiseAuth", async () => {
      const testFlags = {
        e2eTestMode: { isE2eTestMode: false },
        isDevelopment: false,
      };
      const testConfig = {
        CONTEXTS: [],
        GATEWAY_URL: null,
        AD_CLIENT_ID: "test-client-id",
      };
      const testContext = {
        found: true,
        contextDefinition: { name: "auth-test-context" },
        pathTags: { caseId: "123" },
        cmsAuth: { isCmsAuth: true },
      };
      mockGetApplicationFlags.mockReturnValue(testFlags);
      mockInitialiseConfig.mockResolvedValue(testConfig);
      mockInitialiseContext.mockReturnValue(testContext);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseAuth).toHaveBeenCalledWith({
        config: testConfig,
        context: testContext,
        flags: testFlags,
      });
    });

    it("should pass all required dependencies to initialiseAnalytics (auth is obtained via readyState)", async () => {
      const testFlags = {
        e2eTestMode: { isE2eTestMode: false },
        isDevelopment: false,
      };
      const testConfig = { CONTEXTS: [], GATEWAY_URL: null, APP_INSIGHTS_KEY: "test-key" };
      const testBuild = { version: "2.0.0", buildDate: "2024-06-15" };
      const testCmsSessionHint = { hint: "analytics-hint", sessionId: "sess-123" };

      (mockWindow as any).cps_global_components_build = testBuild;
      mockGetApplicationFlags.mockReturnValue(testFlags);
      mockInitialiseConfig.mockResolvedValue(testConfig);
      mockInitialiseCmsSessionHint.mockResolvedValue(testCmsSessionHint);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      // Analytics is now called without auth - it uses readyState to get auth when needed
      expect(mockInitialiseAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({
          window: mockWindow,
          config: testConfig,
          build: testBuild,
          cmsSessionHint: testCmsSessionHint,
          flags: testFlags,
          readyState: expect.any(Function),
        }),
      );
      // Verify auth is NOT passed directly
      expect(mockInitialiseAnalytics).not.toHaveBeenCalledWith(
        expect.objectContaining({
          auth: expect.any(Object),
        }),
      );
    });

    it("should pass context and correlationIds to trackPageView", async () => {
      const testContext = {
        found: true,
        contextDefinition: { name: "pageview-context" },
        pathTags: { pageId: "page-123" },
      };
      mockInitialiseContext.mockReturnValue(testContext);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(defaultMocks.mockTrackPageView).toHaveBeenCalledWith({
        context: testContext,
        correlationIds: {
          scriptLoadCorrelationId: "uuid-1",
          navigationCorrelationId: "uuid-1",
        },
      });
    });

    it("should pass all required dependencies to initialiseCaseDetailsData", async () => {
      const testConfig = { CONTEXTS: [], GATEWAY_URL: "https://gateway.test.com/" };
      const testHandover = { caseId: "case-789", source: "test" };
      const mockSetNextHandover = jest.fn();
      const mockSetNextRecentCases = jest.fn();
      const testContext = {
        found: true,
        contextDefinition: { name: "test-context" },
        pathTags: { caseId: "123" },
      };

      mockInitialiseConfig.mockResolvedValue(testConfig);
      mockInitialiseHandover.mockResolvedValue({
        handover: testHandover,
        setNextHandover: mockSetNextHandover,
      });
      mockInitialiseRecentCases.mockResolvedValue({
        recentCases: { found: false, error: new Error("No recent cases") },
        setNextRecentCases: mockSetNextRecentCases,
      });
      mockInitialiseContext.mockReturnValue(testContext);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseCaseDetailsData).toHaveBeenCalledWith(
        expect.objectContaining({
          config: testConfig,
          context: testContext,
          handover: testHandover,
          setNextHandover: mockSetNextHandover,
          setNextRecentCases: mockSetNextRecentCases,
        }),
      );
    });
  });

  describe("operation order", () => {
    // These tests verify that operations happen in the correct order
    // using mock call order tracking

    it("should initialise in correct order: rootUrl -> flags -> cmsSessionHint/handover/preview (parallel) -> recentCases -> config -> firstContext -> analytics (auth runs async later)", async () => {
      const callOrder: string[] = [];

      mockInitialiseRootUrl.mockImplementation(() => {
        callOrder.push("rootUrl");
        return "https://example.com/script.js";
      });

      mockGetApplicationFlags.mockImplementation(() => {
        callOrder.push("flags");
        return { e2eTestMode: { isE2eTestMode: false }, isDevelopment: false };
      });

      mockInitialiseConfig.mockImplementation(async () => {
        callOrder.push("config");
        return { CONTEXTS: [], GATEWAY_URL: null };
      });

      mockInitialiseCmsSessionHint.mockImplementation(async () => {
        callOrder.push("cmsSessionHint");
        return { hint: "test" };
      });

      mockInitialiseHandover.mockImplementation(async () => {
        callOrder.push("handover");
        return { handover: {}, setNextHandover: jest.fn() };
      });

      mockInitialisePreview.mockImplementation(async () => {
        callOrder.push("preview");
        return { enabled: false, features: [] };
      });

      mockInitialiseRecentCases.mockImplementation(async () => {
        callOrder.push("recentCases");
        return { recentCases: { found: false, error: new Error("No recent cases") }, setNextRecentCases: jest.fn() };
      });

      mockInitialiseContext.mockImplementation(() => {
        callOrder.push("context");
        return { found: true, contextDefinition: {}, pathTags: {} };
      });

      mockInitialiseAuth.mockImplementation(async () => {
        callOrder.push("auth");
        return { auth: { isAuthed: true, username: "test", groups: [], objectId: "123" }, getToken: jest.fn() };
      });

      mockInitialiseAnalytics.mockImplementation(() => {
        callOrder.push("analytics");
        return { trackPageView: jest.fn(), trackEvent: jest.fn(), trackException: jest.fn() };
      });

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify order - rootUrl and flags first, then parallel async calls (cmsSessionHint/handover/preview),
      // then recentCases (needs preview), then config, then firstContext
      // Analytics now comes BEFORE auth (auth is non-blocking to avoid UI delay)
      // accessibilitySubscriber is now part of DOM observation (called via initialiseDomForContext)
      expect(callOrder.indexOf("rootUrl")).toBeLessThan(callOrder.indexOf("flags"));
      expect(callOrder.indexOf("flags")).toBeLessThan(callOrder.indexOf("cmsSessionHint"));
      expect(callOrder.indexOf("flags")).toBeLessThan(callOrder.indexOf("handover"));
      expect(callOrder.indexOf("flags")).toBeLessThan(callOrder.indexOf("preview"));
      expect(callOrder.indexOf("preview")).toBeLessThan(callOrder.indexOf("recentCases"));
      expect(callOrder.indexOf("recentCases")).toBeLessThan(callOrder.indexOf("config"));
      expect(callOrder.indexOf("config")).toBeLessThan(callOrder.indexOf("context"));
      // Analytics is now initialized BEFORE auth (auth is non-blocking)
      expect(callOrder.indexOf("analytics")).toBeLessThan(callOrder.indexOf("auth"));
    });

    it("should await config before initialising context", async () => {
      let configResolved = false;

      mockInitialiseConfig.mockImplementation(
        () =>
          new Promise(resolve => {
            setTimeout(() => {
              configResolved = true;
              resolve({ CONTEXTS: [], GATEWAY_URL: null });
            }, 50);
          }),
      );

      mockInitialiseContext.mockImplementation(() => {
        // This should only be called after config is resolved
        expect(configResolved).toBe(true);
        return { found: true, contextDefinition: {}, pathTags: {} };
      });

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockInitialiseContext).toHaveBeenCalled();
    });

    it("should NOT await auth before initialising analytics (auth is non-blocking)", async () => {
      let authResolved = false;

      mockInitialiseAuth.mockImplementation(
        () =>
          new Promise(resolve => {
            setTimeout(() => {
              authResolved = true;
              resolve({
                auth: { isAuthed: true, username: "test", groups: [], objectId: "123" },
                getToken: jest.fn(),
              });
            }, 50);
          }),
      );

      mockInitialiseAnalytics.mockImplementation(() => {
        // Analytics should be called BEFORE auth is resolved (auth is non-blocking)
        expect(authResolved).toBe(false);
        return { trackPageView: jest.fn(), trackEvent: jest.fn(), trackException: jest.fn() };
      });

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      // Analytics should be called immediately (before auth completes)
      expect(mockInitialiseAnalytics).toHaveBeenCalled();

      // Wait for auth to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(authResolved).toBe(true);
    });

    it("should register correlationIds before anything else that uses the store", async () => {
      // We can't easily intercept register calls, but we can verify correlationIds
      // are in the store before trackPageView is called
      defaultMocks.mockTrackPageView.mockImplementation(({ correlationIds }) => {
        // By the time trackPageView is called, correlationIds should be set
        const state = getReadyState()("correlationIds");
        expect(state.isReady).toBe(true);
        expect(state.state.correlationIds).toEqual(correlationIds);
      });

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(defaultMocks.mockTrackPageView).toHaveBeenCalled();
    });
  });

  describe("navigation data flow", () => {
    // These tests verify that on SPA navigation, the correct updated data flows through

    it("should pass updated context to trackPageView on navigation", async () => {
      const firstContext = {
        found: true,
        contextDefinition: { name: "first" },
        pathTags: { page: "first" },
      };
      const initialContext = {
        found: true,
        contextDefinition: { name: "initial" },
        pathTags: { page: "home" },
      };
      const updatedContext = {
        found: true,
        contextDefinition: { name: "updated" },
        pathTags: { page: "details", caseId: "456" },
      };

      // First call is in loadPhase (firstContext), second in initialise (context), third on navigation
      mockInitialiseContext.mockReturnValueOnce(firstContext).mockReturnValueOnce(initialContext).mockReturnValueOnce(updatedContext);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      // First trackPageView uses context from initialise (second call to initialiseContext)
      expect(defaultMocks.mockTrackPageView).toHaveBeenNthCalledWith(1, {
        context: initialContext,
        correlationIds: expect.any(Object),
      });

      // Navigate
      triggerNavigation();
      await new Promise(resolve => setTimeout(resolve, 10));

      // Second trackPageView uses updated context
      expect(defaultMocks.mockTrackPageView).toHaveBeenNthCalledWith(2, {
        context: updatedContext,
        correlationIds: expect.any(Object),
      });
    });

    it("should pass updated context to initialiseDomForContext on navigation", async () => {
      const firstContext = {
        found: true,
        contextDefinition: { name: "first" },
        pathTags: {},
      };
      const initialContext = {
        found: true,
        contextDefinition: { name: "initial" },
        pathTags: {},
      };
      const updatedContext = {
        found: true,
        contextDefinition: { name: "navigated" },
        pathTags: { newTag: "newValue" },
      };

      // First call is in loadPhase (firstContext), second in initialise (context), third on navigation
      mockInitialiseContext.mockReturnValueOnce(firstContext).mockReturnValueOnce(initialContext).mockReturnValueOnce(updatedContext);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      // initialiseDomForContext uses context from initialise (second call to initialiseContext)
      expect(defaultMocks.mockInitialiseDomForContext).toHaveBeenNthCalledWith(1, { context: initialContext });

      // Navigate
      triggerNavigation();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(defaultMocks.mockInitialiseDomForContext).toHaveBeenNthCalledWith(2, { context: updatedContext });
    });

    it("should use cached config (not refetch) when context changes on navigation", async () => {
      const cachedConfig = { CONTEXTS: [], GATEWAY_URL: null, CACHED: true };
      mockInitialiseConfig.mockResolvedValue(cachedConfig);

      // Return different contexts on each call (first in loadPhase, second in initialise, third on navigation)
      mockInitialiseContext
        .mockReturnValueOnce({ found: true, contextDefinition: { name: "firstCtx" }, pathTags: {} })
        .mockReturnValueOnce({ found: true, contextDefinition: { name: "ctx1" }, pathTags: {} })
        .mockReturnValueOnce({ found: true, contextDefinition: { name: "ctx2" }, pathTags: {} });

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      // Config called once (in loadPhase)
      expect(mockInitialiseConfig).toHaveBeenCalledTimes(1);

      // Navigate
      triggerNavigation();
      await new Promise(resolve => setTimeout(resolve, 10));

      // Config still only called once (cached via loadPhase)
      expect(mockInitialiseConfig).toHaveBeenCalledTimes(1);

      // Context was called 3 times with the same cached config:
      // 1st in loadPhase (firstContext), 2nd in initialise (context), 3rd on navigation (context)
      expect(mockInitialiseContext).toHaveBeenCalledTimes(3);
      expect(mockInitialiseContext).toHaveBeenNthCalledWith(1, { window: mockWindow, config: cachedConfig });
      expect(mockInitialiseContext).toHaveBeenNthCalledWith(2, { window: mockWindow, config: cachedConfig });
      expect(mockInitialiseContext).toHaveBeenNthCalledWith(3, { window: mockWindow, config: cachedConfig });
    });
  });
});
