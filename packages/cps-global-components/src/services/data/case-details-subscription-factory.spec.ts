import { caseDetailsSubscriptionFactory } from "./case-details-subscription-factory";
import { Handover } from "../state/handover/Handover";
import { CaseDetails } from "./CaseDetails";
import { CaseIdentifiers } from "../context/CaseIdentifiers";
import { Result } from "../../utils/Result";
import { MonitoringCode } from "./MonitoringCode";

type CaseIdentifiersHandler = (v: CaseIdentifiers | undefined) => void;

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 10));

describe("caseDetailsSubscriptionFactory", () => {
  const mockCaseDetails: CaseDetails = {
    id: 123,
    urn: "12AB3456789",
    isDcfCase: true,
    leadDefendantFirstNames: "",
    leadDefendantSurname: "",
    leadDefendantType: "",
    numberOfDefendants: 1,
  };

  const mockMonitoringCodes: MonitoringCode[] = [{ code: "MC1", description: "Test Code", type: "test", disabled: false, isAssigned: true }];

  const createMockFetch = (caseDetailsResponse: unknown = mockCaseDetails, monitoringCodesResponse: unknown = mockMonitoringCodes): typeof fetch =>
    jest.fn().mockImplementation((url: string) => {
      if (url.includes("/monitoring-codes")) {
        return Promise.resolve({
          ok: true,
          json: jest.fn().mockResolvedValue(monitoringCodesResponse),
        });
      }
      return Promise.resolve({
        ok: true,
        json: jest.fn().mockResolvedValue(caseDetailsResponse),
      });
    }) as unknown as typeof fetch;

  const createMockHandoverFound = (caseId: number, caseDetails?: CaseDetails, monitoringCodes?: MonitoringCode[]): Result<Handover> => ({
    found: true,
    result: { caseId, caseDetails, monitoringCodes },
  });

  const createMockHandoverNotFound = (): Result<Handover> => ({
    found: false,
    error: {} as Error,
  });

  describe("factory initialization", () => {
    it("should return onChange subscription type", () => {
      const factory = caseDetailsSubscriptionFactory({
        fetch: createMockFetch(),
        handover: createMockHandoverNotFound(),
        setNextHandover: jest.fn(),
        setNextRecentCases: jest.fn(),
      });

      const result = factory({
        get: jest.fn(),
        register: jest.fn(),
        mergeTags: jest.fn(),
      });

      expect(result.type).toBe("onChange");
      if (result.type === "onChange") {
        expect(result.handler).toHaveProperty("propName", "caseIdentifiers");
        expect(typeof result.handler.handler).toBe("function");
      }
    });
  });

  describe("subscription handler", () => {
    it("should register undefined for both caseDetails and caseMonitoringCodes when caseIdentifiers is undefined", () => {
      const register = jest.fn();

      const factory = caseDetailsSubscriptionFactory({
        fetch: createMockFetch(),
        handover: createMockHandoverNotFound(),
        setNextHandover: jest.fn(),
        setNextRecentCases: jest.fn(),
      });

      const subscription = factory({
        get: jest.fn(),
        register,
        mergeTags: jest.fn(),
      });

      if (subscription.type === "onChange") {
        subscription.handler.handler(undefined);
      }

      expect(register).toHaveBeenCalledWith({ caseDetails: undefined, caseMonitoringCodes: undefined });
    });

    it("should use handover data when available for matching caseId", async () => {
      const register = jest.fn();
      const mergeTags = jest.fn();
      const mockFetch = createMockFetch();

      const factory = caseDetailsSubscriptionFactory({
        fetch: mockFetch,
        handover: createMockHandoverFound(123, mockCaseDetails, mockMonitoringCodes),
        setNextHandover: jest.fn(),
        setNextRecentCases: jest.fn(),
      });

      const subscription = factory({
        get: jest.fn(),
        register,
        mergeTags,
      });

      if (subscription.type === "onChange") {
        (subscription.handler.handler as CaseIdentifiersHandler)({ caseId: "123" });
      }

      await flushPromises();

      expect(mockFetch).not.toHaveBeenCalled();
      expect(register).toHaveBeenCalledWith({ caseDetails: { found: true, result: mockCaseDetails } });
      expect(register).toHaveBeenCalledWith({ caseMonitoringCodes: { found: true, result: mockMonitoringCodes } });
      expect(mergeTags).toHaveBeenCalledWith({
        caseDetailsTags: { urn: "12AB3456789", isDcfCase: "true" },
      });
    });

    it("should fetch when handover caseId does not match", async () => {
      const mockFetch = createMockFetch();

      const factory = caseDetailsSubscriptionFactory({
        fetch: mockFetch,
        handover: createMockHandoverFound(999, mockCaseDetails, mockMonitoringCodes),
        setNextHandover: jest.fn(),
        setNextRecentCases: jest.fn(),
      });

      const subscription = factory({
        get: jest.fn(),
        register: jest.fn(),
        mergeTags: jest.fn(),
      });

      if (subscription.type === "onChange") {
        (subscription.handler.handler as CaseIdentifiersHandler)({ caseId: "456" });
      }

      await flushPromises();

      expect(mockFetch).toHaveBeenCalledWith("/api/global-components/cases/456/summary");
      expect(mockFetch).toHaveBeenCalledWith("/api/global-components/cases/456/monitoring-codes?assignedOnly=true");
    });

    it("should fetch both endpoints when no handover exists", async () => {
      const mockFetch = createMockFetch();

      const factory = caseDetailsSubscriptionFactory({
        fetch: mockFetch,
        handover: createMockHandoverNotFound(),
        setNextHandover: jest.fn(),
        setNextRecentCases: jest.fn(),
      });

      const subscription = factory({
        get: jest.fn(),
        register: jest.fn(),
        mergeTags: jest.fn(),
      });

      if (subscription.type === "onChange") {
        (subscription.handler.handler as CaseIdentifiersHandler)({ caseId: "456" });
      }

      await flushPromises();

      expect(mockFetch).toHaveBeenCalledWith("/api/global-components/cases/456/summary");
      expect(mockFetch).toHaveBeenCalledWith("/api/global-components/cases/456/monitoring-codes?assignedOnly=true");
    });

    it("should merge tags after fetching case details", async () => {
      const mergeTags = jest.fn();

      const factory = caseDetailsSubscriptionFactory({
        fetch: createMockFetch(),
        handover: createMockHandoverNotFound(),
        setNextHandover: jest.fn(),
        setNextRecentCases: jest.fn(),
      });

      const subscription = factory({
        get: jest.fn(),
        register: jest.fn(),
        mergeTags,
      });

      if (subscription.type === "onChange") {
        (subscription.handler.handler as CaseIdentifiersHandler)({ caseId: "456" });
      }

      await flushPromises();

      expect(mergeTags).toHaveBeenCalledWith({
        caseDetailsTags: { urn: "12AB3456789", isDcfCase: "true" },
      });
    });

    it("should register case details and monitoring codes separately", async () => {
      const register = jest.fn();

      const factory = caseDetailsSubscriptionFactory({
        fetch: createMockFetch(),
        handover: createMockHandoverNotFound(),
        setNextHandover: jest.fn(),
        setNextRecentCases: jest.fn(),
      });

      const subscription = factory({
        get: jest.fn(),
        register,
        mergeTags: jest.fn(),
      });

      if (subscription.type === "onChange") {
        (subscription.handler.handler as CaseIdentifiersHandler)({ caseId: "456" });
      }

      await flushPromises();

      expect(register).toHaveBeenCalledWith({ caseDetails: { found: true, result: mockCaseDetails } });
      expect(register).toHaveBeenCalledWith({ caseMonitoringCodes: { found: true, result: mockMonitoringCodes } });
    });

    it("should set next handover with caseId after both fetches complete", async () => {
      const setNextHandover = jest.fn();

      const factory = caseDetailsSubscriptionFactory({
        fetch: createMockFetch(),
        handover: createMockHandoverNotFound(),
        setNextHandover,
        setNextRecentCases: jest.fn(),
      });

      const subscription = factory({
        get: jest.fn(),
        register: jest.fn(),
        mergeTags: jest.fn(),
      });

      if (subscription.type === "onChange") {
        (subscription.handler.handler as CaseIdentifiersHandler)({ caseId: "456" });
      }

      await flushPromises();

      expect(setNextHandover).toHaveBeenCalledWith({
        caseId: 456,
        caseDetails: mockCaseDetails,
        monitoringCodes: mockMonitoringCodes,
      });
    });

    it("should set next handover even when using handover data", async () => {
      const setNextHandover = jest.fn();

      const factory = caseDetailsSubscriptionFactory({
        fetch: createMockFetch(),
        handover: createMockHandoverFound(123, mockCaseDetails, mockMonitoringCodes),
        setNextHandover,
        setNextRecentCases: jest.fn(),
      });

      const subscription = factory({
        get: jest.fn(),
        register: jest.fn(),
        mergeTags: jest.fn(),
      });

      if (subscription.type === "onChange") {
        (subscription.handler.handler as CaseIdentifiersHandler)({ caseId: "123" });
      }

      await flushPromises();

      expect(setNextHandover).toHaveBeenCalledWith({
        caseId: 123,
        caseDetails: mockCaseDetails,
        monitoringCodes: mockMonitoringCodes,
      });
    });
  });
});
