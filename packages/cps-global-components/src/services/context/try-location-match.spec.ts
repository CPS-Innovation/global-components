import { tryLocationMatch } from "./try-location-match";

describe("tryLocationMatch", () => {
  it("should return match object with empty groups for simple exact match", () => {
    const result = tryLocationMatch({ href: "https://example.com/page" } as Location, "https://example.com/page");
    expect(result).toEqual({
      groups: {},
    });
  });

  it("should return null when there is no match", () => {
    const result = tryLocationMatch({ href: "https://example.com/page1" } as Location, "https://example.com/page2");
    expect(result).toBeNull();
  });

  it("should match with regex patterns", () => {
    const result = tryLocationMatch({ href: "https://example.com/users/123" } as Location, "https://example.com/users/\\d+");
    expect(result).toEqual({
      groups: {},
    });
  });

  it("should extract named groups from regex match", () => {
    const result = tryLocationMatch({ href: "https://example.com/users/123" } as Location, "https://example.com/users/(?<userId>\\d+)");
    expect(result).toEqual({
      groups: {
        userId: "123",
      },
    });
  });

  it("should extract multiple named groups", () => {
    const result = tryLocationMatch({ href: "https://example.com/users/123/posts/456" } as Location, "https://example.com/users/(?<userId>\\d+)/posts/(?<postId>\\d+)");
    expect(result).toEqual({
      groups: {
        userId: "123",
        postId: "456",
      },
    });
  });

  it("should perform case-insensitive matching", () => {
    const result = tryLocationMatch({ href: "https://example.com/MyPage" } as Location, "https://example.com/mypage");
    expect(result).toEqual({
      groups: {},
    });
  });

  it("should perform case-insensitive matching with regex", () => {
    const result = tryLocationMatch({ href: "https://example.com/Users/123" } as Location, "https://example.com/users/\\d+");
    expect(result).toEqual({
      groups: {},
    });
  });

  it("should extract named groups with case-insensitive matching", () => {
    const result = tryLocationMatch({ href: "https://example.com/Products/789" } as Location, "https://example.com/products/(?<productId>\\d+)");
    expect(result).toEqual({
      groups: {
        productId: "789",
      },
    });
  });

  it("should match partial patterns", () => {
    const result = tryLocationMatch({ href: "https://example.com/page/subpage" } as Location, "https://example.com/page");
    expect(result).toEqual({
      groups: {},
    });
  });

  it("should not match when regex is anchored and pattern doesn't match", () => {
    const result = tryLocationMatch({ href: "https://example.com/page/subpage" } as Location, "^https://example.com/page$");
    expect(result).toBeNull();
  });

  it("should match when regex is anchored and pattern matches exactly", () => {
    const result = tryLocationMatch({ href: "https://example.com/page" } as Location, "^https://example.com/page$");
    expect(result).toEqual({
      groups: {},
    });
  });

  it("should handle complex regex patterns with optional groups", () => {
    const result = tryLocationMatch(
      { href: "https://example.com/api/v2/users?page=1&limit=10" } as Location,
      "https://example.com/api/v(?<version>\\d+)/(?<resource>\\w+)(?:\\?.*)?",
    );
    expect(result).toEqual({
      groups: {
        version: "2",
        resource: "users",
      },
    });
  });

  it("should handle real-world OutSystems URL with query parameters and named groups", () => {
    const result = tryLocationMatch(
      { href: "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview?CaseId=12345&URN=ABC123DEF" } as Location,
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
    const result = tryLocationMatch({ href: "https://example.com/search?foo=1&bar=2" } as Location, "https://example.com/search\\?.*");
    expect(result).toEqual({
      groups: {},
    });
  });

  it("should match when address has hash fragment", () => {
    const result = tryLocationMatch({ href: "https://example.com/page#section" } as Location, "https://example.com/page#section");
    expect(result).toEqual({
      groups: {},
    });
  });

  it("should perform case-insensitive matching on protocol", () => {
    const result = tryLocationMatch({ href: "https://example.com/page" } as Location, "HTTPS://example.com/page");
    expect(result).toEqual({
      groups: {},
    });
  });

  it("should perform case-insensitive matching on domain", () => {
    const result = tryLocationMatch({ href: "https://example.com/page" } as Location, "https://EXAMPLE.COM/page");
    expect(result).toEqual({
      groups: {},
    });
  });

  it("should handle empty named groups object when no groups are defined", () => {
    const result = tryLocationMatch({ href: "https://example.com/test" } as Location, "https://example.com/test");
    expect(result).toEqual({
      groups: {},
    });
  });

  it("should return null for completely different URLs", () => {
    const result = tryLocationMatch({ href: "https://different.com/page" } as Location, "https://example.com/page");
    expect(result).toBeNull();
  });

  it("should handle special regex characters in the pattern", () => {
    const result = tryLocationMatch({ href: "https://example.com/search?query=test" } as Location, "https://example\\.com/search\\?query=test");
    expect(result).toEqual({
      groups: {},
    });
  });

  it("should match when pattern has non-capturing groups", () => {
    const result = tryLocationMatch({ href: "https://example.com/api/v1/users" } as Location, "https://example\\.com/(?:api)/v(?<version>\\d+)/(?<resource>\\w+)");
    expect(result).toEqual({
      groups: {
        version: "1",
        resource: "users",
      },
    });
  });

  it("should handle multiple slashes in path", () => {
    const result = tryLocationMatch({ href: "https://example.com//double//slash//path" } as Location, "https://example.com//double//slash//path");
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
      { href: address } as Location,
      "^https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview(?=.*[&?]CaseId=(?<caseId>\\d+))(?=.*[&?]URN=(?<urn>[^&]+)).*$",
    );
    expect(result).toEqual({
      groups: { caseId: "123", urn: "abc" },
    });
  });

  it.each([
    "https://cps-dev.outsystemsenterprise.com/CaseReview?CMSCaseId=123",
    "https://cps-dev.outsystemsenterprise.com/CaseReview?CaseId=123",
    "https://cps-dev.outsystemsenterprise.com/CaseReview?foo=bar&CMSCaseId=123",
    "https://cps-dev.outsystemsenterprise.com/CaseReview?foo=bar&CaseId=123",
    "https://cps-dev.outsystemsenterprise.com/CaseReview?CMSCaseId=123",
    "https://cps-dev.outsystemsenterprise.com/CaseReview?CaseId=123",
    "https://cps-dev.outsystemsenterprise.com/CaseReview?CMSCaseId=123&foo=bar",
    "https://cps-dev.outsystemsenterprise.com/CaseReview?CaseId=123&foo=bar",
    "https://cps-dev.outsystemsenterprise.com/CaseReview?&foo=bar&CMSCaseId=123&baz=buz",
    "https://cps-dev.outsystemsenterprise.com/CaseReview?&foo=bar&CaseId=123&baz=buz",

    "https://cps-dev.outsystemsenterprise.com/CaseReview/?&foo=bar&CMSCaseId=123&baz=buz",
    "https://cps-dev.outsystemsenterprise.com/CaseReview/?&foo=bar&CaseId=123&baz=buz",

    "https://cps-dev.outsystemsenterprise.com/CaseReview/some-path?&foo=bar&CMSCaseId=123&baz=buz",
    "https://cps-dev.outsystemsenterprise.com/CaseReview/some-path?&foo=bar&CaseId=123&baz=buz",

    "https://cps-dev.outsystemsenterprise.com/CaseReview/some-path?&foo=bar&CMSCaseId=123&CaseId=123&baz=buz",
  ])("should match case review-style addresses based only on finding a CMSCaseId or CaseId parameter", address => {
    const result = tryLocationMatch({ href: address } as Location, "https://cps-dev.outsystemsenterprise.com/CaseReview.*?[&?](?:CMS)?CaseId=(?<caseId>\\d+)");
    expect(result).toEqual({
      groups: { caseId: "123" },
    });
  });
});
