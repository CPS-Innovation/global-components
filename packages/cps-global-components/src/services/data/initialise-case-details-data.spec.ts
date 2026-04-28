import { Config } from "cps-global-configuration";
import { FoundContext } from "../context/FoundContext";
import { MergeTags, Register } from "../../store/store";
import { GetToken } from "cps-global-auth";
import { AnalyticsEventData } from "../analytics/analytics-event";

const mockFetchWithCircuitBreaker = jest.fn();
jest.mock("../fetch/fetch-with-circuit-breaker", () => ({
  fetchWithCircuitBreaker: (...args: unknown[]) => mockFetchWithCircuitBreaker(...args),
}));

const mockFetchWithAuthFactory = jest.fn();
jest.mock("../fetch/fetch-with-auth-factory", () => ({
  fetchWithAuthFactory: (...args: unknown[]) => mockFetchWithAuthFactory(...args),
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

  const makeProps = (gatewayUrl: string | null = null) => ({
    config: createMockConfig(gatewayUrl),
    handover: { found: false, error: new Error("none") } as any,
    setNextHandover: jest.fn(),
    setNextRecentCases: jest.fn(),
    trackEvent: jest.fn<void, [AnalyticsEventData]>(),
    trackException: jest.fn<void, [Error]>(),
    register: jest.fn() as Register,
    mergeTags: jest.fn().mockReturnValue({}) as MergeTags,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchWithCircuitBreaker.mockReturnValue((f: typeof fetch) => f);
    mockFetchWithAuthFactory.mockReturnValue((f: typeof fetch) => f);
  });

  describe("when GATEWAY_URL is not configured", () => {
    it("should not fetch when initialiseCaseDetailsDataForContext is called", () => {
      const { initialiseCaseDetailsData } = require("./initialise-case-details-data");
      const { initialiseCaseDetailsDataForContext } = initialiseCaseDetailsData(makeProps(null));

      initialiseCaseDetailsDataForContext({
        context: createMockContext(),
        caseIdentifiers: { caseId: "123" },
        getToken: jest.fn().mockResolvedValue("token") as GetToken,
        correlationIds: { scriptLoadCorrelationId: "s", navigationCorrelationId: "n" },
      });

      expect(mockFetchWithCircuitBreaker).not.toHaveBeenCalled();
    });
  });

  describe("when GATEWAY_URL is configured", () => {
    const gatewayUrl = "https://gateway.example.com/";

    it("should set up fetch with circuit breaker", () => {
      const { initialiseCaseDetailsData } = require("./initialise-case-details-data");
      const props = makeProps(gatewayUrl);
      const { initialiseCaseDetailsDataForContext } = initialiseCaseDetailsData(props);

      initialiseCaseDetailsDataForContext({
        context: createMockContext(),
        caseIdentifiers: { caseId: "123" },
        getToken: jest.fn().mockResolvedValue("token") as GetToken,
        correlationIds: { scriptLoadCorrelationId: "s", navigationCorrelationId: "n" },
      });

      expect(mockFetchWithCircuitBreaker).toHaveBeenCalledWith({ config: props.config, trackEvent: props.trackEvent });
    });

    it("should set up fetch with auth factory", () => {
      const { initialiseCaseDetailsData } = require("./initialise-case-details-data");
      const props = makeProps(gatewayUrl);
      const { initialiseCaseDetailsDataForContext } = initialiseCaseDetailsData(props);
      const context = createMockContext();
      const getToken = jest.fn().mockResolvedValue("token") as GetToken;
      const correlationIds = { scriptLoadCorrelationId: "s", navigationCorrelationId: "n" };

      initialiseCaseDetailsDataForContext({ context, caseIdentifiers: { caseId: "123" }, getToken, correlationIds });

      expect(mockFetchWithAuthFactory).toHaveBeenCalledWith({ config: props.config, context, getToken, correlationIds });
    });

    it("should pipe fetch through circuit breaker and auth factory", () => {
      const { initialiseCaseDetailsData } = require("./initialise-case-details-data");
      const props = makeProps(gatewayUrl);
      const { initialiseCaseDetailsDataForContext } = initialiseCaseDetailsData(props);

      const callOrder: string[] = [];
      mockFetchWithCircuitBreaker.mockImplementation(() => {
        callOrder.push("circuitBreaker");
        return (f: typeof fetch) => f;
      });
      mockFetchWithAuthFactory.mockImplementation(() => {
        callOrder.push("authFactory");
        return (f: typeof fetch) => f;
      });

      initialiseCaseDetailsDataForContext({
        context: createMockContext(),
        caseIdentifiers: { caseId: "123" },
        getToken: jest.fn().mockResolvedValue("token") as GetToken,
        correlationIds: { scriptLoadCorrelationId: "s", navigationCorrelationId: "n" },
      });

      expect(callOrder).toContain("circuitBreaker");
      expect(callOrder).toContain("authFactory");
    });
  });

  describe("optimistic path", () => {
    it("should set case details from handover when caseId matches", () => {
      const { initialiseCaseDetailsData } = require("./initialise-case-details-data");
      const mockRegister = jest.fn();
      const mockMergeTags = jest.fn().mockReturnValue({});
      const props = {
        ...makeProps("https://gateway.example.com/"),
        handover: { found: true, result: { caseId: 123, caseDetails: { urn: "test-urn" } } },
        register: mockRegister,
        mergeTags: mockMergeTags,
      };
      const { initialiseCaseDetailsDataForContextOptimistic } = initialiseCaseDetailsData(props);

      initialiseCaseDetailsDataForContextOptimistic({ caseId: "123" });

      expect(mockRegister).toHaveBeenCalledWith({ caseDetails: { found: true, result: { urn: "test-urn" } } });
      expect(mockMergeTags).toHaveBeenCalled();
    });

    it("should skip full fetch if optimistic already handled the case", () => {
      const { initialiseCaseDetailsData } = require("./initialise-case-details-data");
      const props = {
        ...makeProps("https://gateway.example.com/"),
        handover: { found: true, result: { caseId: 123, caseDetails: { urn: "test-urn" } } },
      };
      const { initialiseCaseDetailsDataForContext, initialiseCaseDetailsDataForContextOptimistic } = initialiseCaseDetailsData(props);

      initialiseCaseDetailsDataForContextOptimistic({ caseId: "123" });
      initialiseCaseDetailsDataForContext({
        context: createMockContext(),
        caseIdentifiers: { caseId: "123" },
        getToken: jest.fn().mockResolvedValue("token") as GetToken,
        correlationIds: { scriptLoadCorrelationId: "s", navigationCorrelationId: "n" },
      });

      // Should not set up fetch since optimistic handled it
      expect(mockFetchWithCircuitBreaker).not.toHaveBeenCalled();
    });
  });
});
