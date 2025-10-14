import { findContext } from "./find-context";
import { Context } from "cps-global-configuration/dist/schema";

const createMockWindow = (url: string): Window => {
  const urlObj = new URL(url);
  return {
    location: {
      origin: urlObj.origin,
      pathname: urlObj.pathname,
      search: urlObj.search,
      hash: urlObj.hash,
    } as Location,
  } as Window;
};

describe("findContext", () => {
  it("should return not found when context array is empty", () => {
    const contexts: Context[] = [];
    const mockWindow = createMockWindow("https://example.com/page");

    const result = findContext(contexts, mockWindow);
    expect(result).toEqual({
      found: false,
    });
  });

  it("should find context with simple path match", () => {
    const contexts: Context[] = [
      {
        paths: ["https://example.com/page"],
        contexts: "page-context",
        msalRedirectUrl: "foo",
      },
    ];
    const mockWindow = createMockWindow("https://example.com/page");

    const result = findContext(contexts, mockWindow);
    expect(result).toEqual({
      contextIndex: 0,
      found: true,
      paths: ["https://example.com/page"],
      contexts: "page-context",
      domTags: undefined,
      tags: {},
      msalRedirectUrl: "foo",
    });
  });

  it("should find context with regex path match", () => {
    const contexts: Context[] = [
      {
        paths: ["https://example.com/users/\\d+"],
        contexts: "user-context",
        msalRedirectUrl: "foo",
      },
    ];
    const mockWindow = createMockWindow("https://example.com/users/123");

    const result = findContext(contexts, mockWindow);
    expect(result).toEqual({
      contextIndex: 0,
      found: true,
      paths: ["https://example.com/users/\\d+"],
      contexts: "user-context",
      domTags: undefined,
      tags: {},
      msalRedirectUrl: "foo",
    });
  });

  it("should extract named groups from regex match", () => {
    const contexts: Context[] = [
      {
        paths: ["https://example.com/users/(?<userId>\\d+)/posts/(?<postId>\\d+)"],
        contexts: "post-context",
        msalRedirectUrl: "foo",
      },
    ];
    const mockWindow = createMockWindow("https://example.com/users/123/posts/456");

    const result = findContext(contexts, mockWindow);
    expect(result).toEqual({
      contextIndex: 0,
      found: true,
      paths: ["https://example.com/users/(?<userId>\\d+)/posts/(?<postId>\\d+)"],
      contexts: "post-context",
      domTags: undefined,
      tags: {
        userId: "123",
        postId: "456",
      },
      msalRedirectUrl: "foo",
    });
  });

  it("should return first matching context when multiple paths match", () => {
    const contexts: Context[] = [
      {
        paths: ["https://example.com/.*"],
        contexts: "general-context",
        msalRedirectUrl: "foo",
      },
      {
        paths: ["https://example.com/specific"],
        contexts: "specific-context",
        msalRedirectUrl: "bar",
      },
    ];
    const mockWindow = createMockWindow("https://example.com/specific");

    const result = findContext(contexts, mockWindow);
    expect(result).toEqual({
      contextIndex: 0,
      found: true,
      paths: ["https://example.com/.*"],
      contexts: "general-context",
      domTags: undefined,
      tags: {},
      msalRedirectUrl: "foo",
    });
  });

  it("should check all paths in a context before moving to next context", () => {
    const contexts: Context[] = [
      {
        paths: ["https://example.com/admin", "https://example.com/dashboard"],
        contexts: "admin-context",
        msalRedirectUrl: "foo",
      },
    ];
    const mockWindow = createMockWindow("https://example.com/dashboard");

    const result = findContext(contexts, mockWindow);
    expect(result).toEqual({
      contextIndex: 0,
      found: true,
      paths: ["https://example.com/admin", "https://example.com/dashboard"],
      contexts: "admin-context",
      domTags: undefined,
      tags: {},
      msalRedirectUrl: "foo",
    });
  });

  it("should handle complex regex patterns", () => {
    const contexts: Context[] = [
      {
        paths: ["https://example.com/api/v(?<version>\\d+)/(?<resource>\\w+)(?:\\?.*)?"],
        contexts: "api-context",
        msalRedirectUrl: "foo",
      },
    ];
    const mockWindow = createMockWindow("https://example.com/api/v2/users?page=1&limit=10");

    const result = findContext(contexts, mockWindow);
    expect(result).toEqual({
      contextIndex: 0,
      found: true,
      paths: ["https://example.com/api/v(?<version>\\d+)/(?<resource>\\w+)(?:\\?.*)?"],
      contexts: "api-context",
      domTags: undefined,
      tags: {
        version: "2",
        resource: "users",
      },
      msalRedirectUrl: "foo",
    });
  });

  it("should return not found when no paths match", () => {
    const contexts: Context[] = [
      {
        paths: ["https://example.com/page1"],
        contexts: "page1-context",
        msalRedirectUrl: "foo",
      },
      {
        paths: ["https://example.com/page2"],
        contexts: "page2-context",
        msalRedirectUrl: "foo",
      },
    ];
    const mockWindow = createMockWindow("https://example.com/page3");

    const result = findContext(contexts, mockWindow);
    expect(result).toEqual({
      found: false,
    });
  });

  it("should handle partial regex matches correctly", () => {
    const contexts: Context[] = [
      {
        paths: ["^https://example.com/page$"],
        contexts: "exact-page-context",
        msalRedirectUrl: "foo",
      },
    ];
    const mockWindow = createMockWindow("https://example.com/page/subpage");

    const result = findContext(contexts, mockWindow);
    expect(result).toEqual({
      found: false,
    });
  });

  it("should handle multiple contexts with same path patterns", () => {
    const contexts: Context[] = [
      {
        paths: ["https://example.com/(?<section>\\w+)"],
        contexts: "section-context-1",
        msalRedirectUrl: "foo",
      },
      {
        paths: ["https://example.com/(?<section>\\w+)"],
        contexts: "section-context-2",
        msalRedirectUrl: "bar",
      },
    ];
    const mockWindow = createMockWindow("https://example.com/about");

    const result = findContext(contexts, mockWindow);
    expect(result).toEqual({
      contextIndex: 0,
      found: true,
      paths: ["https://example.com/(?<section>\\w+)"],
      contexts: "section-context-1",
      domTags: undefined,
      tags: {
        section: "about",
      },
      msalRedirectUrl: "foo",
    });
  });

  it("should return domTags when context has domTags property", () => {
    const contexts: Context[] = [
      {
        paths: ["https://example.com/with-dom-tags"],
        contexts: "dom-tags-context",
        msalRedirectUrl: "foo",
        domTags: [
          {
            cssSelector: ".header",
            regex: "^Header.*",
          },
          {
            cssSelector: "#main-content",
            regex: ".*content.*",
          },
        ],
      },
    ];
    const mockWindow = createMockWindow("https://example.com/with-dom-tags");

    const result = findContext(contexts, mockWindow);
    expect(result).toEqual({
      contextIndex: 0,
      found: true,
      paths: ["https://example.com/with-dom-tags"],
      contexts: "dom-tags-context",
      domTags: [
        {
          cssSelector: ".header",
          regex: "^Header.*",
        },
        {
          cssSelector: "#main-content",
          regex: ".*content.*",
        },
      ],
      tags: {},
      msalRedirectUrl: "foo",
    });
  });

  it("should handle context without domTags (undefined)", () => {
    const contexts: Context[] = [
      {
        paths: ["https://example.com/no-dom-tags"],
        contexts: "no-dom-tags-context",
        msalRedirectUrl: "foo",
      },
    ];
    const mockWindow = createMockWindow("https://example.com/no-dom-tags");

    const result = findContext(contexts, mockWindow);
    expect(result).toEqual({
      contextIndex: 0,
      found: true,
      paths: ["https://example.com/no-dom-tags"],
      contexts: "no-dom-tags-context",
      domTags: undefined,
      tags: {},
      msalRedirectUrl: "foo",
    });
  });

  it("should return domTags with regex match and named groups", () => {
    const contexts: Context[] = [
      {
        paths: ["https://example.com/products/(?<productId>\\d+)"],
        contexts: "product-context",
        msalRedirectUrl: "foo",
        domTags: [
          {
            cssSelector: "[data-product-id]",
            regex: "product-\\d+",
          },
        ],
      },
    ];
    const mockWindow = createMockWindow("https://example.com/products/123");

    const result = findContext(contexts, mockWindow);
    expect(result).toEqual({
      contextIndex: 0,
      found: true,
      paths: ["https://example.com/products/(?<productId>\\d+)"],
      contexts: "product-context",
      domTags: [
        {
          cssSelector: "[data-product-id]",
          regex: "product-\\d+",
        },
      ],
      tags: {
        productId: "123",
      },
      msalRedirectUrl: "foo",
    });
  });

  it("should handle URLs with sorted query parameters", () => {
    const contexts: Context[] = [
      {
        paths: ["https://example.com/search\\?bar=2&foo=1"],
        contexts: "search-context",
        msalRedirectUrl: "foo",
      },
    ];
    // URL with parameters in different order should still match after sorting
    const mockWindow = createMockWindow("https://example.com/search?foo=1&bar=2");

    const result = findContext(contexts, mockWindow);
    expect(result).toEqual({
      contextIndex: 0,
      found: true,
      paths: ["https://example.com/search\\?bar=2&foo=1"],
      contexts: "search-context",
      domTags: undefined,
      tags: {},
      msalRedirectUrl: "foo",
    });
  });

  it("should preserve hash in URL matching", () => {
    const contexts: Context[] = [
      {
        paths: ["https://example.com/page#section"],
        contexts: "page-with-hash",
        msalRedirectUrl: "foo",
      },
    ];
    const mockWindow = createMockWindow("https://example.com/page#section");

    const result = findContext(contexts, mockWindow);
    expect(result).toEqual({
      contextIndex: 0,
      found: true,
      paths: ["https://example.com/page#section"],
      contexts: "page-with-hash",
      domTags: undefined,
      tags: {},
      msalRedirectUrl: "foo",
    });
  });

  describe("case-insensitive matching", () => {
    it("should match URLs with different case in path", () => {
      const contexts: Context[] = [
        {
          paths: ["https://example.com/MyPage"],
          contexts: "page-context",
          msalRedirectUrl: "foo",
        },
      ];
      const mockWindow = createMockWindow("https://example.com/mypage");

      const result = findContext(contexts, mockWindow);
      expect(result).toEqual({
        contextIndex: 0,
        found: true,
        paths: ["https://example.com/MyPage"],
        contexts: "page-context",
        domTags: undefined,
        tags: {},
        msalRedirectUrl: "foo",
      });
    });

    it("should match URLs with different case in domain", () => {
      const contexts: Context[] = [
        {
          paths: ["https://EXAMPLE.COM/page"],
          contexts: "page-context",
          msalRedirectUrl: "foo",
        },
      ];
      const mockWindow = createMockWindow("https://example.com/page");

      const result = findContext(contexts, mockWindow);
      expect(result).toEqual({
        contextIndex: 0,
        found: true,
        paths: ["https://EXAMPLE.COM/page"],
        contexts: "page-context",
        domTags: undefined,
        tags: {},
        msalRedirectUrl: "foo",
      });
    });

    it("should match URLs with different case in protocol", () => {
      const contexts: Context[] = [
        {
          paths: ["HTTPS://example.com/page"],
          contexts: "page-context",
          msalRedirectUrl: "foo",
        },
      ];
      const mockWindow = createMockWindow("https://example.com/page");

      const result = findContext(contexts, mockWindow);
      expect(result).toEqual({
        contextIndex: 0,
        found: true,
        paths: ["HTTPS://example.com/page"],
        contexts: "page-context",
        domTags: undefined,
        tags: {},
        msalRedirectUrl: "foo",
      });
    });

    it("should match regex patterns case-insensitively", () => {
      const contexts: Context[] = [
        {
          paths: ["https://example.com/Users/\\d+"],
          contexts: "user-context",
          msalRedirectUrl: "foo",
        },
      ];
      const mockWindow = createMockWindow("https://example.com/users/123");

      const result = findContext(contexts, mockWindow);
      expect(result).toEqual({
        contextIndex: 0,
        found: true,
        paths: ["https://example.com/Users/\\d+"],
        contexts: "user-context",
        domTags: undefined,
        tags: {},
        msalRedirectUrl: "foo",
      });
    });

    it("should extract named groups with case-insensitive matching", () => {
      const contexts: Context[] = [
        {
          paths: ["https://example.com/Products/(?<productId>\\d+)"],
          contexts: "product-context",
          msalRedirectUrl: "foo",
        },
      ];
      const mockWindow = createMockWindow("https://example.com/products/789");

      const result = findContext(contexts, mockWindow);
      expect(result).toEqual({
        contextIndex: 0,
        found: true,
        paths: ["https://example.com/Products/(?<productId>\\d+)"],
        contexts: "product-context",
        domTags: undefined,
        tags: {
          productId: "789",
        },
        msalRedirectUrl: "foo",
      });
    });

    it("should match query parameters case-insensitively", () => {
      const contexts: Context[] = [
        {
          paths: ["https://example.com/search\\?BAR=2&FOO=1"],
          contexts: "search-context",
          msalRedirectUrl: "foo",
        },
      ];
      const mockWindow = createMockWindow("https://example.com/search?bar=2&foo=1");

      const result = findContext(contexts, mockWindow);
      expect(result).toEqual({
        contextIndex: 0,
        found: true,
        paths: ["https://example.com/search\\?BAR=2&FOO=1"],
        contexts: "search-context",
        domTags: undefined,
        tags: {},
        msalRedirectUrl: "foo",
      });
    });

    it("should match hash fragment case-insensitively", () => {
      const contexts: Context[] = [
        {
          paths: ["https://example.com/page#Section"],
          contexts: "section-context",
          msalRedirectUrl: "foo",
        },
      ];
      const mockWindow = createMockWindow("https://example.com/page#section");

      const result = findContext(contexts, mockWindow);
      expect(result).toEqual({
        contextIndex: 0,
        found: true,
        paths: ["https://example.com/page#Section"],
        contexts: "section-context",
        domTags: undefined,
        tags: {},
        msalRedirectUrl: "foo",
      });
    });

    it("should match complex URLs with mixed case throughout", () => {
      const contexts: Context[] = [
        {
          paths: ["HTTPS://EXAMPLE.COM/API/V(?<version>\\d+)/(?<resource>\\w+)(?:\\?.*)?"],
          contexts: "api-context",
          msalRedirectUrl: "foo",
        },
      ];
      const mockWindow = createMockWindow("https://example.com/api/v2/users?page=1");

      const result = findContext(contexts, mockWindow);
      expect(result).toEqual({
        contextIndex: 0,
        found: true,
        paths: ["HTTPS://EXAMPLE.COM/API/V(?<version>\\d+)/(?<resource>\\w+)(?:\\?.*)?"],
        contexts: "api-context",
        domTags: undefined,
        tags: {
          version: "2",
          resource: "users",
        },
        msalRedirectUrl: "foo",
      });
    });

    it("should match real-world OutSystems URL with query parameters and named groups", () => {
      const contexts: Context[] = [
        {
          paths: ["https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview.*?[&?]CaseId=(?<caseId>\\d+)&URN=(?<urn>[^&]+)"],
          contexts: "case-overview-context",
          msalRedirectUrl: "foo",
        },
      ];
      const mockWindow = createMockWindow(
        "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview?CaseId=12345&URN=ABC123DEF"
      );

      const result = findContext(contexts, mockWindow);
      expect(result).toEqual({
        contextIndex: 0,
        found: true,
        paths: ["https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview.*?[&?]CaseId=(?<caseId>\\d+)&URN=(?<urn>[^&]+)"],
        contexts: "case-overview-context",
        domTags: undefined,
        tags: {
          caseId: "12345",
          urn: "ABC123DEF",
        },
        msalRedirectUrl: "foo",
      });
    });

    it("should match real-world OutSystems URL with case variations", () => {
      const contexts: Context[] = [
        {
          paths: ["https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview.*?[&?]CaseId=(?<caseId>\\d+)&URN=(?<urn>[^&]+)"],
          contexts: "case-overview-context",
          msalRedirectUrl: "foo",
        },
      ];
      const mockWindow = createMockWindow(
        "https://cps-tst.outsystemsenterprise.com/workmanagementapp/caseoverview?caseid=67890&urn=XYZ789GHI"
      );

      const result = findContext(contexts, mockWindow);
      expect(result).toEqual({
        contextIndex: 0,
        found: true,
        paths: ["https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview.*?[&?]CaseId=(?<caseId>\\d+)&URN=(?<urn>[^&]+)"],
        contexts: "case-overview-context",
        domTags: undefined,
        tags: {
          caseId: "67890",
          urn: "XYZ789GHI",
        },
        msalRedirectUrl: "foo",
      });
    });

    it("should match real-world OutSystems URL with parameters in different order (after sorting)", () => {
      const contexts: Context[] = [
        {
          paths: ["https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview.*?[&?]CaseId=(?<caseId>\\d+)&URN=(?<urn>[^&]+)"],
          contexts: "case-overview-context",
          msalRedirectUrl: "foo",
        },
      ];
      // Note: buildSanitizedAddress sorts params alphabetically (case-insensitive)
      // CaseId, URN are already in the correct sorted order
      const mockWindow = createMockWindow(
        "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview?URN=ABC123&CaseId=54321"
      );

      const result = findContext(contexts, mockWindow);
      expect(result).toEqual({
        contextIndex: 0,
        found: true,
        paths: ["https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview.*?[&?]CaseId=(?<caseId>\\d+)&URN=(?<urn>[^&]+)"],
        contexts: "case-overview-context",
        domTags: undefined,
        tags: {
          caseId: "54321",
          urn: "ABC123",
        },
        msalRedirectUrl: "foo",
      });
    });

    it("should match real-world OutSystems URL when additional parameters sort after URN", () => {
      const contexts: Context[] = [
        {
          paths: ["https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview.*?[&?]CaseId=(?<caseId>\\d+)&URN=(?<urn>[^&]+)"],
          contexts: "case-overview-context",
          msalRedirectUrl: "foo",
        },
      ];
      // Note: 'z' sorts after 'URN' (case-insensitive: C < U < z)
      const mockWindow = createMockWindow(
        "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview?CaseId=99999&URN=TEST123&zextra=value"
      );

      const result = findContext(contexts, mockWindow);
      expect(result).toEqual({
        contextIndex: 0,
        found: true,
        paths: ["https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview.*?[&?]CaseId=(?<caseId>\\d+)&URN=(?<urn>[^&]+)"],
        contexts: "case-overview-context",
        domTags: undefined,
        tags: {
          caseId: "99999",
          urn: "TEST123",
        },
        msalRedirectUrl: "foo",
      });
    });
  });
});
