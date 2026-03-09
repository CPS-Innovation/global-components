import { z } from "zod";
import { fetchState } from "./fetch-state";

const mockFetch = jest.fn();
global.fetch = mockFetch;

const TestSchema = z.object({ name: z.string(), value: z.number() });
type TestData = z.infer<typeof TestSchema>;

describe("fetchState", () => {
  const rootUrl = "https://example.com/api/global-components/";
  const url = "../state/test";
  const expectedUrl = "https://example.com/api/state/test";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET (no data provided)", () => {
    describe("when fetch succeeds with valid data", () => {
      const validData: TestData = { name: "foo", value: 42 };

      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(validData),
        });
      });

      it("should call fetch with correct URL and credentials", async () => {
        await fetchState({ rootUrl, url, schema: TestSchema });

        expect(mockFetch).toHaveBeenCalledWith(expectedUrl, { credentials: "include" });
      });

      it("should return found: true with the parsed result", async () => {
        const result = await fetchState({ rootUrl, url, schema: TestSchema });

        expect(result).toEqual({ found: true, result: validData });
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
        const result = await fetchState({ rootUrl, url, schema: TestSchema });

        expect(result.found).toBe(false);
        expect(result.error?.message).toBe(`User has no state at ${expectedUrl}`);
      });
    });

    describe("when fetch succeeds but response is null and defaultResultWhenNull is provided", () => {
      const defaultResult: TestData = { name: "default", value: 0 };

      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(null),
        });
      });

      it("should return found: true with the default result", async () => {
        const result = await fetchState({ rootUrl, url, schema: TestSchema, defaultResultWhenNull: defaultResult });

        expect(result).toEqual({ found: true, result: defaultResult });
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

      it("should return found: false with response status error", async () => {
        const result = await fetchState({ rootUrl, url, schema: TestSchema });

        expect(result.found).toBe(false);
        expect(result.error?.message).toBe(`Call to ${expectedUrl} returned non-ok status code: 500 Internal Server Error`);
      });
    });

    describe("when fetch throws an error", () => {
      const networkError = new Error("Network error");

      beforeEach(() => {
        mockFetch.mockRejectedValue(networkError);
      });

      it("should return found: false with the error", async () => {
        const result = await fetchState({ rootUrl, url, schema: TestSchema });

        expect(result.found).toBe(false);
        expect(result.error).toBe(networkError);
      });
    });

    describe("when response JSON is invalid", () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ name: 123, value: "not-a-number" }),
        });
      });

      it("should return found: false with zod validation error", async () => {
        const result = await fetchState({ rootUrl, url, schema: TestSchema });

        expect(result.found).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });

  describe("PUT (data provided)", () => {
    const putData = { name: "bar", value: 99 };

    describe("when fetch succeeds", () => {
      const responseData = { success: true };
      const PutResponseSchema = z.object({ success: z.boolean() });

      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(responseData),
        });
      });

      it("should call fetch with PUT method, JSON headers, and body", async () => {
        await fetchState({ rootUrl, url, schema: PutResponseSchema, data: putData });

        expect(mockFetch).toHaveBeenCalledWith(expectedUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(putData),
          credentials: "include",
        });
      });

      it("should return found: true with the parsed result", async () => {
        const result = await fetchState({ rootUrl, url, schema: PutResponseSchema, data: putData });

        expect(result).toEqual({ found: true, result: responseData });
      });
    });

    describe("when response is not ok", () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
        });
      });

      it("should return found: false with response status error", async () => {
        const PutResponseSchema = z.object({ success: z.boolean() });
        const result = await fetchState({ rootUrl, url, schema: PutResponseSchema, data: putData });

        expect(result.found).toBe(false);
        expect(result.error?.message).toBe(`Call to ${expectedUrl} returned non-ok status code: 401 Unauthorized`);
      });
    });
  });
});
