import { Preview } from "cps-global-configuration";
import { initialisePreview } from "./initialise-preview";

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("initialisePreview", () => {
  const rootUrl = "https://example.com/api/global-components/";
  const expectedUrl = "https://example.com/api/state/preview";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("when fetch succeeds with valid data", () => {
    const validPreview: Preview = {
      enabled: true,
      caseMarkers: true,
      newHeader: false,
    };

    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(validPreview),
      });
    });

    it("should call fetch with correct URL and credentials", async () => {
      await initialisePreview({ rootUrl });

      expect(mockFetch).toHaveBeenCalledWith(expectedUrl, { credentials: "include" });
    });

    it("should return found: true with the parsed result", async () => {
      const result = await initialisePreview({ rootUrl });

      expect(result).toEqual({ found: true, result: validPreview });
    });
  });

  describe("when fetch succeeds but response is null", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(null),
      });
    });

    it("should return found: false with an error", async () => {
      const result = await initialisePreview({ rootUrl });

      expect(result.found).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe(`User has no state at ${expectedUrl}`);
    });
  });

  describe("when response is not ok", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });
    });

    it("should return found: false with response status error", async () => {
      const result = await initialisePreview({ rootUrl });

      expect(result.found).toBe(false);
      expect(result.error?.message).toBe(`Call to ${expectedUrl} returned non-ok status code: 404 Not Found`);
    });
  });

  describe("when fetch throws an error", () => {
    const networkError = new Error("Network error");

    beforeEach(() => {
      mockFetch.mockRejectedValue(networkError);
    });

    it("should return found: false with the error", async () => {
      const result = await initialisePreview({ rootUrl });

      expect(result.found).toBe(false);
      expect(result.error).toBe(networkError);
    });
  });

  describe("when response JSON is invalid", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ enabled: "not-a-boolean" }),
      });
    });

    it("should return found: false with zod validation error", async () => {
      const result = await initialisePreview({ rootUrl });

      expect(result.found).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
