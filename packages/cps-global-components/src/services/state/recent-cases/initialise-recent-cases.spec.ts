import { Preview } from "cps-global-configuration";
import { Result } from "../../../utils/Result";
import { CaseDetails } from "../../data/CaseDetails";
import { RecentCases } from "./recent-cases";
import { initialiseRecentCases } from "./initialise-recent-cases";

const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.mock("../../data/get-case-defendant-headline", () => ({
  getCaseDefendantHeadline: jest.fn((caseDetails: CaseDetails) => `${caseDetails.leadDefendantSurname}, ${caseDetails.leadDefendantFirstNames}`),
}));

describe("initialiseRecentCases", () => {
  const rootUrl = "https://example.com/api/global-components/";
  const expectedUrl = "https://example.com/api/state/recent-cases";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("when preview is not found", () => {
    const previewNotFound: Result<Preview> = {
      found: false,
      error: new Error("Preview not found"),
    };

    it("should return recentCases with found: false", async () => {
      const { recentCases } = await initialiseRecentCases({ rootUrl, preview: previewNotFound });

      expect(recentCases.found).toBe(false);
      expect(recentCases.error?.message).toBe("Recent cases not enabled");
    });

    it("should return a no-op setNextRecentCases function", async () => {
      const { setNextRecentCases } = await initialiseRecentCases({ rootUrl, preview: previewNotFound });

      expect(typeof setNextRecentCases).toBe("function");
      // Should not throw when called
      setNextRecentCases(undefined);
    });

    it("should not call fetch", async () => {
      await initialiseRecentCases({ rootUrl, preview: previewNotFound });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("when preview.myRecentCases is false", () => {
    const previewWithoutRecentCases: Result<Preview> = {
      found: true,
      result: { enabled: true, myRecentCases: false },
    };

    it("should return recentCases with found: false", async () => {
      const { recentCases } = await initialiseRecentCases({ rootUrl, preview: previewWithoutRecentCases });

      expect(recentCases.found).toBe(false);
      expect(recentCases.error?.message).toBe("Recent cases not enabled");
    });

    it("should not call fetch", async () => {
      await initialiseRecentCases({ rootUrl, preview: previewWithoutRecentCases });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("when preview.myRecentCases is true", () => {
    const previewWithRecentCases: Result<Preview> = {
      found: true,
      result: { enabled: true, myRecentCases: true },
    };

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
        await initialiseRecentCases({ rootUrl, preview: previewWithRecentCases });

        expect(mockFetch).toHaveBeenCalledWith(expectedUrl, { credentials: "include" });
      });

      it("should return recentCases with found: true and the result", async () => {
        const { recentCases } = await initialiseRecentCases({ rootUrl, preview: previewWithRecentCases });

        expect(recentCases).toEqual({ found: true, result: validRecentCases });
      });

      it("should return a setNextRecentCases function", async () => {
        const { setNextRecentCases } = await initialiseRecentCases({ rootUrl, preview: previewWithRecentCases });

        expect(typeof setNextRecentCases).toBe("function");
      });
    });

    describe("when fetch succeeds but response is null", () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(null),
        });
      });

      it("should return recentCases with found: false", async () => {
        const { recentCases } = await initialiseRecentCases({ rootUrl, preview: previewWithRecentCases });

        expect(recentCases.found).toBe(false);
        expect(recentCases.error?.message).toBe(`User has no state at ${expectedUrl}`);
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

      it("should return recentCases with found: false", async () => {
        const { recentCases } = await initialiseRecentCases({ rootUrl, preview: previewWithRecentCases });

        expect(recentCases.found).toBe(false);
        expect(recentCases.error?.message).toBe(`Call to ${expectedUrl} returned non-ok status code: 500 Internal Server Error`);
      });
    });

    describe("when fetch throws an error", () => {
      const networkError = new Error("Network error");

      beforeEach(() => {
        mockFetch.mockRejectedValue(networkError);
      });

      it("should return recentCases with found: false and the error", async () => {
        const { recentCases } = await initialiseRecentCases({ rootUrl, preview: previewWithRecentCases });

        expect(recentCases.found).toBe(false);
        expect(recentCases.error).toBe(networkError);
      });
    });
  });

  describe("setNextRecentCases", () => {
    const previewWithRecentCases: Result<Preview> = {
      found: true,
      result: { enabled: true, myRecentCases: true },
    };

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
      const { setNextRecentCases } = await initialiseRecentCases({ rootUrl, preview: previewWithRecentCases });
      mockFetch.mockClear();

      setNextRecentCases(undefined);

      await new Promise(resolve => setTimeout(resolve, 0));

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

      const { setNextRecentCases } = await initialiseRecentCases({ rootUrl, preview: previewWithRecentCases });
      mockFetch.mockClear();

      setNextRecentCases(caseAlreadyAtTop);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should call fetch with PUT to add new case to top of list", async () => {
      const { setNextRecentCases } = await initialiseRecentCases({ rootUrl, preview: previewWithRecentCases });
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, path: "/state/recent-cases" }),
      });

      setNextRecentCases(mockCaseDetails);

      await new Promise(resolve => setTimeout(resolve, 0));

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

      const { setNextRecentCases } = await initialiseRecentCases({ rootUrl, preview: previewWithRecentCases });
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, path: "/state/recent-cases" }),
      });

      setNextRecentCases(caseAlreadyInList);

      await new Promise(resolve => setTimeout(resolve, 0));

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

    it("should limit the list to 10 items when adding a new case to a full list", async () => {
      const tenExistingCases: RecentCases = Array.from({ length: 10 }, (_, i) => ({
        caseId: i + 1,
        urn: `URN${i + 1}`,
        description: `Case ${i + 1}`,
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(tenExistingCases),
      });

      const { setNextRecentCases } = await initialiseRecentCases({ rootUrl, preview: previewWithRecentCases });
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, path: "/state/recent-cases" }),
      });

      setNextRecentCases(mockCaseDetails);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockFetch).toHaveBeenCalledWith("https://example.com/api/state/recent-cases", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          { caseId: 789, urn: "56EF7890123", description: "Wilson, Bob" },
          ...tenExistingCases.slice(0, 9),
        ]),
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
        const { setNextRecentCases } = await initialiseRecentCases({ rootUrl, preview: previewWithRecentCases });
        mockFetch.mockClear();
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ success: true, path: "/state/recent-cases" }),
        });

        setNextRecentCases(mockCaseDetails);

        await new Promise(resolve => setTimeout(resolve, 0));

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
