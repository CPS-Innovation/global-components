import { Config } from "cps-global-configuration";
import { FoundContext } from "../context/FoundContext";
import { ReadyStateHelper, Subscribe } from "../../store/store";
import { GetToken } from "../auth/GetToken";
import { AnalyticsEventData } from "../analytics/analytics-event";

const mockFetchWithCircuitBreaker = jest.fn();
jest.mock("../fetch/fetch-with-circuit-breaker", () => ({
  fetchWithCircuitBreaker: (...args: unknown[]) => mockFetchWithCircuitBreaker(...args),
}));

const mockFetchWithAuthFactory = jest.fn();
jest.mock("../fetch/fetch-with-auth-factory", () => ({
  fetchWithAuthFactory: (...args: unknown[]) => mockFetchWithAuthFactory(...args),
}));

const mockCaseDetailsSubscriptionFactory = jest.fn();
jest.mock("./case-details-subscription-factory", () => ({
  caseDetailsSubscriptionFactory: (...args: unknown[]) => mockCaseDetailsSubscriptionFactory(...args),
}));

describe("initialiseCaseDetailsData", () => {
  const createMockConfig = (gatewayUrl: string | null = null): Config =>
    ({
      GATEWAY_URL: gatewayUrl,
    } as Config);

  const createMockContext = (): FoundContext =>
    ({
      found: true,
      contextDefinition: { name: "test-context" },
      pathTags: { caseId: "123" },
      path: "/test",
      contextIds: "test",
      msalRedirectUrl: "https://test.com",
    } as unknown as FoundContext);

  const createMockSubscribe = (): Subscribe => jest.fn() as Subscribe;

  const createMockSetNextHandover = () => jest.fn();

  const createMockSetNextRecentCases = () => jest.fn();

  const createMockGetToken = (): GetToken => jest.fn().mockResolvedValue("mock-token");

  const createMockReadyState = (): ReadyStateHelper => jest.fn() as unknown as ReadyStateHelper;

  const createMockTrackEvent = () => jest.fn<void, [AnalyticsEventData]>();

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchWithCircuitBreaker.mockReturnValue((f: typeof fetch) => f);
    mockFetchWithAuthFactory.mockReturnValue((f: typeof fetch) => f);
    mockCaseDetailsSubscriptionFactory.mockReturnValue(jest.fn());
  });

  describe("when GATEWAY_URL is not configured", () => {
    it("should return early and not set up data access", () => {
      const { initialiseCaseDetailsData } = require("./initialise-case-details-data");
      const config = createMockConfig(null);
      const subscribe = createMockSubscribe();

      initialiseCaseDetailsData({
        config,
        context: createMockContext(),
        subscribe,
        setNextHandover: createMockSetNextHandover(),
        setNextRecentCases: createMockSetNextRecentCases(),
        getToken: createMockGetToken(),
        readyState: createMockReadyState(),
        trackEvent: createMockTrackEvent(),
      });

      expect(mockCaseDetailsSubscriptionFactory).not.toHaveBeenCalled();
      expect(subscribe).not.toHaveBeenCalled();
    });

    it("should return early when GATEWAY_URL is empty string", () => {
      const { initialiseCaseDetailsData } = require("./initialise-case-details-data");
      const config = createMockConfig("");
      const subscribe = createMockSubscribe();

      initialiseCaseDetailsData({
        config,
        context: createMockContext(),
        subscribe,
        setNextHandover: createMockSetNextHandover(),
        setNextRecentCases: createMockSetNextRecentCases(),
        getToken: createMockGetToken(),
        readyState: createMockReadyState(),
        trackEvent: createMockTrackEvent(),
      });

      expect(mockCaseDetailsSubscriptionFactory).not.toHaveBeenCalled();
      expect(subscribe).not.toHaveBeenCalled();
    });
  });

  describe("when GATEWAY_URL is configured", () => {
    const gatewayUrl = "https://gateway.example.com/";

    it("should set up fetch with circuit breaker", () => {
      const { initialiseCaseDetailsData } = require("./initialise-case-details-data");
      const config = createMockConfig(gatewayUrl);
      const trackEvent = createMockTrackEvent();

      initialiseCaseDetailsData({
        config,
        context: createMockContext(),
        subscribe: createMockSubscribe(),
        setNextHandover: createMockSetNextHandover(),
        setNextRecentCases: createMockSetNextRecentCases(),
        getToken: createMockGetToken(),
        readyState: createMockReadyState(),
        trackEvent,
      });

      expect(mockFetchWithCircuitBreaker).toHaveBeenCalledWith({ config, trackEvent });
    });

    it("should set up fetch with auth factory", () => {
      const { initialiseCaseDetailsData } = require("./initialise-case-details-data");
      const config = createMockConfig(gatewayUrl);
      const context = createMockContext();
      const getToken = createMockGetToken();
      const readyState = createMockReadyState();

      initialiseCaseDetailsData({
        config,
        context,
        subscribe: createMockSubscribe(),
        setNextHandover: createMockSetNextHandover(),
        setNextRecentCases: createMockSetNextRecentCases(),
        getToken,
        readyState,
        trackEvent: createMockTrackEvent(),
      });

      expect(mockFetchWithAuthFactory).toHaveBeenCalledWith({ config, context, getToken, readyState });
    });

    it("should call caseDetailsSubscriptionFactory with correct parameters", () => {
      const { initialiseCaseDetailsData } = require("./initialise-case-details-data");
      const config = createMockConfig(gatewayUrl);
      const setNextHandover = createMockSetNextHandover();
      const setNextRecentCases = createMockSetNextRecentCases();

      initialiseCaseDetailsData({
        config,
        context: createMockContext(),
        subscribe: createMockSubscribe(),
        setNextHandover,
        setNextRecentCases,
        getToken: createMockGetToken(),
        readyState: createMockReadyState(),
        trackEvent: createMockTrackEvent(),
      });

      expect(mockCaseDetailsSubscriptionFactory).toHaveBeenCalledWith({
        setNextHandover,
        setNextRecentCases,
        fetch: expect.any(Function),
      });
    });

    it("should subscribe to the case details subscription", () => {
      const { initialiseCaseDetailsData } = require("./initialise-case-details-data");
      const config = createMockConfig(gatewayUrl);
      const subscribe = createMockSubscribe();
      const mockSubscription = jest.fn();
      mockCaseDetailsSubscriptionFactory.mockReturnValue(mockSubscription);

      initialiseCaseDetailsData({
        config,
        context: createMockContext(),
        subscribe,
        setNextHandover: createMockSetNextHandover(),
        setNextRecentCases: createMockSetNextRecentCases(),
        getToken: createMockGetToken(),
        readyState: createMockReadyState(),
        trackEvent: createMockTrackEvent(),
      });

      expect(subscribe).toHaveBeenCalledWith(mockSubscription);
    });

    it("should pipe fetch through circuit breaker and auth factory", () => {
      const { initialiseCaseDetailsData } = require("./initialise-case-details-data");
      const config = createMockConfig(gatewayUrl);
      const context = createMockContext();
      const getToken = createMockGetToken();
      const readyState = createMockReadyState();
      const trackEvent = createMockTrackEvent();

      // Track call order to verify pipe composition
      const callOrder: string[] = [];
      mockFetchWithCircuitBreaker.mockImplementation(() => {
        callOrder.push("circuitBreaker");
        return (f: typeof fetch) => f;
      });
      mockFetchWithAuthFactory.mockImplementation(() => {
        callOrder.push("authFactory");
        return (f: typeof fetch) => f;
      });

      initialiseCaseDetailsData({
        config,
        context,
        subscribe: createMockSubscribe(),
        setNextHandover: createMockSetNextHandover(),
        setNextRecentCases: createMockSetNextRecentCases(),
        getToken,
        readyState,
        trackEvent,
      });

      // Both should be called (order determined by pipe)
      expect(callOrder).toContain("circuitBreaker");
      expect(callOrder).toContain("authFactory");
    });
  });
});
