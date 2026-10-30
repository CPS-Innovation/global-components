import { AuthResult, Config, FoundContext } from "cps-global-configuration";
import { MergeTags, Register } from "../../store/store";
import { GetToken } from "../auth/GetToken";
import { AnalyticsEventData } from "../analytics/analytics-event";

const authed: AuthResult = { isAuthed: true, username: "u@example.com", objectId: "obj-1", groups: [] };

const mockFetchWithCircuitBreaker = jest.fn();
jest.mock("../fetch/fetch-with-circuit-breaker", () => ({
  fetchWithCircuitBreaker: (...args: unknown[]) => mockFetchWithCircuitBreaker(...args),
}));

const mockFetchWithAuthFactory = jest.fn();
jest.mock("../fetch/fetch-with-auth-factory", () => ({
  fetchWithAuthFactory: (...args: unknown[]) => mockFetchWithAuthFactory(...args),
}));

// Defaults to never settling so tests that don't care about the fetch outcome stay synchronous.
const mockFetchAndValidate = jest.fn();
jest.mock("../fetch/fetch-and-validate", () => ({
  fetchAndValidate: (...args: unknown[]) => mockFetchAndValidate(...args),
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
    mockFetchAndValidate.mockReturnValue(new Promise(() => {}));
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
        auth: authed,
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
        auth: authed,
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

      initialiseCaseDetailsDataForContext({ context, caseIdentifiers: { caseId: "123" }, getToken, correlationIds, auth: authed });

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
        auth: authed,
      });

      expect(callOrder).toContain("circuitBreaker");
      expect(callOrder).toContain("authFactory");
    });

    it("should NOT fetch when auth is not authed (service makes the determination)", () => {
      const { initialiseCaseDetailsData } = require("./initialise-case-details-data");
      const { initialiseCaseDetailsDataForContext } = initialiseCaseDetailsData(makeProps(gatewayUrl));

      initialiseCaseDetailsDataForContext({
        context: createMockContext(),
        caseIdentifiers: { caseId: "123" },
        getToken: jest.fn().mockResolvedValue("token") as GetToken,
        correlationIds: { scriptLoadCorrelationId: "s", navigationCorrelationId: "n" },
        auth: { isAuthed: false, knownErrorType: "RedirectInFlight", reason: "redirect in flight" },
      });

      expect(mockFetchWithCircuitBreaker).not.toHaveBeenCalled();
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
        auth: authed,
      });

      // Should not set up fetch since optimistic handled it
      expect(mockFetchWithCircuitBreaker).not.toHaveBeenCalled();
    });
  });

  describe("caseDetailsTags lifecycle", () => {
    it("should clear caseDetailsTags on the first optimistic call (caseId goes from undefined to a value)", () => {
      const { initialiseCaseDetailsData } = require("./initialise-case-details-data");
      const mockRegister = jest.fn();
      const props = { ...makeProps("https://gateway.example.com/"), register: mockRegister };
      const { initialiseCaseDetailsDataForContextOptimistic } = initialiseCaseDetailsData(props);

      initialiseCaseDetailsDataForContextOptimistic({ caseId: "123" });

      expect(mockRegister).toHaveBeenCalledWith({ caseDetailsTags: {} });
    });

    it("should NOT clear caseDetailsTags when the caseId is unchanged across optimistic calls", () => {
      const { initialiseCaseDetailsData } = require("./initialise-case-details-data");
      const mockRegister = jest.fn();
      const props = { ...makeProps("https://gateway.example.com/"), register: mockRegister };
      const { initialiseCaseDetailsDataForContextOptimistic } = initialiseCaseDetailsData(props);

      initialiseCaseDetailsDataForContextOptimistic({ caseId: "123" });
      mockRegister.mockClear();

      initialiseCaseDetailsDataForContextOptimistic({ caseId: "123" });

      expect(mockRegister).not.toHaveBeenCalledWith({ caseDetailsTags: {} });
    });

    it("should clear caseDetailsTags when the caseId changes between optimistic calls", () => {
      const { initialiseCaseDetailsData } = require("./initialise-case-details-data");
      const mockRegister = jest.fn();
      const props = { ...makeProps("https://gateway.example.com/"), register: mockRegister };
      const { initialiseCaseDetailsDataForContextOptimistic } = initialiseCaseDetailsData(props);

      initialiseCaseDetailsDataForContextOptimistic({ caseId: "123" });
      mockRegister.mockClear();

      initialiseCaseDetailsDataForContextOptimistic({ caseId: "456" });

      expect(mockRegister).toHaveBeenCalledWith({ caseDetailsTags: {} });
    });

    it("should clear caseDetailsTags when caseIdentifiers go away after having had a case", () => {
      const { initialiseCaseDetailsData } = require("./initialise-case-details-data");
      const mockRegister = jest.fn();
      const props = { ...makeProps("https://gateway.example.com/"), register: mockRegister };
      const { initialiseCaseDetailsDataForContextOptimistic } = initialiseCaseDetailsData(props);

      initialiseCaseDetailsDataForContextOptimistic({ caseId: "123" });
      mockRegister.mockClear();

      initialiseCaseDetailsDataForContextOptimistic(undefined);

      expect(mockRegister).toHaveBeenCalledWith({ caseDetailsTags: {} });
    });
  });
  describe("case-details-retrieved analytics event", () => {
    const contextArgs = () => ({
      context: createMockContext(),
      caseIdentifiers: { caseId: "123" },
      getToken: jest.fn().mockResolvedValue("token") as GetToken,
      correlationIds: { scriptLoadCorrelationId: "s", navigationCorrelationId: "n" },
      auth: authed,
    });

    const caseDetailsEvents = (trackEvent: jest.Mock) => trackEvent.mock.calls.map(([event]) => event).filter(event => event.name === "case-details-retrieved");

    it("should track isDcfCase for the caseId when case details are fetched", async () => {
      const { initialiseCaseDetailsData } = require("./initialise-case-details-data");
      mockFetchAndValidate.mockResolvedValue({ id: 123, urn: "test-urn", isDcfCase: true });
      const props = makeProps("https://gateway.example.com/");
      const { initialiseCaseDetailsDataForContext } = initialiseCaseDetailsData(props);

      await initialiseCaseDetailsDataForContext(contextArgs());

      expect(caseDetailsEvents(props.trackEvent)).toEqual([{ name: "case-details-retrieved", caseId: 123, isDcfCase: true }]);
    });

    it("should not track when the fetch fails", async () => {
      const { initialiseCaseDetailsData } = require("./initialise-case-details-data");
      mockFetchAndValidate.mockRejectedValue(new Error("boom"));
      const props = makeProps("https://gateway.example.com/");
      const { initialiseCaseDetailsDataForContext } = initialiseCaseDetailsData(props);

      await initialiseCaseDetailsDataForContext(contextArgs());

      expect(caseDetailsEvents(props.trackEvent)).toEqual([]);
    });

    it("should not track when case details come from handover", () => {
      const { initialiseCaseDetailsData } = require("./initialise-case-details-data");
      const props = {
        ...makeProps("https://gateway.example.com/"),
        handover: { found: true, result: { caseId: 123, caseDetails: { urn: "test-urn", isDcfCase: true } } },
      };
      const { initialiseCaseDetailsDataForContext, initialiseCaseDetailsDataForContextOptimistic } = initialiseCaseDetailsData(props);

      initialiseCaseDetailsDataForContextOptimistic({ caseId: "123" });
      initialiseCaseDetailsDataForContext(contextArgs());

      expect(caseDetailsEvents(props.trackEvent)).toEqual([]);
    });

    it("should not track again on a refresh of the same case", async () => {
      const { initialiseCaseDetailsData } = require("./initialise-case-details-data");
      mockFetchAndValidate.mockResolvedValue({ id: 123, urn: "test-urn", isDcfCase: false });
      const props = makeProps("https://gateway.example.com/");
      const { initialiseCaseDetailsDataForContext, refreshCaseDetailsData } = initialiseCaseDetailsData(props);

      await initialiseCaseDetailsDataForContext(contextArgs());
      await refreshCaseDetailsData();

      expect(mockFetchAndValidate).toHaveBeenCalledTimes(2);
      expect(caseDetailsEvents(props.trackEvent)).toEqual([{ name: "case-details-retrieved", caseId: 123, isDcfCase: false }]);
    });
  });
});
