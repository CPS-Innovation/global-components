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
    });
  });

  it("should find context with regex path match", () => {
    const contexts: Context[] = [
      {
        paths: ["https://example.com/users/\\d+"],
        contexts: "user-context",
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
    });
  });

  it("should extract named groups from regex match", () => {
    const contexts: Context[] = [
      {
        paths: ["https://example.com/users/(?<userId>\\d+)/posts/(?<postId>\\d+)"],
        contexts: "post-context",
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
    });
  });

  it("should return first matching context when multiple paths match", () => {
    const contexts: Context[] = [
      {
        paths: ["https://example.com/.*"],
        contexts: "general-context",
      },
      {
        paths: ["https://example.com/specific"],
        contexts: "specific-context",
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
    });
  });

  it("should check all paths in a context before moving to next context", () => {
    const contexts: Context[] = [
      {
        paths: ["https://example.com/admin", "https://example.com/dashboard"],
        contexts: "admin-context",
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
    });
  });

  it("should handle complex regex patterns", () => {
    const contexts: Context[] = [
      {
        paths: ["https://example.com/api/v(?<version>\\d+)/(?<resource>\\w+)(?:\\?.*)?"],
        contexts: "api-context",
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
    });
  });

  it("should return not found when no paths match", () => {
    const contexts: Context[] = [
      {
        paths: ["https://example.com/page1"],
        contexts: "page1-context",
      },
      {
        paths: ["https://example.com/page2"],
        contexts: "page2-context",
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
      },
      {
        paths: ["https://example.com/(?<section>\\w+)"],
        contexts: "section-context-2",
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
    });
  });

  it("should return domTags when context has domTags property", () => {
    const contexts: Context[] = [
      {
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
    });
  });

  it("should handle context without domTags (undefined)", () => {
    const contexts: Context[] = [
      {
        paths: ["https://example.com/no-dom-tags"],
        contexts: "no-dom-tags-context",
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
    });
  });

  it("should return domTags with regex match and named groups", () => {
    const contexts: Context[] = [
      {
        paths: ["https://example.com/products/(?<productId>\\d+)"],
        contexts: "product-context",
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
    });
  });

  it("should handle URLs with sorted query parameters", () => {
    const contexts: Context[] = [
      {
        paths: ["https://example.com/search\\?bar=2&foo=1"],
        contexts: "search-context",
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
    });
  });

  it("should preserve hash in URL matching", () => {
    const contexts: Context[] = [
      {
        paths: ["https://example.com/page#section"],
        contexts: "page-with-hash",
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
    });
  });
});
