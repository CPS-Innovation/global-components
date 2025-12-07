import { Config } from "cps-global-configuration";
import { caseDetailsSubscriptionFactory } from "./case-details-subscription-factory";
import { LocalStorageCache } from "../cache/create-cache";
import { Handover } from "../handover/Handover";
import { CaseDetails } from "./CaseDetails";
import { CaseIdentifiers } from "../context/CaseIdentifiers";

type CaseIdentifiersHandler = (v: CaseIdentifiers | undefined) => void;

describe("caseDetailsSubscriptionFactory", () => {
  const mockCaseDetails: CaseDetails = {
    id: 123,
    urn: "12AB3456789",
    isDcfCase: true,
  };

  const createMockConfig = (): Config =>
    ({
      CACHE_CONFIG: {
        maxAge: 3600000,
        maxItems: 100,
      },
    }) as Config;

  const createMockEntityCache = () => ({
    get: jest.fn(),
    set: jest.fn(),
    fetch: jest.fn(),
    invalidate: jest.fn(),
    invalidateAll: jest.fn(),
    getStats: jest.fn(),
  });

  const createMockCache = (entityCache = createMockEntityCache()): LocalStorageCache =>
    ({
      createEntityCache: jest.fn().mockReturnValue(entityCache),
      clearAll: jest.fn(),
      getStats: jest.fn(),
    }) as unknown as LocalStorageCache;

  const createMockFetch = (responseData: unknown = mockCaseDetails): typeof fetch =>
    jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(responseData),
    }) as unknown as typeof fetch;

  const createMockHandoverFound = (caseDetails: CaseDetails = mockCaseDetails): Handover => ({
    found: true,
    data: { caseDetails },
  });

  const createMockHandoverNotFound = (): Handover => ({
    found: false,
    error: null,
  });

  describe("factory initialization", () => {
    it("should create entity cache with correct parameters", () => {
      const mockCache = createMockCache();
      const mockConfig = createMockConfig();

      caseDetailsSubscriptionFactory({
        config: mockConfig,
        cache: mockCache,
        fetch: createMockFetch(),
        handover: createMockHandoverNotFound(),
        setNextHandover: jest.fn(),
      });

      expect(mockCache.createEntityCache).toHaveBeenCalledWith(
        "case-details",
        expect.any(Object),
        expect.objectContaining({
          cacheableFields: ["id", "urn", "isDcfCase"],
          maxAge: 3600000,
          maxItems: 100,
        }),
      );
    });

    it("should set cache from handover data when handover is found", () => {
      const entityCache = createMockEntityCache();
      const mockCache = createMockCache(entityCache);

      caseDetailsSubscriptionFactory({
        config: createMockConfig(),
        cache: mockCache,
        fetch: createMockFetch(),
        handover: createMockHandoverFound(mockCaseDetails),
        setNextHandover: jest.fn(),
      });

      expect(entityCache.set).toHaveBeenCalledWith("123", mockCaseDetails);
    });

    it("should not set cache when handover is not found", () => {
      const entityCache = createMockEntityCache();
      const mockCache = createMockCache(entityCache);

      caseDetailsSubscriptionFactory({
        config: createMockConfig(),
        cache: mockCache,
        fetch: createMockFetch(),
        handover: createMockHandoverNotFound(),
        setNextHandover: jest.fn(),
      });

      expect(entityCache.set).not.toHaveBeenCalled();
    });

    it("should return onChange subscription type", () => {
      const factory = caseDetailsSubscriptionFactory({
        config: createMockConfig(),
        cache: createMockCache(),
        fetch: createMockFetch(),
        handover: createMockHandoverNotFound(),
        setNextHandover: jest.fn(),
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
    it("should return early when caseIdentifiers is null", () => {
      const entityCache = createMockEntityCache();
      const mockCache = createMockCache(entityCache);

      const factory = caseDetailsSubscriptionFactory({
        config: createMockConfig(),
        cache: mockCache,
        fetch: createMockFetch(),
        handover: createMockHandoverNotFound(),
        setNextHandover: jest.fn(),
      });

      const subscription = factory({
        get: jest.fn(),
        register: jest.fn(),
        mergeTags: jest.fn(),
      });

      if (subscription.type === "onChange") {
        subscription.handler.handler(null as any);
      }

      expect(entityCache.fetch).not.toHaveBeenCalled();
    });

    it("should return early when caseIdentifiers is undefined", () => {
      const entityCache = createMockEntityCache();
      const mockCache = createMockCache(entityCache);

      const factory = caseDetailsSubscriptionFactory({
        config: createMockConfig(),
        cache: mockCache,
        fetch: createMockFetch(),
        handover: createMockHandoverNotFound(),
        setNextHandover: jest.fn(),
      });

      const subscription = factory({
        get: jest.fn(),
        register: jest.fn(),
        mergeTags: jest.fn(),
      });

      if (subscription.type === "onChange") {
        subscription.handler.handler(undefined);
      }

      expect(entityCache.fetch).not.toHaveBeenCalled();
    });

    it("should fetch case details with correct parameters", () => {
      const entityCache = createMockEntityCache();
      entityCache.fetch.mockResolvedValue({ id: 123, urn: "12AB3456789", isDcfCase: true });
      const mockCache = createMockCache(entityCache);

      const factory = caseDetailsSubscriptionFactory({
        config: createMockConfig(),
        cache: mockCache,
        fetch: createMockFetch(),
        handover: createMockHandoverNotFound(),
        setNextHandover: jest.fn(),
      });

      const subscription = factory({
        get: jest.fn(),
        register: jest.fn(),
        mergeTags: jest.fn(),
      });

      if (subscription.type === "onChange") {
        (subscription.handler.handler as CaseIdentifiersHandler)({ caseId: "456" });
      }

      expect(entityCache.fetch).toHaveBeenCalledWith("456", expect.any(Function), { fields: ["id", "urn", "isDcfCase"] });
    });

    it("should merge tags after fetching case details", async () => {
      const entityCache = createMockEntityCache();
      entityCache.fetch.mockResolvedValue({ id: 123, urn: "12AB3456789", isDcfCase: true });
      const mockCache = createMockCache(entityCache);
      const mergeTags = jest.fn();

      const factory = caseDetailsSubscriptionFactory({
        config: createMockConfig(),
        cache: mockCache,
        fetch: createMockFetch(),
        handover: createMockHandoverNotFound(),
        setNextHandover: jest.fn(),
      });

      const subscription = factory({
        get: jest.fn(),
        register: jest.fn(),
        mergeTags,
      });

      if (subscription.type === "onChange") {
        (subscription.handler.handler as CaseIdentifiersHandler)({ caseId: "456" });
      }

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mergeTags).toHaveBeenCalledWith({
        caseDetailsTags: { urn: "12AB3456789", isDcfCase: true },
      });
    });

    it("should register case details after fetching", async () => {
      const entityCache = createMockEntityCache();
      const fetchedCaseDetails = { id: 123, urn: "12AB3456789", isDcfCase: true };
      entityCache.fetch.mockResolvedValue(fetchedCaseDetails);
      const mockCache = createMockCache(entityCache);
      const register = jest.fn();

      const factory = caseDetailsSubscriptionFactory({
        config: createMockConfig(),
        cache: mockCache,
        fetch: createMockFetch(),
        handover: createMockHandoverNotFound(),
        setNextHandover: jest.fn(),
      });

      const subscription = factory({
        get: jest.fn(),
        register,
        mergeTags: jest.fn(),
      });

      if (subscription.type === "onChange") {
        (subscription.handler.handler as CaseIdentifiersHandler)({ caseId: "456" });
      }

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(register).toHaveBeenCalledWith({ caseDetails: fetchedCaseDetails });
    });

    it("should set next handover after fetching case details", async () => {
      const entityCache = createMockEntityCache();
      const fetchedCaseDetails = { id: 123, urn: "12AB3456789", isDcfCase: true };
      entityCache.fetch.mockResolvedValue(fetchedCaseDetails);
      const mockCache = createMockCache(entityCache);
      const setNextHandover = jest.fn();

      const factory = caseDetailsSubscriptionFactory({
        config: createMockConfig(),
        cache: mockCache,
        fetch: createMockFetch(),
        handover: createMockHandoverNotFound(),
        setNextHandover,
      });

      const subscription = factory({
        get: jest.fn(),
        register: jest.fn(),
        mergeTags: jest.fn(),
      });

      if (subscription.type === "onChange") {
        (subscription.handler.handler as CaseIdentifiersHandler)({ caseId: "456" });
      }

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(setNextHandover).toHaveBeenCalledWith({ caseDetails: fetchedCaseDetails });
    });
  });

  describe("fetcher function", () => {
    it("should pass correct URL to fetch function", async () => {
      const entityCache = createMockEntityCache();
      entityCache.fetch.mockImplementation(async (id, fetcher) => {
        await fetcher(id);
        return mockCaseDetails;
      });
      const mockCache = createMockCache(entityCache);
      const mockFetchFn = createMockFetch();

      const factory = caseDetailsSubscriptionFactory({
        config: createMockConfig(),
        cache: mockCache,
        fetch: mockFetchFn,
        handover: createMockHandoverNotFound(),
        setNextHandover: jest.fn(),
      });

      const subscription = factory({
        get: jest.fn(),
        register: jest.fn(),
        mergeTags: jest.fn(),
      });

      if (subscription.type === "onChange") {
        (subscription.handler.handler as CaseIdentifiersHandler)({ caseId: "999" });
      }

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockFetchFn).toHaveBeenCalledWith("/api/global-components/cases/999/summary");
    });
  });
});
