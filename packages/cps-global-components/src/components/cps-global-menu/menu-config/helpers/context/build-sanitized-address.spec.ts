import { buildSanitizedAddress } from "./build-sanitized-address";

describe("buildSanitizedAddress", () => {
  it("should build a basic URL without params or hash", () => {
    const location = {
      origin: "https://example.com",
      pathname: "/path/to/page",
      hash: "",
      search: "",
    } as Location;

    const result = buildSanitizedAddress(location);
    expect(result).toBe("https://example.com/path/to/page");
  });

  it("should include hash when present", () => {
    const location = {
      origin: "https://example.com",
      pathname: "/page",
      hash: "#section",
      search: "",
    } as Location;

    const result = buildSanitizedAddress(location);
    expect(result).toBe("https://example.com/page#section");
  });

  it("should include sorted query parameters", () => {
    const location = {
      origin: "https://example.com",
      pathname: "/page",
      hash: "",
      search: "?z=last&a=first&m=middle",
    } as Location;

    const result = buildSanitizedAddress(location);
    expect(result).toBe("https://example.com/page?a=first&m=middle&z=last");
  });

  it("should handle URL-encoded parameters", () => {
    const location = {
      origin: "https://example.com",
      pathname: "/page",
      hash: "",
      search: "?name=John%20Doe&city=New%20York",
    } as Location;

    const result = buildSanitizedAddress(location);
    expect(result).toBe("https://example.com/page?city=New+York&name=John+Doe");
  });

  it("should handle empty query string", () => {
    const location = {
      origin: "https://example.com",
      pathname: "/page",
      hash: "#section",
      search: "?",
    } as Location;

    const result = buildSanitizedAddress(location);
    expect(result).toBe("https://example.com/page#section");
  });

  it("should handle all components together", () => {
    const location = {
      origin: "https://example.com",
      pathname: "/path/to/page",
      hash: "#section",
      search: "?b=2&a=1&c=3",
    } as Location;

    const result = buildSanitizedAddress(location);
    expect(result).toBe("https://example.com/path/to/page?a=1&b=2&c=3#section");
  });

  it("should handle duplicate parameter names", () => {
    const location = {
      origin: "https://example.com",
      pathname: "/page",
      hash: "",
      search: "?tag=one&tag=two&name=test",
    } as Location;

    const result = buildSanitizedAddress(location);
    expect(result).toBe("https://example.com/page?name=test&tag=one&tag=two");
  });

  it("should handle empty pathname", () => {
    const location = {
      origin: "https://example.com",
      pathname: "",
      hash: "",
      search: "?a=1",
    } as Location;

    const result = buildSanitizedAddress(location);
    expect(result).toBe("https://example.com?a=1");
  });

  it("should handle root pathname", () => {
    const location = {
      origin: "https://example.com",
      pathname: "/",
      hash: "",
      search: "",
    } as Location;

    const result = buildSanitizedAddress(location);
    expect(result).toBe("https://example.com/");
  });
});