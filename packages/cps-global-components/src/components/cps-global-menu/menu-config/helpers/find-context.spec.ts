import { findContext } from "./find-context";
import { Context } from "cps-global-configuration/dist/schema";

describe("findContext", () => {
  it("should return not found when context array is empty", () => {
    const contexts: Context[] = [];
    const address = "https://example.com/page";

    const result = findContext(contexts, address);
    expect(result).toEqual({
      found: false,
      contexts: undefined,
      tags: undefined,
    });
  });

  it("should find context with simple path match", () => {
    const contexts: Context[] = [
      {
        paths: ["https://example.com/page"],
        contexts: "page-context",
      },
    ];
    const address = "https://example.com/page";

    const result = findContext(contexts, address);
    expect(result).toEqual({
      found: true,
      contexts: "page-context",
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
    const address = "https://example.com/users/123";

    const result = findContext(contexts, address);
    expect(result).toEqual({
      found: true,
      contexts: "user-context",
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
    const address = "https://example.com/users/123/posts/456";

    const result = findContext(contexts, address);
    expect(result).toEqual({
      found: true,
      contexts: "post-context",
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
    const address = "https://example.com/specific";

    const result = findContext(contexts, address);
    expect(result).toEqual({
      found: true,
      contexts: "general-context",
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
    const address = "https://example.com/dashboard";

    const result = findContext(contexts, address);
    expect(result).toEqual({
      found: true,
      contexts: "admin-context",
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
    const address = "https://example.com/api/v2/users?page=1&limit=10";

    const result = findContext(contexts, address);
    expect(result).toEqual({
      found: true,
      contexts: "api-context",
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
    const address = "https://example.com/page3";

    const result = findContext(contexts, address);
    expect(result).toEqual({
      found: false,
      contexts: undefined,
      tags: undefined,
    });
  });

  it("should handle partial regex matches correctly", () => {
    const contexts: Context[] = [
      {
        paths: ["^https://example.com/page$"],
        contexts: "exact-page-context",
      },
    ];
    const address = "https://example.com/page/subpage";

    const result = findContext(contexts, address);
    expect(result).toEqual({
      found: false,
      contexts: undefined,
      tags: undefined,
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
    const address = "https://example.com/about";

    const result = findContext(contexts, address);
    expect(result).toEqual({
      found: true,
      contexts: "section-context-1",
      tags: {
        section: "about",
      },
    });
  });
});