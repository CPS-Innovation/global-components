import { isOutSystemsApp } from "./is-outsystems-app";

describe("isOutSystemsApp", () => {
  it("should return true for URLs with outsystemsenterprise.com domain", () => {
    expect(isOutSystemsApp("https://app.outsystemsenterprise.com")).toBe(true);
    expect(isOutSystemsApp("http://test.outsystemsenterprise.com/path")).toBe(true);
    expect(isOutSystemsApp("https://subdomain.outsystemsenterprise.com/app/page")).toBe(true);
    expect(isOutSystemsApp("http://my-app.outsystemsenterprise.com:8080")).toBe(true);
  });

  it("should return true for URLs with subdomains containing outsystemsenterprise.com", () => {
    expect(isOutSystemsApp("https://dev.app.outsystemsenterprise.com")).toBe(true);
    expect(isOutSystemsApp("http://staging.test.outsystemsenterprise.com/path")).toBe(true);
    expect(isOutSystemsApp("https://a.b.c.outsystemsenterprise.com")).toBe(true);
  });

  it("should return false for non-http/https URLs", () => {
    expect(isOutSystemsApp("ftp://app.outsystemsenterprise.com")).toBe(false);
    expect(isOutSystemsApp("file:///app.outsystemsenterprise.com")).toBe(false);
    expect(isOutSystemsApp("ws://app.outsystemsenterprise.com")).toBe(false);
    expect(isOutSystemsApp("//app.outsystemsenterprise.com")).toBe(false);
    expect(isOutSystemsApp("app.outsystemsenterprise.com")).toBe(false);
  });

  it("should return false for URLs without outsystemsenterprise.com", () => {
    expect(isOutSystemsApp("https://example.com")).toBe(false);
    expect(isOutSystemsApp("http://google.com")).toBe(false);
    expect(isOutSystemsApp("https://outsystems.com")).toBe(false);
    expect(isOutSystemsApp("https://enterprise.com")).toBe(false);
    expect(isOutSystemsApp("http://localhost:3000")).toBe(false);
  });

  it("should return false for URLs where outsystemsenterprise.com is not in hostname", () => {
    expect(isOutSystemsApp("https://example.com/outsystemsenterprise.com")).toBe(false);
    expect(isOutSystemsApp("https://example.com?url=outsystemsenterprise.com")).toBe(false);
    expect(isOutSystemsApp("https://example.com#outsystemsenterprise.com")).toBe(false);
  });

  it("should handle URLs with query parameters and fragments correctly", () => {
    expect(isOutSystemsApp("https://app.outsystemsenterprise.com?param=value")).toBe(true);
    expect(isOutSystemsApp("http://test.outsystemsenterprise.com#section")).toBe(true);
    expect(isOutSystemsApp("https://my.outsystemsenterprise.com/path?q=1#hash")).toBe(true);
  });

  it("should handle URLs with port numbers", () => {
    expect(isOutSystemsApp("https://app.outsystemsenterprise.com:443")).toBe(true);
    expect(isOutSystemsApp("http://test.outsystemsenterprise.com:8080/app")).toBe(true);
    expect(isOutSystemsApp("https://dev.outsystemsenterprise.com:3000")).toBe(true);
  });

  it("should not be case-sensitive for the domain check", () => {
    // The actual behavior depends on URL parsing which is typically case-insensitive for domains
    // but the includes() check is case-sensitive
    expect(isOutSystemsApp("https://app.OUTSYSTEMSENTERPRISE.com")).toBe(true);
    expect(isOutSystemsApp("https://app.OutSystemsEnterprise.com")).toBe(true);
  });

  it("should handle edge cases", () => {
    expect(isOutSystemsApp("http://outsystemsenterprise.com")).toBe(false);
    expect(isOutSystemsApp("https://www.outsystemsenterprise.com")).toBe(true);
    expect(isOutSystemsApp("http://outsystemsenterprise.com.example.com")).toBe(false);
  });

  it("should handle malformed URLs gracefully", () => {
    expect(isOutSystemsApp("not a url")).toBe(false);
    expect(isOutSystemsApp("")).toBe(false);
    expect(isOutSystemsApp("http://")).toBe(false);
  });
});
