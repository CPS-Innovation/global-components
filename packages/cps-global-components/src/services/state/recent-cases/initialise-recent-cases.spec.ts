import { Config } from "cps-global-configuration";
import { CaseDetails } from "../../data/CaseDetails";
import { RecentCases } from "./recent-cases";
import { initialiseRecentCases } from "./initialise-recent-cases";

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockRegister = jest.fn();

jest.mock("../../data/get-case-defendant-headline", () => ({
  getCaseDefendantHeadline: jest.fn((caseDetails: CaseDetails) => `${caseDetails.leadDefendantSurname}, ${caseDetails.leadDefendantFirstNames}`),
}));

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

describe("initialiseRecentCases", () => {
  const rootUrl = "https://example.com/api/global-components/";
  const expectedUrl = "https://example.com/api/state/recent-cases";
  const config = { RECENT_CASES_LIST_LENGTH: 10 } as Config;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("when RECENT_CASES_LIST_LENGTH is not set", () => {
    it("should not fetch and return a no-op setNextRecentCases", async () => {
      const { setNextRecentCases } = await initialiseRecentCases({ rootUrl, config: {} as Config, register: mockRegister });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockRegister).not.toHaveBeenCalled();
      expect(typeof setNextRecentCases).toBe("function");

      // calling the no-op should not throw
      setNextRecentCases({} as CaseDetails);
    });

    it("should not fetch when RECENT_CASES_LIST_LENGTH is 0", async () => {
      const { setNextRecentCases } = await initialiseRecentCases({ rootUrl, config: { RECENT_CASES_LIST_LENGTH: 0 } as Config, register: mockRegister });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockRegister).not.toHaveBeenCalled();
      expect(typeof setNextRecentCases).toBe("function");
    });
  });

  describe("when fetch succeeds with valid data", () => {
    const validRecentCases: RecentCases = [
      { caseId: 123, urn: "12AB3456789", description: "Smith, John" },
      { caseId: 456, urn: "34CD5678901", description: "Doe, Jane" },
    ];

    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(validRecentCases),
      });
    });

    it("should call fetch with correct URL and credentials", async () => {
      await initialiseRecentCases({ rootUrl, config, register: mockRegister });

      expect(mockFetch).toHaveBeenCalledWith(expectedUrl, { credentials: "include" });
    });

    it("should register recentCases with found: true and the result", async () => {
      await initialiseRecentCases({ rootUrl, config, register: mockRegister });
      await flushPromises();

      expect(mockRegister).toHaveBeenCalledWith({ recentCases: { found: true, result: validRecentCases } });
    });

    it("should return a setNextRecentCases function", async () => {
      const { setNextRecentCases } = await initialiseRecentCases({ rootUrl, config, register: mockRegister });

      expect(typeof setNextRecentCases).toBe("function");
    });
  });

  describe("when existing list exceeds RECENT_CASES_LIST_LENGTH", () => {
    const twelveCases: RecentCases = Array.from({ length: 12 }, (_, i) => ({
      caseId: i + 1,
      urn: `URN${i + 1}`,
      description: `Case ${i + 1}`,
    }));

    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(twelveCases),
      });
    });

    it("should truncate the registered result to RECENT_CASES_LIST_LENGTH", async () => {
      await initialiseRecentCases({ rootUrl, config, register: mockRegister });
      await flushPromises();

      const registeredValue = mockRegister.mock.calls[0][0].recentCases;
      expect(registeredValue.found).toBe(true);
      expect(registeredValue.result).toHaveLength(10);
      expect(registeredValue.result).toEqual(twelveCases.slice(0, 10));
    });

    it("should respect a custom RECENT_CASES_LIST_LENGTH", async () => {
      const shortConfig = { RECENT_CASES_LIST_LENGTH: 3 } as Config;
      await initialiseRecentCases({ rootUrl, config: shortConfig, register: mockRegister });
      await flushPromises();

      const registeredValue = mockRegister.mock.calls[0][0].recentCases;
      expect(registeredValue.result).toHaveLength(3);
      expect(registeredValue.result).toEqual(twelveCases.slice(0, 3));
    });

    it("should not truncate when list is shorter than RECENT_CASES_LIST_LENGTH", async () => {
      const shortList: RecentCases = [{ caseId: 1, urn: "URN1", description: "Case 1" }];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(shortList),
      });

      await initialiseRecentCases({ rootUrl, config, register: mockRegister });
      await flushPromises();

      const registeredValue = mockRegister.mock.calls[0][0].recentCases;
      expect(registeredValue.result).toEqual(shortList);
    });

    it("should not truncate when fetch fails", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await initialiseRecentCases({ rootUrl, config, register: mockRegister });
      await flushPromises();

      const registeredValue = mockRegister.mock.calls[0][0].recentCases;
      expect(registeredValue.found).toBe(false);
    });
  });

  describe("when fetch succeeds but response is null", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(null),
      });
    });

    it("should register recentCases with found: true and an empty array", async () => {
      await initialiseRecentCases({ rootUrl, config, register: mockRegister });
      await flushPromises();

      expect(mockRegister).toHaveBeenCalledWith({ recentCases: { found: true, result: [] } });
    });
  });

  describe("when response is not ok", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });
    });

    it("should register recentCases with found: false", async () => {
      await initialiseRecentCases({ rootUrl, config, register: mockRegister });
      await flushPromises();

      expect(mockRegister).toHaveBeenCalledTimes(1);
      const registeredValue = mockRegister.mock.calls[0][0].recentCases;
      expect(registeredValue.found).toBe(false);
      expect(registeredValue.error?.message).toBe(`Call to ${expectedUrl} returned non-ok status code: 500 Internal Server Error`);
    });
  });

  describe("when fetch throws an error", () => {
    const networkError = new Error("Network error");

    beforeEach(() => {
      mockFetch.mockRejectedValue(networkError);
    });

    it("should register recentCases with found: false and the error", async () => {
      await initialiseRecentCases({ rootUrl, config, register: mockRegister });
      await flushPromises();

      expect(mockRegister).toHaveBeenCalledTimes(1);
      const registeredValue = mockRegister.mock.calls[0][0].recentCases;
      expect(registeredValue.found).toBe(false);
      expect(registeredValue.error).toBe(networkError);
    });
  });

  describe("setNextRecentCases", () => {
    const existingRecentCases: RecentCases = [
      { caseId: 123, urn: "12AB3456789", description: "Smith, John" },
      { caseId: 456, urn: "34CD5678901", description: "Doe, Jane" },
    ];

    const mockCaseDetails: CaseDetails = {
      id: 789,
      urn: "56EF7890123",
      isDcfCase: false,
      leadDefendantFirstNames: "Bob",
      leadDefendantSurname: "Wilson",
      leadDefendantType: "Person",
      numberOfDefendants: 1,
    };

    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(existingRecentCases),
      });
    });

    it("should not call fetch when caseDetails is undefined", async () => {
      const { setNextRecentCases } = await initialiseRecentCases({ rootUrl, config, register: mockRegister });
      mockFetch.mockClear();

      setNextRecentCases(undefined);

      await flushPromises();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should not call fetch when the case is already at the top of the list", async () => {
      const caseAlreadyAtTop: CaseDetails = {
        id: 123,
        urn: "12AB3456789",
        isDcfCase: false,
        leadDefendantFirstNames: "John",
        leadDefendantSurname: "Smith",
        leadDefendantType: "Person",
        numberOfDefendants: 1,
      };

      const { setNextRecentCases } = await initialiseRecentCases({ rootUrl, config, register: mockRegister });
      mockFetch.mockClear();

      setNextRecentCases(caseAlreadyAtTop);

      await flushPromises();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should call fetch with PUT to add new case to top of list", async () => {
      const { setNextRecentCases } = await initialiseRecentCases({ rootUrl, config, register: mockRegister });
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, path: "/state/recent-cases" }),
      });

      setNextRecentCases(mockCaseDetails);

      await flushPromises();

      expect(mockFetch).toHaveBeenCalledWith("https://example.com/api/state/recent-cases", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          { caseId: 789, urn: "56EF7890123", description: "Wilson, Bob" },
          { caseId: 123, urn: "12AB3456789", description: "Smith, John" },
          { caseId: 456, urn: "34CD5678901", description: "Doe, Jane" },
        ]),
        credentials: "include",
      });
    });

    it("should deduplicate existing case when moving to top", async () => {
      const caseAlreadyInList: CaseDetails = {
        id: 456,
        urn: "34CD5678901",
        isDcfCase: false,
        leadDefendantFirstNames: "Jane",
        leadDefendantSurname: "Doe",
        leadDefendantType: "Person",
        numberOfDefendants: 1,
      };

      const { setNextRecentCases } = await initialiseRecentCases({ rootUrl, config, register: mockRegister });
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, path: "/state/recent-cases" }),
      });

      setNextRecentCases(caseAlreadyInList);

      await flushPromises();

      expect(mockFetch).toHaveBeenCalledWith("https://example.com/api/state/recent-cases", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          { caseId: 456, urn: "34CD5678901", description: "Doe, Jane" },
          { caseId: 123, urn: "12AB3456789", description: "Smith, John" },
        ]),
        credentials: "include",
      });
    });

    it("should limit the list to RECENT_CASES_LIST_LENGTH items when adding a new case to a full list", async () => {
      const threeExistingCases: RecentCases = Array.from({ length: 3 }, (_, i) => ({
        caseId: i + 1,
        urn: `URN${i + 1}`,
        description: `Case ${i + 1}`,
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(threeExistingCases),
      });

      const shortConfig = { RECENT_CASES_LIST_LENGTH: 3 } as Config;
      const { setNextRecentCases } = await initialiseRecentCases({ rootUrl, config: shortConfig, register: mockRegister });
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, path: "/state/recent-cases" }),
      });

      setNextRecentCases(mockCaseDetails);

      await flushPromises();

      expect(mockFetch).toHaveBeenCalledWith("https://example.com/api/state/recent-cases", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ caseId: 789, urn: "56EF7890123", description: "Wilson, Bob" }, ...threeExistingCases.slice(0, 2)]),
        credentials: "include",
      });
    });

    describe("when initial recentCases was not found", () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(null),
        });
      });

      it("should call fetch with PUT containing just the new case", async () => {
        const { setNextRecentCases } = await initialiseRecentCases({ rootUrl, config, register: mockRegister });
        mockFetch.mockClear();
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ success: true, path: "/state/recent-cases" }),
        });

        setNextRecentCases(mockCaseDetails);

        await flushPromises();

        expect(mockFetch).toHaveBeenCalledWith("https://example.com/api/state/recent-cases", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([{ caseId: 789, urn: "56EF7890123", description: "Wilson, Bob" }]),
          credentials: "include",
        });
      });
    });
  });
});
