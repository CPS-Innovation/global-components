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

// Mock uuid to return predictable values
const mockUuidv4 = jest.fn();
jest.mock("uuid", () => ({
  v4: () => mockUuidv4(),
}));

// Mock all the services - these return jest.fn() so we can inspect calls
const mockHandleSetOverrideMode = jest.fn();
jest.mock("./services/override-mode/handle-set-override-mode", () => ({
  handleSetOverrideMode: mockHandleSetOverrideMode,
}));

const mockInitialiseAuth = jest.fn();
jest.mock("./services/auth/initialise-auth", () => ({
  initialiseAuth: mockInitialiseAuth,
}));

const mockInitialiseMockAuth = jest.fn();
jest.mock("./services/auth/initialise-mock-auth", () => ({
  initialiseMockAuth: mockInitialiseMockAuth,
}));

const mockInitialiseAnalytics = jest.fn();
jest.mock("./services/analytics/initialise-analytics", () => ({
  initialiseAnalytics: mockInitialiseAnalytics,
}));

const mockInitialiseMockAnalytics = jest.fn();
jest.mock("./services/analytics/initialise-mock-analytics", () => ({
  initialiseMockAnalytics: mockInitialiseMockAnalytics,
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
jest.mock("./services/dom/initialise-dom-observation", () => ({
  initialiseDomObservation: mockInitialiseDomObservation,
}));

jest.mock("./services/dom/dom-tag-mutation-subscriber", () => ({
  domTagMutationSubscriber: jest.fn(),
}));

jest.mock("./services/outsystems-shim/outsystems-shim-subscriber", () => ({
  outSystemsShimSubscribers: [],
}));

const mockCreateCache = jest.fn();
jest.mock("./services/cache/create-cache", () => ({
  createCache: mockCreateCache,
}));

const mockFetchWithAuthFactory = jest.fn();
jest.mock("./services/api/fetch-with-auth-factory", () => ({
  fetchWithAuthFactory: mockFetchWithAuthFactory,
}));

const mockCaseDetailsSubscriptionFactory = jest.fn();
jest.mock("./services/data/case-details-subscription-factory", () => ({
  caseDetailsSubscriptionFactory: mockCaseDetailsSubscriptionFactory,
}));

const mockFetchWithCircuitBreaker = jest.fn();
jest.mock("./services/api/fetch-with-circuit-breaker", () => ({
  fetchWithCircuitBreaker: mockFetchWithCircuitBreaker,
}));

const mockInitialiseCmsSessionHint = jest.fn();
jest.mock("./services/cms-session/initialise-cms-session-hint", () => ({
  initialiseCmsSessionHint: mockInitialiseCmsSessionHint,
}));

const mockInitialiseHandover = jest.fn();
jest.mock("./services/handover/intialise-handover", () => ({
  initialiseHandover: mockInitialiseHandover,
}));

const mockInitialiseInterimDcfNavigation = jest.fn();
jest.mock("./services/outsystems-shim/initialise-interim-dcf-navigation", () => ({
  initialiseInterimDcfNavigation: mockInitialiseInterimDcfNavigation,
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
  let uuidCounter = 0;
  mockUuidv4.mockImplementation(() => `uuid-${++uuidCounter}`);

  mockHandleSetOverrideMode.mockImplementation(() => {});

  mockGetApplicationFlags.mockReturnValue({
    e2eTestMode: { isE2eTestMode: false },
    isOverrideMode: false,
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
    jest.clearAllMocks();
    clearCachedResultCache();
    mockWindow = createMockWindow();
    defaultMocks = setupDefaultMocks();

    // Replace global window for tests
    (global as any).window = mockWindow;
  });

  afterEach(() => {
    delete (global as any).window;
  });

  describe("initial script load", () => {
    it("should call handleSetOverrideMode on startup", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      expect(mockHandleSetOverrideMode).toHaveBeenCalledWith({ window: mockWindow });
    });

    it("should use the same correlationId for scriptLoadCorrelationId and navigationCorrelationId on first load", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 10));

      // Check that the first uuid was used for both correlation IDs
      expect(mockUuidv4).toHaveBeenCalledTimes(1);

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

      expect(mockWindow.navigation.addEventListener).toHaveBeenCalledWith("navigatesuccess", expect.any(Function));
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
          isOverrideMode: false,
          isDevelopment: false,
        });
      }
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

    it("should use mock auth when in e2e test mode", async () => {
      mockGetApplicationFlags.mockReturnValue({
        e2eTestMode: { isE2eTestMode: true },
        isOverrideMode: false,
        isDevelopment: false,
      });

      mockInitialiseMockAuth.mockResolvedValue({
        auth: { isAuthed: true, username: "e2e-user", groups: [], objectId: "e2e-obj" },
        getToken: jest.fn(),
      });

      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseMockAuth).toHaveBeenCalled();
      expect(mockInitialiseAuth).not.toHaveBeenCalled();
    });

    it("should use mock analytics when in e2e test mode", async () => {
      mockGetApplicationFlags.mockReturnValue({
        e2eTestMode: { isE2eTestMode: true },
        isOverrideMode: false,
        isDevelopment: false,
      });

      mockInitialiseMockAuth.mockResolvedValue({
        auth: { isAuthed: true, username: "e2e-user", groups: [], objectId: "e2e-obj" },
        getToken: jest.fn(),
      });

      mockInitialiseMockAnalytics.mockReturnValue({
        trackPageView: jest.fn(),
        trackEvent: jest.fn(),
        trackException: jest.fn(),
      });

      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseMockAnalytics).toHaveBeenCalled();
      expect(mockInitialiseAnalytics).not.toHaveBeenCalled();
    });
  });

  describe("data access (GATEWAY_URL enabled)", () => {
    beforeEach(() => {
      mockInitialiseConfig.mockResolvedValue({
        CONTEXTS: [],
        GATEWAY_URL: "https://gateway.example.com/",
      });

      mockCreateCache.mockReturnValue({
        get: jest.fn(),
        set: jest.fn(),
      });

      // These functions are "fetch transformers" - they take a fetch function and return a modified fetch
      mockFetchWithCircuitBreaker.mockReturnValue((realFetch: typeof fetch) => realFetch);
      mockFetchWithAuthFactory.mockReturnValue((realFetch: typeof fetch) => realFetch);
    });

    it("should set up cache when GATEWAY_URL is configured", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCreateCache).toHaveBeenCalledWith("cps-global-components-cache");
    });

    it("should set up case details subscription when GATEWAY_URL is configured", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCaseDetailsSubscriptionFactory).toHaveBeenCalled();
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
      mockWindow.navigation._triggerEvent("navigatesuccess", { type: "navigatesuccess" });

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
      mockWindow.navigation._triggerEvent("navigatesuccess", { type: "navigatesuccess" });

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
      mockWindow.navigation._triggerEvent("navigatesuccess", { type: "navigatesuccess" });

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
      mockWindow.navigation._triggerEvent("navigatesuccess", { type: "navigatesuccess" });

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
      mockWindow.navigation._triggerEvent("navigatesuccess", { type: "navigatesuccess" });

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
      mockWindow.navigation._triggerEvent("navigatesuccess", { type: "navigatesuccess" });

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
      mockWindow.navigation._triggerEvent("navigatesuccess", { type: "navigatesuccess" });

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
      mockWindow.navigation._triggerEvent("navigatesuccess", { type: "navigatesuccess" });

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
      mockWindow.navigation._triggerEvent("navigatesuccess", { type: "navigatesuccess" });

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
      mockWindow.navigation._triggerEvent("navigatesuccess", { type: "navigatesuccess" });

      await new Promise(resolve => setTimeout(resolve, 10));

      state = getReadyState()("pathTags");
      expect(state.state.pathTags).toEqual({ differentTag: "differentValue" });
    });

    it("should handle multiple navigations correctly", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      // Trigger multiple SPA navigations
      mockWindow.navigation._triggerEvent("navigatesuccess", {});
      await new Promise(resolve => setTimeout(resolve, 10));

      mockWindow.navigation._triggerEvent("navigatesuccess", {});
      await new Promise(resolve => setTimeout(resolve, 10));

      mockWindow.navigation._triggerEvent("navigatesuccess", {});
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should have 4 page views (initial + 3 navigations)
      expect(defaultMocks.mockTrackPageView).toHaveBeenCalledTimes(4);

      // Should have generated 4 uuids (1 for initial, 1 for each navigation)
      expect(mockUuidv4).toHaveBeenCalledTimes(4);

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
      mockWindow.navigation._triggerEvent("navigatesuccess", {});
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(getReadyState()().state.initialisationStatus).toBe("broken");

      // Reset context mock
      mockInitialiseContext.mockReturnValue({
        found: true,
        contextDefinition: { name: "recovered-context" },
        pathTags: {},
      });

      // Trigger another navigation - should recover
      mockWindow.navigation._triggerEvent("navigatesuccess", {});
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

  describe("cmsSessionHint and handover initialization", () => {
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
      mockWindow.navigation._triggerEvent("navigatesuccess", {});

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseCmsSessionHint).toHaveBeenCalledTimes(1);
    });

    it("should NOT reinitialize handover on navigation (cached)", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseHandover).toHaveBeenCalledTimes(1);

      // Trigger SPA navigation
      mockWindow.navigation._triggerEvent("navigatesuccess", {});

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseHandover).toHaveBeenCalledTimes(1);
    });
  });

  describe("end-to-end data flow", () => {
    // These tests verify that the correct data flows from one step to the next
    // A control flow refactor should not break these dependencies

    it("should pass flags to initialiseConfig", async () => {
      const testFlags = {
        e2eTestMode: { isE2eTestMode: false },
        isOverrideMode: true,
        isDevelopment: true,
        customFlag: "test-value",
      };
      mockGetApplicationFlags.mockReturnValue(testFlags);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseConfig).toHaveBeenCalledWith({ flags: testFlags });
    });

    it("should pass config and flags to initialiseCmsSessionHint", async () => {
      const testFlags = {
        e2eTestMode: { isE2eTestMode: false },
        isOverrideMode: false,
        isDevelopment: false,
      };
      const testConfig = {
        CONTEXTS: [{ name: "test" }],
        GATEWAY_URL: "https://test-gateway.com/",
        CUSTOM_CONFIG: "custom-value",
      };
      mockGetApplicationFlags.mockReturnValue(testFlags);
      mockInitialiseConfig.mockResolvedValue(testConfig);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseCmsSessionHint).toHaveBeenCalledWith({
        config: testConfig,
        flags: testFlags,
      });
    });

    it("should pass config and flags to initialiseHandover", async () => {
      const testFlags = {
        e2eTestMode: { isE2eTestMode: false },
        isOverrideMode: false,
        isDevelopment: false,
      };
      const testConfig = {
        CONTEXTS: [],
        GATEWAY_URL: null,
        HANDOVER_CONFIG: "test",
      };
      mockGetApplicationFlags.mockReturnValue(testFlags);
      mockInitialiseConfig.mockResolvedValue(testConfig);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseHandover).toHaveBeenCalledWith({
        config: testConfig,
        flags: testFlags,
      });
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

    it("should pass config and context to initialiseAuth (non-e2e mode)", async () => {
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
      mockGetApplicationFlags.mockReturnValue({
        e2eTestMode: { isE2eTestMode: false },
        isOverrideMode: false,
        isDevelopment: false,
      });
      mockInitialiseConfig.mockResolvedValue(testConfig);
      mockInitialiseContext.mockReturnValue(testContext);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseAuth).toHaveBeenCalledWith({
        config: testConfig,
        context: testContext,
      });
    });

    it("should pass flags to initialiseMockAuth (e2e mode)", async () => {
      const testFlags = {
        e2eTestMode: { isE2eTestMode: true, mockUser: "test-e2e-user" },
        isOverrideMode: false,
        isDevelopment: false,
      };
      mockGetApplicationFlags.mockReturnValue(testFlags);
      mockInitialiseMockAuth.mockResolvedValue({
        auth: { isAuthed: true, username: "e2e", groups: [], objectId: "e2e" },
        getToken: jest.fn(),
      });
      mockInitialiseMockAnalytics.mockReturnValue({
        trackPageView: jest.fn(),
        trackEvent: jest.fn(),
        trackException: jest.fn(),
      });

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseMockAuth).toHaveBeenCalledWith({ flags: testFlags });
    });

    it("should pass all required dependencies to initialiseAnalytics", async () => {
      const testConfig = { CONTEXTS: [], GATEWAY_URL: null, APP_INSIGHTS_KEY: "test-key" };
      const testAuth = { isAuthed: true, username: "analytics-test", groups: ["group1"], objectId: "obj-456" };
      const testBuild = { version: "2.0.0", buildDate: "2024-06-15" };
      const testCmsSessionHint = { hint: "analytics-hint", sessionId: "sess-123" };

      (mockWindow as any).cps_global_components_build = testBuild;
      mockInitialiseConfig.mockResolvedValue(testConfig);
      mockInitialiseAuth.mockResolvedValue({
        auth: testAuth,
        getToken: jest.fn(),
      });
      mockInitialiseCmsSessionHint.mockResolvedValue(testCmsSessionHint);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({
          window: mockWindow,
          config: testConfig,
          auth: testAuth,
          build: testBuild,
          cmsSessionHint: testCmsSessionHint,
          // readyState is also passed but is a function, harder to assert exactly
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

    it("should pass all required dependencies to caseDetailsSubscriptionFactory when GATEWAY_URL is set", async () => {
      const testConfig = { CONTEXTS: [], GATEWAY_URL: "https://gateway.test.com/" };
      const testHandover = { caseId: "case-789", source: "test" };
      const mockSetNextHandover = jest.fn();
      const mockCache = { get: jest.fn(), set: jest.fn(), delete: jest.fn() };

      mockInitialiseConfig.mockResolvedValue(testConfig);
      mockInitialiseHandover.mockResolvedValue({
        handover: testHandover,
        setNextHandover: mockSetNextHandover,
      });
      mockCreateCache.mockReturnValue(mockCache);
      mockFetchWithCircuitBreaker.mockReturnValue((realFetch: typeof fetch) => realFetch);
      mockFetchWithAuthFactory.mockReturnValue((realFetch: typeof fetch) => realFetch);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCaseDetailsSubscriptionFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          config: testConfig,
          cache: mockCache,
          handover: testHandover,
          setNextHandover: mockSetNextHandover,
          // fetch is the augmented fetch, hard to assert exactly
        }),
      );
    });
  });

  describe("operation order", () => {
    // These tests verify that operations happen in the correct order
    // using mock call order tracking

    it("should initialise in correct order: flags -> config -> cmsSessionHint/handover -> context -> auth -> analytics", async () => {
      const callOrder: string[] = [];

      mockGetApplicationFlags.mockImplementation(() => {
        callOrder.push("flags");
        return { e2eTestMode: { isE2eTestMode: false }, isOverrideMode: false, isDevelopment: false };
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

      // Verify order - config must come after flags, context after config, auth after context, analytics after auth
      expect(callOrder.indexOf("flags")).toBeLessThan(callOrder.indexOf("config"));
      expect(callOrder.indexOf("config")).toBeLessThan(callOrder.indexOf("cmsSessionHint"));
      expect(callOrder.indexOf("config")).toBeLessThan(callOrder.indexOf("handover"));
      expect(callOrder.indexOf("config")).toBeLessThan(callOrder.indexOf("context"));
      expect(callOrder.indexOf("context")).toBeLessThan(callOrder.indexOf("auth"));
      expect(callOrder.indexOf("auth")).toBeLessThan(callOrder.indexOf("analytics"));
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

    it("should await auth before initialising analytics", async () => {
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
        // This should only be called after auth is resolved
        expect(authResolved).toBe(true);
        return { trackPageView: jest.fn(), trackEvent: jest.fn(), trackException: jest.fn() };
      });

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockInitialiseAnalytics).toHaveBeenCalled();
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
      mockInitialiseContext
        .mockReturnValueOnce(firstContext)
        .mockReturnValueOnce(initialContext)
        .mockReturnValueOnce(updatedContext);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      // First trackPageView uses context from initialise (second call to initialiseContext)
      expect(defaultMocks.mockTrackPageView).toHaveBeenNthCalledWith(1, {
        context: initialContext,
        correlationIds: expect.any(Object),
      });

      // Navigate
      mockWindow.navigation._triggerEvent("navigatesuccess", {});
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
      mockInitialiseContext
        .mockReturnValueOnce(firstContext)
        .mockReturnValueOnce(initialContext)
        .mockReturnValueOnce(updatedContext);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      // initialiseDomForContext uses context from initialise (second call to initialiseContext)
      expect(defaultMocks.mockInitialiseDomForContext).toHaveBeenNthCalledWith(1, { context: initialContext });

      // Navigate
      mockWindow.navigation._triggerEvent("navigatesuccess", {});
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
      mockWindow.navigation._triggerEvent("navigatesuccess", {});
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
