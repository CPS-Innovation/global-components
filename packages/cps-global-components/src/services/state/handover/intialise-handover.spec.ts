import { Handover } from "./Handover";
import { initialiseHandover } from "./intialise-handover";

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("initialiseHandover", () => {
  const rootUrl = "https://example.com/api/global-components/";
  const expectedUrl = "https://example.com/api/state/handover";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("when fetch succeeds with valid data", () => {
    const validHandover: Handover = {
      caseId: 12345,
      caseDetails: {
        id: 12345,
        urn: "01AA0000000",
        isDcfCase: false,
        leadDefendantFirstNames: "John",
        leadDefendantSurname: "Doe",
        leadDefendantType: "Person",
        numberOfDefendants: 1,
      },
    };

    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(validHandover),
      });
    });

    it("should call fetch with correct URL and credentials", async () => {
      await initialiseHandover({ rootUrl });

      expect(mockFetch).toHaveBeenCalledWith(expectedUrl, { credentials: "include" });
    });

    it("should return handover with found: true and the result", async () => {
      const { handover } = await initialiseHandover({ rootUrl });

      expect(handover).toEqual({ found: true, result: validHandover });
    });

    it("should return a setNextHandover function", async () => {
      const { setNextHandover } = await initialiseHandover({ rootUrl });

      expect(typeof setNextHandover).toBe("function");
    });
  });

  describe("when fetch succeeds but response is null", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(null),
      });
    });

    it("should return handover with found: false", async () => {
      const { handover } = await initialiseHandover({ rootUrl });

      expect(handover.found).toBe(false);
      expect(handover.error?.message).toBe(`User has no state at ${expectedUrl}`);
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

    it("should return handover with found: false and response status error", async () => {
      const { handover } = await initialiseHandover({ rootUrl });

      expect(handover.found).toBe(false);
      expect(handover.error?.message).toBe(`Call to ${expectedUrl} returned non-ok status code: 500 Internal Server Error`);
    });
  });

  describe("when fetch throws an error", () => {
    const networkError = new Error("Network error");

    beforeEach(() => {
      mockFetch.mockRejectedValue(networkError);
    });

    it("should return handover with found: false and the error", async () => {
      const { handover } = await initialiseHandover({ rootUrl });

      expect(handover.found).toBe(false);
      expect(handover.error).toBe(networkError);
    });
  });

  describe("setNextHandover", () => {
    const initialHandover: Handover = {
      caseId: 12345,
    };

    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(initialHandover),
      });
    });

    describe("when case ID is different from current handover", () => {
      it("should call fetch with PUT method and new handover data", async () => {
        const { setNextHandover } = await initialiseHandover({ rootUrl });
        mockFetch.mockClear();
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ success: true, path: "/state/handover" }),
        });

        const newHandover: Handover = { caseId: 99999 };
        setNextHandover(newHandover);

        // Allow the async operation to complete
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockFetch).toHaveBeenCalledWith(expectedUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newHandover),
          credentials: "include",
        });
      });
    });

    describe("when case ID is the same as current handover", () => {
      it("should not call fetch", async () => {
        const { setNextHandover } = await initialiseHandover({ rootUrl });
        mockFetch.mockClear();

        const sameHandover: Handover = { caseId: 12345 };
        setNextHandover(sameHandover);

        // Allow any async operations to complete
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockFetch).not.toHaveBeenCalled();
      });
    });

    describe("when initial handover was not found", () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(null),
        });
      });

      it("should call fetch with PUT for any new handover", async () => {
        const { setNextHandover } = await initialiseHandover({ rootUrl });
        mockFetch.mockClear();
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ success: true, path: "/state/handover" }),
        });

        const newHandover: Handover = { caseId: 11111 };
        setNextHandover(newHandover);

        // Allow the async operation to complete
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockFetch).toHaveBeenCalledWith(expectedUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newHandover),
          credentials: "include",
        });
      });
    });

    describe("when PUT fetch fails", () => {
      it("should catch the error and not throw", async () => {
        const { setNextHandover } = await initialiseHandover({ rootUrl });
        mockFetch.mockClear();
        mockFetch.mockRejectedValue(new Error("PUT failed"));

        const newHandover: Handover = { caseId: 99999 };

        // Should not throw
        expect(() => setNextHandover(newHandover)).not.toThrow();

        // Allow the async operation to complete
        await new Promise(resolve => setTimeout(resolve, 0));
      });
    });
  });
});
