import { fullyQualifyRequest } from "./fully-qualify-request";

describe("fullyQualifyRequest", () => {
  describe("with string input", () => {
    it("should prepend baseUrl to a relative path", () => {
      const result = fullyQualifyRequest("/api/users", "https://example.com");

      expect(result).toBe("https://example.com/api/users");
    });

    it("should handle baseUrl with trailing slash", () => {
      const result = fullyQualifyRequest("/api/users", "https://example.com/");

      expect(result).toBe("https://example.com/api/users");
    });

    it("should handle path without leading slash", () => {
      const result = fullyQualifyRequest("api/users", "https://example.com");

      expect(result).toBe("https://example.com/api/users");
    });

    it("should return the path as-is when baseUrl is empty", () => {
      const result = fullyQualifyRequest("/api/users", "");

      expect(result).toBe("/api/users");
    });

    it("should return the path as-is when baseUrl is not provided", () => {
      const result = fullyQualifyRequest("/api/users");

      expect(result).toBe("/api/users");
    });

    it("should handle complex paths with query parameters", () => {
      const result = fullyQualifyRequest("/api/users?id=123&name=test", "https://example.com");

      expect(result).toBe("https://example.com/api/users?id=123&name=test");
    });

    it("should handle paths with hash fragments", () => {
      const result = fullyQualifyRequest("/page#section", "https://example.com");

      expect(result).toBe("https://example.com/page#section");
    });

    it("should handle baseUrl with path segments", () => {
      const result = fullyQualifyRequest("/endpoint", "https://example.com/api/v1");

      expect(result).toBe("https://example.com/api/v1/endpoint");
    });

    it("should handle empty path string", () => {
      const result = fullyQualifyRequest("", "https://example.com");

      expect(result).toBe("https://example.com");
    });
  });

  describe("with Request input", () => {
    it("should return an object with the qualified url property", () => {
      const request = new Request("https://original.com/api/users");
      const result = fullyQualifyRequest(request, "https://example.com");

      expect(result).toHaveProperty("url");
      expect(typeof (result as { url: string }).url).toBe("string");
    });

    it("should spread request properties to result object", () => {
      const request = new Request("https://original.com/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = fullyQualifyRequest(request, "https://example.com") as Record<string, unknown>;

      expect(result).toHaveProperty("url");
      expect(result._method ?? result.method).toBe("POST");
    });
  });
});
