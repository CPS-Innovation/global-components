import { tryLocationMatch } from "./try-location-match";

describe("tryLocationMatch", () => {
  it("should return match object with empty groups for simple exact match", () => {
    const result = tryLocationMatch("https://example.com/page", "https://example.com/page");
    expect(result).toEqual({
      groups: {},
    });
  });

  it("should return null when there is no match", () => {
    const result = tryLocationMatch("https://example.com/page1", "https://example.com/page2");
    expect(result).toBeNull();
  });

  it("should match with regex patterns", () => {
    const result = tryLocationMatch("https://example.com/users/123", "https://example.com/users/\\d+");
    expect(result).toEqual({
      groups: {},
    });
  });

  it("should extract named groups from regex match", () => {
    const result = tryLocationMatch("https://example.com/users/123", "https://example.com/users/(?<userId>\\d+)");
    expect(result).toEqual({
      groups: {
        userId: "123",
      },
    });
  });

  it("should extract multiple named groups", () => {
    const result = tryLocationMatch("https://example.com/users/123/posts/456", "https://example.com/users/(?<userId>\\d+)/posts/(?<postId>\\d+)");
    expect(result).toEqual({
      groups: {
        userId: "123",
        postId: "456",
      },
    });
  });

  it("should perform case-insensitive matching", () => {
    const result = tryLocationMatch("https://example.com/MyPage", "https://example.com/mypage");
    expect(result).toEqual({
      groups: {},
    });
  });

  it("should perform case-insensitive matching with regex", () => {
    const result = tryLocationMatch("https://example.com/Users/123", "https://example.com/users/\\d+");
    expect(result).toEqual({
      groups: {},
    });
  });

  it("should extract named groups with case-insensitive matching", () => {
    const result = tryLocationMatch("https://example.com/Products/789", "https://example.com/products/(?<productId>\\d+)");
    expect(result).toEqual({
      groups: {
        productId: "789",
      },
    });
  });

  it("should match partial patterns", () => {
    const result = tryLocationMatch("https://example.com/page/subpage", "https://example.com/page");
    expect(result).toEqual({
      groups: {},
    });
  });

  it("should not match when regex is anchored and pattern doesn't match", () => {
    const result = tryLocationMatch("https://example.com/page/subpage", "^https://example.com/page$");
    expect(result).toBeNull();
  });

  it("should match when regex is anchored and pattern matches exactly", () => {
    const result = tryLocationMatch("https://example.com/page", "^https://example.com/page$");
    expect(result).toEqual({
      groups: {},
    });
  });

  it("should handle complex regex patterns with optional groups", () => {
    const result = tryLocationMatch("https://example.com/api/v2/users?page=1&limit=10", "https://example.com/api/v(?<version>\\d+)/(?<resource>\\w+)(?:\\?.*)?");
    expect(result).toEqual({
      groups: {
        version: "2",
        resource: "users",
      },
    });
  });

  it("should handle real-world OutSystems URL with query parameters and named groups", () => {
    const result = tryLocationMatch(
      "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview?CaseId=12345&URN=ABC123DEF",
      "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview.*?[&?]CaseId=(?<caseId>\\d+)&URN=(?<urn>[^&]+)",
    );
    expect(result).toEqual({
      groups: {
        caseId: "12345",
        urn: "ABC123DEF",
      },
    });
  });

  it("should handle query parameters with wildcards", () => {
    const result = tryLocationMatch("https://example.com/search?foo=1&bar=2", "https://example.com/search\\?.*");
    expect(result).toEqual({
      groups: {},
    });
  });

  it("should match when address has hash fragment", () => {
    const result = tryLocationMatch("https://example.com/page#section", "https://example.com/page#section");
    expect(result).toEqual({
      groups: {},
    });
  });

  it("should perform case-insensitive matching on protocol", () => {
    const result = tryLocationMatch("https://example.com/page", "HTTPS://example.com/page");
    expect(result).toEqual({
      groups: {},
    });
  });

  it("should perform case-insensitive matching on domain", () => {
    const result = tryLocationMatch("https://example.com/page", "https://EXAMPLE.COM/page");
    expect(result).toEqual({
      groups: {},
    });
  });

  it("should handle empty named groups object when no groups are defined", () => {
    const result = tryLocationMatch("https://example.com/test", "https://example.com/test");
    expect(result).toEqual({
      groups: {},
    });
  });

  it("should return null for completely different URLs", () => {
    const result = tryLocationMatch("https://different.com/page", "https://example.com/page");
    expect(result).toBeNull();
  });

  it("should handle special regex characters in the pattern", () => {
    const result = tryLocationMatch("https://example.com/search?query=test", "https://example\\.com/search\\?query=test");
    expect(result).toEqual({
      groups: {},
    });
  });

  it("should match when pattern has non-capturing groups", () => {
    const result = tryLocationMatch("https://example.com/api/v1/users", "https://example\\.com/(?:api)/v(?<version>\\d+)/(?<resource>\\w+)");
    expect(result).toEqual({
      groups: {
        version: "1",
        resource: "users",
      },
    });
  });

  it("should handle multiple slashes in path", () => {
    const result = tryLocationMatch("https://example.com//double//slash//path", "https://example.com//double//slash//path");
    expect(result).toEqual({
      groups: {},
    });
  });

  it.each([
    "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview?CaseId=123&URN=abc",
    "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview?foo=bar&CaseId=123&URN=abc",
    "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview?CaseId=123&foo=bar&URN=abc",
    "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview?CaseId=123&URN=abc&foo=bar",
    "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview?foo=bar&CaseId=123&foo=bar&URN=abc&foo=bar",
    "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview/some/path?foo=bar&CaseId=123&foo=bar&URN=abc&foo=bar",
    "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview?URN=abc&CaseId=123",
    "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview?foo=bar&URN=abc&CaseId=123",
    "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview?URN=abc&foo=bar&CaseId=123",
    "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview?URN=abc&CaseId=123&foo=bar",
    "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview?foo=bar&URN=abc&foo=bar&CaseId=123&foo=bar",
    "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview/some/path?foo=bar&URN=abc&foo=bar&CaseId=123&foo=bar",
  ])("should extract relevant query params from amongst irrelevant query params using a look-ahead regex pattern", address => {
    const result = tryLocationMatch(
      address,
      "^https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview(?=.*[&?]CaseId=(?<caseId>\\d+))(?=.*[&?]URN=(?<urn>[^&]+)).*$",
    );
    expect(result).toEqual({
      groups: { caseId: "123", urn: "abc" },
    });
  });

  it.each([
    "https://cps-dev.outsystemsenterprise.com/some-app?CMSCaseId=123",
    "https://cps-dev.outsystemsenterprise.com/some-app?CaseId=123",
    "https://cps-dev.outsystemsenterprise.com/some-app?foo=bar&CMSCaseId=123",
    "https://cps-dev.outsystemsenterprise.com/some-app?foo=bar&CaseId=123",
    "https://cps-dev.outsystemsenterprise.com/some-app?CMSCaseId=123",
    "https://cps-dev.outsystemsenterprise.com/some-app?CaseId=123",
    "https://cps-dev.outsystemsenterprise.com/some-app?CMSCaseId=123&foo=bar",
    "https://cps-dev.outsystemsenterprise.com/some-app?CaseId=123&foo=bar",
    "https://cps-dev.outsystemsenterprise.com/some-app?&foo=bar&CMSCaseId=123&baz=buz",
    "https://cps-dev.outsystemsenterprise.com/some-app?&foo=bar&CaseId=123&baz=buz",

    "https://cps-dev.outsystemsenterprise.com/some-app/?&foo=bar&CMSCaseId=123&baz=buz",
    "https://cps-dev.outsystemsenterprise.com/some-app/?&foo=bar&CaseId=123&baz=buz",

    "https://cps-dev.outsystemsenterprise.com/some-app/some-path?&foo=bar&CMSCaseId=123&baz=buz",
    "https://cps-dev.outsystemsenterprise.com/some-app/some-path?&foo=bar&CaseId=123&baz=buz",

    "https://cps-dev.outsystemsenterprise.com/some-app/some-path?&foo=bar&CMSCaseId=123&CaseId=123&baz=buz",
  ])("should match case review addresses based only on finding a CMSCaseId or CaseId parameter", address => {
    const result = tryLocationMatch(address, "https://cps-dev.outsystemsenterprise.com/some-app.*?[&?](?:CMS)?CaseId=(?<caseId>\\d+)");
    expect(result).toEqual({
      groups: { caseId: "123" },
    });
  });

  it.each([
    "https://cps-dev.outsystemsenterprise.com/some-app?CaseId=123&URN=abc",
    "https://cps-dev.outsystemsenterprise.com/some-app?CaseId=123&CaseURN=abc",
    "https://cps-dev.outsystemsenterprise.com/some-app?URN=abc&CaseId=123",
    "https://cps-dev.outsystemsenterprise.com/some-app?CaseURN=abc&CaseId=123",

    "https://cps-dev.outsystemsenterprise.com/some-app?foo=bar&CaseId=123&URN=abc",
    "https://cps-dev.outsystemsenterprise.com/some-app?foo=bar&CaseId=123&CaseURN=abc",
    "https://cps-dev.outsystemsenterprise.com/some-app?foo=bar&URN=abc&CaseId=123",
    "https://cps-dev.outsystemsenterprise.com/some-app?foo=bar&CaseURN=abc&CaseId=123",

    "https://cps-dev.outsystemsenterprise.com/some-app?CaseId=123&URN=abc&foo=bar",
    "https://cps-dev.outsystemsenterprise.com/some-app?CaseId=123&CaseURN=abc&foo=bar",
    "https://cps-dev.outsystemsenterprise.com/some-app?URN=abc&CaseId=123&foo=bar",
    "https://cps-dev.outsystemsenterprise.com/some-app?CaseURN=abc&CaseId=123&foo=bar",

    "https://cps-dev.outsystemsenterprise.com/some-app?foo=bar&CaseId=123&URN=abc&baz=buz",
    "https://cps-dev.outsystemsenterprise.com/some-app?foo=bar&CaseId=123&CaseURN=abc&baz=buz",
    "https://cps-dev.outsystemsenterprise.com/some-app?foo=bar&URN=abc&CaseId=123&baz=buz",
    "https://cps-dev.outsystemsenterprise.com/some-app?foo=bar&CaseURN=abc&CaseId=123&baz=buz",

    "https://cps-dev.outsystemsenterprise.com/some-app/?foo=bar&CaseURN=abc&CaseId=123&baz=buz",
    "https://cps-dev.outsystemsenterprise.com/some-app/some-path?foo=bar&CaseURN=abc&CaseId=123&baz=buz",
  ])("should match work management-style addresses based on finding a CaseId parameter or ", address => {
    const result = tryLocationMatch(address, "https://cps-dev.outsystemsenterprise.com/some-app.*?(?=.*[&?]CaseId=(?<caseId>\\d+))(?=.*[&?](?:Case)?URN=(?<urn>[^&]+))");
    expect(result).toEqual({
      groups: { caseId: "123", urn: "abc" },
    });
  });
});
