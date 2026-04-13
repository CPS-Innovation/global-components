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
  initialiseCorrelationIds: ({ register, registerCorrelationIdsWithAnalytics }: any) => ({
    initialiseCorrelationIdsForContext: () => {
      const result = mockInitialiseCorrelationIds();
      register({ correlationIds: result });
      registerCorrelationIdsWithAnalytics(result);
      return result;
    },
  }),
}));

// Mock runNowAndOnNavigation - runs handler immediately and captures it for future navigation triggers
let capturedNavigationHandler: (() => void) | null = null;
jest.mock("./services/browser/navigation/navigation", () => ({
  runNowAndOnNavigation: (handler: () => void) => {
    capturedNavigationHandler = handler;
    handler(); // Run immediately (first context change)
  },
}));

// Helper to trigger navigation in tests (handler has its own try/catch inside)
const triggerNavigation = () => {
  if (capturedNavigationHandler) {
    capturedNavigationHandler();
  }
};

// Mock all the services - these return jest.fn() so we can inspect calls
const mockInitialiseAuth = jest.fn();
jest.mock("./services/auth/initialise-auth", () => ({
  initialiseAuth: ({ register, registerAuthWithAnalytics, setAuthHint, ...rest }: any) => {
    // initialiseAuth returns { initialiseAuthForContext } synchronously — a factory called per context
    const initialiseAuthForContext = async (ctx: any) => {
      const result = await mockInitialiseAuth({ ...rest, context: ctx });
      register({ auth: result.auth });
      registerAuthWithAnalytics(result.auth);
      if (result.auth.isAuthed) {
        setAuthHint(result.auth);
      }
      return result;
    };
    return { initialiseAuthForContext };
  },
}));

const mockInitialiseAnalytics = jest.fn();
jest.mock("./services/analytics/initialise-analytics", () => ({
  initialiseAnalytics: mockInitialiseAnalytics,
}));

const mockInitialiseConfig = jest.fn();
jest.mock("./services/config/initialise-config", () => ({
  initialiseConfig: async ({ register, ...rest }: any) => {
    const result = await mockInitialiseConfig(rest);
    register({ config: result });
    return result;
  },
}));

const mockInitialiseContext = jest.fn();
jest.mock("./services/context/initialise-context", () => ({
  initialiseContext: ({ register, resetContextSpecificTags }: any) => ({
    initialiseContextForContext: () => {
      const result = mockInitialiseContext();
      resetContextSpecificTags?.(result);
      register({ context: result });
      return result;
    },
  }),
}));

const mockGetApplicationFlags = jest.fn();
jest.mock("./services/application-flags/initialise-application-flags", () => ({
  initialiseApplicationFlags: ({ register }: { register: (arg: { flags: any }) => void }) => {
    const flags = mockGetApplicationFlags();
    register({ flags });
    return flags;
  },
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

const mockInitialiseTabTitle = jest.fn();
jest.mock("./services/browser/tab-title/initialise-tab-title", () => ({
  initialiseTabTitle: mockInitialiseTabTitle,
}));

const mockInitialiseCaseDetailsDataForContext = jest.fn();
const mockInitialiseCaseDetailsDataForContextOptimistic = jest.fn();
jest.mock("./services/data/initialise-case-details-data", () => ({
  initialiseCaseDetailsData: () => ({
    initialiseCaseDetailsDataForContext: mockInitialiseCaseDetailsDataForContext,
    initialiseCaseDetailsDataForContextOptimistic: mockInitialiseCaseDetailsDataForContextOptimistic,
  }),
}));

const mockInitialiseCmsSessionHint = jest.fn();
jest.mock("./services/state/cms-session/initialise-cms-session-hint", () => ({
  initialiseCmsSessionHint: async ({ register, ...rest }: any) => {
    const result = await mockInitialiseCmsSessionHint(rest);
    register({ cmsSessionHint: result, cmsSessionTags: { handoverEndpoint: result?.result?.handoverEndpoint || "" } });
    return result;
  },
}));

const mockInitialiseHandover = jest.fn();
jest.mock("./services/state/handover/intialise-handover", () => ({
  initialiseHandover: async ({ register, ...rest }: any) => {
    const result = await mockInitialiseHandover(rest);
    register({ handover: result.handover });
    return result;
  },
}));

const mockInitialiseRootUrl = jest.fn();
jest.mock("./services/root-url/initialise-root-url", () => ({
  initialiseRootUrl: ({ register }: { register: (arg: { rootUrl: string }) => void }) => {
    const rootUrl = mockInitialiseRootUrl();
    register({ rootUrl });
    return rootUrl;
  },
}));

const mockInitialisePreview = jest.fn();
jest.mock("./services/state/preview/initialise-preview", () => ({
  initialisePreview: async ({ register, ...rest }: any) => {
    const result = await mockInitialisePreview(rest);
    register({ preview: result });
    return result;
  },
}));

const mockInitialiseSettings = jest.fn();
jest.mock("./services/state/settings/initialise-settings", () => ({
  initialiseSettings: mockInitialiseSettings,
}));

const mockInitialiseRecentCases = jest.fn();
jest.mock("./services/state/recent-cases/initialise-recent-cases", () => ({
  initialiseRecentCases: mockInitialiseRecentCases,
}));

const mockInitialiseAuthHint = jest.fn();
jest.mock("./services/state/auth-hint/initialise-auth-hint", () => ({
  initialiseAuthHint: async ({ register, ...rest }: any) => {
    const result = await mockInitialiseAuthHint(rest);
    register({ authHint: result.authHint });
    return result;
  },
}));

jest.mock("./services/notifications/initialise-notifications", () => ({
  initialiseNotifications: async ({ register, handlers }: any) => {
    register({ notifications: [], dismissedNotificationIds: [] });
    handlers.dismissNotification = () => {};
  },
}));

const mockInitialiseNavigateCms = jest.fn();
jest.mock("./services/navigate-cms/initialise-navigate-cms", () => ({
  initialiseNavigateCms: mockInitialiseNavigateCms,
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
    isLocalDevelopment: false,
    isOutSystems: false,
    environment: "test",
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
  const mockRegisterCorrelationIds = jest.fn();
  mockInitialiseAnalytics.mockReturnValue({
    trackPageView: mockTrackPageView,
    trackEvent: mockTrackEvent,
    trackException: mockTrackException,
    registerAuthWithAnalytics: jest.fn(),
    registerCorrelationIdsWithAnalytics: mockRegisterCorrelationIds,
    registerCaseIdentifiersWithAnalytics: jest.fn(),
  });

  mockInitialiseRootUrl.mockReturnValue("https://example.com/env/components/script.js");

  mockInitialisePreview.mockResolvedValue({ enabled: false, features: [] });

  mockInitialiseSettings.mockResolvedValue({ fontSize: "default" });

  mockInitialiseRecentCases.mockReturnValue({
    setNextRecentCases: jest.fn(),
  });

  mockInitialiseAuthHint.mockResolvedValue({
    authHint: { found: false, error: new Error("no hint") },
    setAuthHint: jest.fn(),
  });

  return {
    mockTrackPageView,
    mockTrackEvent,
    mockTrackException,
    mockRegisterCorrelationIds,
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
    mockWindow = createMockWindow();
    defaultMocks = setupDefaultMocks();

    // Replace global window for tests
    (global as any).window = mockWindow;
  });

  afterEach(() => {
    delete (global as any).window;
  });

  describe("duplicate script load guard", () => {
    it("should not initialise a second time if already initialised", async () => {
      const globalScript = require("./global-script").default;

      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseCorrelationIds).toHaveBeenCalledTimes(1);

      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseCorrelationIds).toHaveBeenCalledTimes(1);
    });
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
          context: expect.any(Object),
        }),
      );
    });

    it("should register the navigation listener", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      // Wait for async initialization to complete (listener is registered inside initialise())
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(capturedNavigationHandler).toBeDefined();
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
          isLocalDevelopment: false,
          isOutSystems: false,
          environment: "test",
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

    it("should register authHint to store", async () => {
      const testAuthHint = {
        found: true as const,
        result: { authResult: { isAuthed: true as const, username: "hint@example.com", name: "Hint User", objectId: "obj-hint", groups: [] }, timestamp: 12345 },
      };
      mockInitialiseAuthHint.mockResolvedValue({
        authHint: testAuthHint,
        setAuthHint: jest.fn(),
      });

      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      const state = getReadyState()("authHint");
      expect(state.isReady).toBe(true);
      if (state.isReady) {
        expect(state.state.authHint).toEqual(testAuthHint);
      }
    });

    it("should pass flags to initialiseAuth so it can decide mock vs real internally", async () => {
      const testFlags = {
        e2eTestMode: { isE2eTestMode: true },
        isLocalDevelopment: false,
        isOutSystems: false,
        environment: "test",
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
        isLocalDevelopment: false,
        isOutSystems: false,
        environment: "test",
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

    it("should pass flags to initialiseTabTitle so it can enable by default in the test environment", async () => {
      const testFlags = {
        e2eTestMode: { isE2eTestMode: true },
        isLocalDevelopment: false,
        isOutSystems: false,
        environment: "test",
      };
      mockGetApplicationFlags.mockReturnValue(testFlags);

      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseTabTitle).toHaveBeenCalledWith(
        expect.objectContaining({
          flags: testFlags,
        }),
      );
    });
  });

  describe("data access initialization", () => {
    it("should call optimistic and full case details methods when caseIdentifiers are available", async () => {
      // Context needs a caseId in pathTags so caseIdentifiers gets set and the waiter resolves
      mockInitialiseContext.mockReturnValue({
        found: true,
        contextDefinition: { name: "test-context" },
        pathTags: { caseId: "123" },
      });

      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockInitialiseCaseDetailsDataForContextOptimistic).toHaveBeenCalledWith({ caseId: "123" });
      expect(mockInitialiseCaseDetailsDataForContext).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.any(Object),
          caseIdentifiers: { caseId: "123" },
          getToken: expect.any(Function),
          correlationIds: expect.any(Object),
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
      expect(defaultMocks.mockRegisterCorrelationIds).toHaveBeenNthCalledWith(1, {
        scriptLoadCorrelationId: "uuid-1",
        navigationCorrelationId: "uuid-1",
      });

      // Trigger SPA navigation
      triggerNavigation();

      await new Promise(resolve => setTimeout(resolve, 10));

      // Second call should have same scriptLoadCorrelationId but different navigationCorrelationId
      expect(defaultMocks.mockRegisterCorrelationIds).toHaveBeenNthCalledWith(2, {
        scriptLoadCorrelationId: "uuid-1",
        navigationCorrelationId: "uuid-2",
      });
    });

    it("should call initialiseContext again on navigation", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      // On first load: initialiseContext called once (contextChangePhase)
      expect(mockInitialiseContext).toHaveBeenCalledTimes(1);

      // Trigger SPA navigation
      triggerNavigation();

      await new Promise(resolve => setTimeout(resolve, 10));

      // Context should be reinitialised on navigation
      expect(mockInitialiseContext).toHaveBeenCalledTimes(2);
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

    it("should call initialiseAuthForContext on each navigation", async () => {
      const globalScript = require("./global-script").default;

      globalScript();

      await new Promise(resolve => setTimeout(resolve, 10));

      // Auth runs once on initial contextChangePhase
      expect(mockInitialiseAuth).toHaveBeenCalledTimes(1);

      // Trigger SPA navigation
      triggerNavigation();

      await new Promise(resolve => setTimeout(resolve, 10));

      // Auth runs again on navigation (initialiseAuthForContext called per context change)
      expect(mockInitialiseAuth).toHaveBeenCalledTimes(2);
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
      expect(defaultMocks.mockRegisterCorrelationIds).toHaveBeenLastCalledWith({
        scriptLoadCorrelationId: "uuid-1",
        navigationCorrelationId: "uuid-4",
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
        registerAuthWithAnalytics: jest.fn(),
        registerCorrelationIdsWithAnalytics: jest.fn(),
        registerCaseIdentifiersWithAnalytics: jest.fn(),
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
      mockInitialiseRecentCases.mockImplementation(({ register }) => {
        register({ recentCases: testRecentCases });
        return { setNextRecentCases: jest.fn() };
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
        isLocalDevelopment: true,
        isOutSystems: false,
        environment: "test",
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

    it("should pass rootUrl and flags to initialiseCmsSessionHint", async () => {
      const testRootUrl = "https://test.example.com/env/script.js";
      mockInitialiseRootUrl.mockReturnValue(testRootUrl);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseCmsSessionHint).toHaveBeenCalledWith({
        rootUrl: testRootUrl,
        flags: expect.any(Object),
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

    it("should pass rootUrl to initialiseSettings", async () => {
      const testRootUrl = "https://test.example.com/env/script.js";
      mockInitialiseRootUrl.mockReturnValue(testRootUrl);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseSettings).toHaveBeenCalledWith({
        rootUrl: testRootUrl,
      });
    });

    it("should pass window and rootUrl to initialiseNavigateCms", async () => {
      const testRootUrl = "https://test.example.com/env/script.js";
      mockInitialiseRootUrl.mockReturnValue(testRootUrl);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseNavigateCms).toHaveBeenCalledWith({
        window: expect.anything(),
        rootUrl: testRootUrl,
      });
    });

    it("should pass rootUrl and config to initialiseRecentCases", async () => {
      const testRootUrl = "https://test.example.com/env/script.js";
      const testConfig = { CONTEXTS: [], GATEWAY_URL: null, RECENT_CASES_LIST_LENGTH: 5 };
      mockInitialiseRootUrl.mockReturnValue(testRootUrl);
      mockInitialiseConfig.mockResolvedValue(testConfig);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseRecentCases).toHaveBeenCalledWith(
        expect.objectContaining({
          rootUrl: testRootUrl,
          config: testConfig,
        }),
      );
    });

    it("should pass preview and settings to initialiseDomObservation for accessibilitySubscriber", async () => {
      const testPreview = { result: { accessibility: true } };
      const testSettings = { fontSize: "large" };
      mockInitialisePreview.mockResolvedValue(testPreview);
      mockInitialiseSettings.mockResolvedValue(testSettings);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      const callArgs = mockInitialiseDomObservation.mock.calls[0];
      // First arg is the options object containing window, preview, and settings
      expect(callArgs[0]).toEqual(
        expect.objectContaining({
          window: mockWindow,
          preview: testPreview,
          settings: testSettings,
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

      expect(mockInitialiseContext).toHaveBeenCalled();
    });

    it("should pass config, context and flags to initialiseAuth", async () => {
      const testFlags = {
        e2eTestMode: { isE2eTestMode: false },
        isLocalDevelopment: false,
        isOutSystems: false,
        environment: "test",
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

      // mockInitialiseAuth is called by initialiseAuthForContext with the contextChangePhase context
      expect(mockInitialiseAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          config: testConfig,
          context: testContext,
        }),
      );
    });

    it("should pass all required dependencies to initialiseAnalytics", async () => {
      const testFlags = {
        e2eTestMode: { isE2eTestMode: false },
        isLocalDevelopment: false,
        isOutSystems: false,
        environment: "test",
      };
      const testConfig = { CONTEXTS: [], GATEWAY_URL: null, APP_INSIGHTS_KEY: "test-key" };
      const testBuild = { version: "2.0.0", buildDate: "2024-06-15" };

      (mockWindow as any).cps_global_components_build = testBuild;
      mockGetApplicationFlags.mockReturnValue(testFlags);
      mockInitialiseConfig.mockResolvedValue(testConfig);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockInitialiseAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({
          window: mockWindow,
          config: testConfig,
          build: testBuild,
          flags: testFlags,
          authHint: expect.anything(),
        }),
      );
      // Verify auth is NOT passed directly
      expect(mockInitialiseAnalytics).not.toHaveBeenCalledWith(
        expect.objectContaining({
          auth: expect.any(Object),
        }),
      );
    });

    it("should pass context to trackPageView", async () => {
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
      });
    });

    it("should call case details methods when caseIdentifiers are available", async () => {
      mockInitialiseContext.mockReturnValue({
        found: true,
        contextDefinition: { name: "test-context" },
        pathTags: { caseId: "456" },
      });

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockInitialiseCaseDetailsDataForContextOptimistic).toHaveBeenCalledWith({ caseId: "456" });
      expect(mockInitialiseCaseDetailsDataForContext).toHaveBeenCalledWith(
        expect.objectContaining({
          caseIdentifiers: { caseId: "456" },
        }),
      );
    });
  });

  describe("operation order", () => {
    // These tests verify that operations happen in the correct order
    // using mock call order tracking

    it("should initialise in correct order: rootUrl -> navigateCms -> flags -> cmsSessionHint/handover/preview/settings (parallel) -> config -> recentCases -> analytics (auth runs async later)", async () => {
      const callOrder: string[] = [];

      mockInitialiseRootUrl.mockImplementation(() => {
        callOrder.push("rootUrl");
        return "https://example.com/script.js";
      });

      mockInitialiseNavigateCms.mockImplementation(() => {
        callOrder.push("navigateCms");
      });

      mockGetApplicationFlags.mockImplementation(() => {
        callOrder.push("flags");
        return { e2eTestMode: { isE2eTestMode: false }, isLocalDevelopment: false, isOutSystems: false, environment: "test" };
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

      mockInitialiseSettings.mockImplementation(async () => {
        callOrder.push("settings");
        return { fontSize: "default" };
      });

      mockInitialiseRecentCases.mockImplementation(() => {
        callOrder.push("recentCases");
        return { setNextRecentCases: jest.fn() };
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
        return { trackPageView: jest.fn(), trackEvent: jest.fn(), trackException: jest.fn(), registerAuthWithAnalytics: jest.fn(), registerCorrelationIdsWithAnalytics: jest.fn(), registerCaseIdentifiersWithAnalytics: jest.fn() };
      });

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify order - rootUrl and flags first, then parallel async calls (cmsSessionHint/handover/preview/settings),
      // then config, then recentCases (register is fire-and-forget)
      // Analytics now comes BEFORE auth (auth is non-blocking to avoid UI delay)
      // accessibilitySubscriber is now part of DOM observation (called via initialiseDomForContext)
      expect(callOrder.indexOf("rootUrl")).toBeLessThan(callOrder.indexOf("navigateCms"));
      expect(callOrder.indexOf("navigateCms")).toBeLessThan(callOrder.indexOf("flags"));
      expect(callOrder.indexOf("flags")).toBeLessThan(callOrder.indexOf("cmsSessionHint"));
      expect(callOrder.indexOf("flags")).toBeLessThan(callOrder.indexOf("handover"));
      expect(callOrder.indexOf("flags")).toBeLessThan(callOrder.indexOf("preview"));
      expect(callOrder.indexOf("flags")).toBeLessThan(callOrder.indexOf("settings"));
      expect(callOrder.indexOf("config")).toBeLessThan(callOrder.indexOf("recentCases"));
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

      // initialiseContext (in contextChangePhase) should only be called after config resolves
      let contextCalledAfterConfig = false;
      mockInitialiseContext.mockImplementation(() => {
        if (configResolved) contextCalledAfterConfig = true;
        return { found: true, contextDefinition: {}, pathTags: {} };
      });

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(contextCalledAfterConfig).toBe(true);
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
        return { trackPageView: jest.fn(), trackEvent: jest.fn(), trackException: jest.fn(), registerAuthWithAnalytics: jest.fn(), registerCorrelationIdsWithAnalytics: jest.fn(), registerCaseIdentifiersWithAnalytics: jest.fn() };
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

      // initialiseContext called twice: contextChangePhase (initial), contextChangePhase (navigation)
      mockInitialiseContext
        .mockReturnValueOnce(initialContext)
        .mockReturnValueOnce(updatedContext);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(defaultMocks.mockTrackPageView).toHaveBeenNthCalledWith(1, {
        context: initialContext,
      });

      // Navigate
      triggerNavigation();
      await new Promise(resolve => setTimeout(resolve, 10));

      // Second trackPageView uses updated context
      expect(defaultMocks.mockTrackPageView).toHaveBeenNthCalledWith(2, {
        context: updatedContext,
      });
    });

    it("should pass updated context to initialiseDomForContext on navigation", async () => {
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

      // initialiseContext called twice: contextChangePhase (initial), contextChangePhase (navigation)
      mockInitialiseContext
        .mockReturnValueOnce(initialContext)
        .mockReturnValueOnce(updatedContext);

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(defaultMocks.mockInitialiseDomForContext).toHaveBeenNthCalledWith(1, { context: initialContext });

      // Navigate
      triggerNavigation();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(defaultMocks.mockInitialiseDomForContext).toHaveBeenNthCalledWith(2, { context: updatedContext });
    });

    it("should use cached config (not refetch) when context changes on navigation", async () => {
      const cachedConfig = { CONTEXTS: [], GATEWAY_URL: null, CACHED: true };
      mockInitialiseConfig.mockResolvedValue(cachedConfig);

      // initialiseContext called twice: contextChangePhase (initial), contextChangePhase (navigation)
      mockInitialiseContext
        .mockReturnValueOnce({ found: true, contextDefinition: { name: "ctx1" }, pathTags: {} })
        .mockReturnValueOnce({ found: true, contextDefinition: { name: "ctx2" }, pathTags: {} });

      const globalScript = require("./global-script").default;
      globalScript();
      await new Promise(resolve => setTimeout(resolve, 10));

      // Config called once (in startupPhase)
      expect(mockInitialiseConfig).toHaveBeenCalledTimes(1);

      // Navigate
      triggerNavigation();
      await new Promise(resolve => setTimeout(resolve, 10));

      // Config still only called once (cached via startupPhase)
      expect(mockInitialiseConfig).toHaveBeenCalledTimes(1);

      // initialiseContext called twice: initial contextChangePhase + navigation contextChangePhase
      expect(mockInitialiseContext).toHaveBeenCalledTimes(2);
    });
  });
});
