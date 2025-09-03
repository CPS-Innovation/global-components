import { isOutSystemsApp } from "./is-outsystems-app";

describe("isOutSystemsApp", () => {
  const createMockWindow = (href: string): Window => {
    return {
      location: {
        href,
      },
    } as Window;
  };

  it("should return true for URLs with outsystemsenterprise.com domain", () => {
    expect(isOutSystemsApp(createMockWindow("https://app.outsystemsenterprise.com"))).toBe(true);
    expect(isOutSystemsApp(createMockWindow("http://test.outsystemsenterprise.com/path"))).toBe(true);
    expect(isOutSystemsApp(createMockWindow("https://subdomain.outsystemsenterprise.com/app/page"))).toBe(true);
    expect(isOutSystemsApp(createMockWindow("http://my-app.outsystemsenterprise.com:8080"))).toBe(true);
  });

  it("should return true for URLs with subdomains containing outsystemsenterprise.com", () => {
    expect(isOutSystemsApp(createMockWindow("https://dev.app.outsystemsenterprise.com"))).toBe(true);
    expect(isOutSystemsApp(createMockWindow("http://staging.test.outsystemsenterprise.com/path"))).toBe(true);
    expect(isOutSystemsApp(createMockWindow("https://a.b.c.outsystemsenterprise.com"))).toBe(true);
  });

  it("should return false for non-http/https URLs", () => {
    expect(isOutSystemsApp(createMockWindow("ftp://app.outsystemsenterprise.com"))).toBe(false);
    expect(isOutSystemsApp(createMockWindow("file:///app.outsystemsenterprise.com"))).toBe(false);
    expect(isOutSystemsApp(createMockWindow("ws://app.outsystemsenterprise.com"))).toBe(false);
    expect(isOutSystemsApp(createMockWindow("//app.outsystemsenterprise.com"))).toBe(false);
    expect(isOutSystemsApp(createMockWindow("app.outsystemsenterprise.com"))).toBe(false);
  });

  it("should return false for URLs without outsystemsenterprise.com", () => {
    expect(isOutSystemsApp(createMockWindow("https://example.com"))).toBe(false);
    expect(isOutSystemsApp(createMockWindow("http://google.com"))).toBe(false);
    expect(isOutSystemsApp(createMockWindow("https://outsystems.com"))).toBe(false);
    expect(isOutSystemsApp(createMockWindow("https://enterprise.com"))).toBe(false);
    expect(isOutSystemsApp(createMockWindow("http://localhost:3000"))).toBe(false);
  });

  it("should return false for URLs where outsystemsenterprise.com is not in hostname", () => {
    expect(isOutSystemsApp(createMockWindow("https://example.com/outsystemsenterprise.com"))).toBe(false);
    expect(isOutSystemsApp(createMockWindow("https://example.com?url=outsystemsenterprise.com"))).toBe(false);
    expect(isOutSystemsApp(createMockWindow("https://example.com#outsystemsenterprise.com"))).toBe(false);
  });

  it("should handle URLs with query parameters and fragments correctly", () => {
    expect(isOutSystemsApp(createMockWindow("https://app.outsystemsenterprise.com?param=value"))).toBe(true);
    expect(isOutSystemsApp(createMockWindow("http://test.outsystemsenterprise.com#section"))).toBe(true);
    expect(isOutSystemsApp(createMockWindow("https://my.outsystemsenterprise.com/path?q=1#hash"))).toBe(true);
  });

  it("should handle URLs with port numbers", () => {
    expect(isOutSystemsApp(createMockWindow("https://app.outsystemsenterprise.com:443"))).toBe(true);
    expect(isOutSystemsApp(createMockWindow("http://test.outsystemsenterprise.com:8080/app"))).toBe(true);
    expect(isOutSystemsApp(createMockWindow("https://dev.outsystemsenterprise.com:3000"))).toBe(true);
  });

  it("should not be case-sensitive for the domain check", () => {
    expect(isOutSystemsApp(createMockWindow("https://app.OUTSYSTEMSENTERPRISE.com"))).toBe(true);
    expect(isOutSystemsApp(createMockWindow("https://app.OutSystemsEnterprise.com"))).toBe(true);
  });

  it("should handle edge cases", () => {
    expect(isOutSystemsApp(createMockWindow("http://outsystemsenterprise.com"))).toBe(false);
    expect(isOutSystemsApp(createMockWindow("https://www.outsystemsenterprise.com"))).toBe(true);
    expect(isOutSystemsApp(createMockWindow("http://outsystemsenterprise.com.example.com"))).toBe(false);
  });

  it("should handle malformed URLs gracefully", () => {
    expect(isOutSystemsApp(createMockWindow("not a url"))).toBe(false);
    expect(isOutSystemsApp(createMockWindow(""))).toBe(false);
    expect(isOutSystemsApp(createMockWindow("http://"))).toBe(false);
  });
});
