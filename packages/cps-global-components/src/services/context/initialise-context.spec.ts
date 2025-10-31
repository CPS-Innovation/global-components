import { Context } from "cps-global-configuration/dist/schema";
import { initialiseContext } from "./initialise-context";
import { FoundContext } from "./FoundContext";
import * as tryLocationMatchModule from "./try-location-match";

const createMockWindow = (url: string): Window => {
  const urlObj = new URL(url);
  return {
    location: {
      origin: urlObj.origin,
      pathname: urlObj.pathname,
      search: urlObj.search,
      hash: urlObj.hash,
      href: url,
    } as Location,
  } as Window;
};

describe("initialiseContext", () => {
  let tryLocationMatchSpy: jest.SpyInstance;

  beforeEach(() => {
    tryLocationMatchSpy = jest.spyOn(tryLocationMatchModule, "tryLocationMatch");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should return not found when context array is empty", () => {
    const contexts: Context[] = [];
    const mockWindow = createMockWindow("https://example.com/page");

    const result = initialiseContext({ window: mockWindow, config: { CONTEXTS: contexts } });
    expect(result).toEqual({
      found: false,
    });
  });

  it("should find context with simple path match", () => {
    tryLocationMatchSpy.mockReturnValueOnce({ groups: {} });

    const contexts: Context[] = [
      {
        paths: ["https://example.com/page"],
        contexts: "page-context",
        msalRedirectUrl: "foo",
      },
    ];
    const mockWindow = createMockWindow("https://example.com/page");

    const result = initialiseContext({ window: mockWindow, config: { CONTEXTS: contexts } });
    expect(result).toEqual({
      contextIndex: 0,
      found: true,
      paths: ["https://example.com/page"],
      contexts: "page-context",
      domTagDefinitions: undefined,
      pathTags: {},
      msalRedirectUrl: "foo",
    } as FoundContext);
  });

  it("should return first matching context when multiple contexts match", () => {
    tryLocationMatchSpy.mockReturnValueOnce({ groups: {} }).mockReturnValueOnce({ groups: {} });

    const contexts: Context[] = [
      {
        paths: ["https://example.com/specific"],
        contexts: "first-context",
        msalRedirectUrl: "foo",
      },
      {
        paths: ["https://example.com/specific"],
        contexts: "second-context",
        msalRedirectUrl: "bar",
      },
    ];
    const mockWindow = createMockWindow("https://example.com/specific");

    const result = initialiseContext({ window: mockWindow, config: { CONTEXTS: contexts } });
    expect(result).toEqual({
      contextIndex: 0,
      found: true,
      paths: ["https://example.com/specific"],
      contexts: "first-context",
      domTagDefinitions: undefined,
      pathTags: {},
      msalRedirectUrl: "foo",
    } as FoundContext);
  });

  it("should check all paths in a context before moving to next context", () => {
    tryLocationMatchSpy.mockReturnValueOnce(null).mockReturnValueOnce({ groups: {} });

    const contexts: Context[] = [
      {
        paths: ["https://example.com/admin", "https://example.com/dashboard"],
        contexts: "admin-context",
        msalRedirectUrl: "foo",
      },
    ];
    const mockWindow = createMockWindow("https://example.com/dashboard");

    const result = initialiseContext({ window: mockWindow, config: { CONTEXTS: contexts } });
    expect(result).toEqual({
      contextIndex: 0,
      found: true,
      paths: ["https://example.com/admin", "https://example.com/dashboard"],
      contexts: "admin-context",
      domTagDefinitions: undefined,
      pathTags: {},
      msalRedirectUrl: "foo",
    } as FoundContext);
  });

  it("should return not found when no paths match", () => {
    tryLocationMatchSpy.mockReturnValue(null);

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

    const result = initialiseContext({ window: mockWindow, config: { CONTEXTS: contexts } });
    expect(result).toEqual({
      found: false,
    });
  });

  it("should return domTagDefinitions when context has domTagDefinitions property", () => {
    tryLocationMatchSpy.mockReturnValueOnce({ groups: {} });

    const contexts: Context[] = [
      {
        paths: ["https://example.com/with-dom-tags"],
        contexts: "dom-tags-context",
        msalRedirectUrl: "foo",
        domTagDefinitions: [
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

    const result = initialiseContext({ window: mockWindow, config: { CONTEXTS: contexts } });
    expect(result).toEqual({
      contextIndex: 0,
      found: true,
      paths: ["https://example.com/with-dom-tags"],
      contexts: "dom-tags-context",
      domTagDefinitions: [
        {
          cssSelector: ".header",
          regex: "^Header.*",
        },
        {
          cssSelector: "#main-content",
          regex: ".*content.*",
        },
      ],
      pathTags: {},
      msalRedirectUrl: "foo",
    } as FoundContext);
  });

  it("should handle context without domTagDefinitions (undefined)", () => {
    tryLocationMatchSpy.mockReturnValueOnce({ groups: {} });

    const contexts: Context[] = [
      {
        paths: ["https://example.com/no-dom-tags"],
        contexts: "no-dom-tags-context",
        msalRedirectUrl: "foo",
      },
    ];
    const mockWindow = createMockWindow("https://example.com/no-dom-tags");

    const result = initialiseContext({ window: mockWindow, config: { CONTEXTS: contexts } });
    expect(result).toEqual({
      contextIndex: 0,
      found: true,
      paths: ["https://example.com/no-dom-tags"],
      contexts: "no-dom-tags-context",
      domTagDefinitions: undefined,
      pathTags: {},
      msalRedirectUrl: "foo",
    } as FoundContext);
  });

  it("should preserve hash in URL matching", () => {
    tryLocationMatchSpy.mockReturnValueOnce({ groups: {} });

    const contexts: Context[] = [
      {
        paths: ["https://example.com/page#section"],
        contexts: "page-with-hash",
        msalRedirectUrl: "foo",
      },
    ];
    const mockWindow = createMockWindow("https://example.com/page#section");

    const result = initialiseContext({ window: mockWindow, config: { CONTEXTS: contexts } });
    expect(result).toEqual({
      contextIndex: 0,
      found: true,
      paths: ["https://example.com/page#section"],
      contexts: "page-with-hash",
      domTagDefinitions: undefined,
      pathTags: {},
      msalRedirectUrl: "foo",
    } as FoundContext);
  });

  describe("path tags handling", () => {
    it("should return empty pathTags when tryLocationMatch returns no groups", () => {
      tryLocationMatchSpy.mockReturnValueOnce({ groups: {} });

      const contexts: Context[] = [
        {
          paths: ["https://example.com/MyPage"],
          contexts: "page-context",
          msalRedirectUrl: "foo",
        },
      ];
      const mockWindow = createMockWindow("https://example.com/mypage");

      const result = initialiseContext({ window: mockWindow, config: { CONTEXTS: contexts } });
      expect(result).toEqual({
        contextIndex: 0,
        found: true,
        paths: ["https://example.com/MyPage"],
        contexts: "page-context",
        domTagDefinitions: undefined,
        pathTags: {},
        msalRedirectUrl: "foo",
      } as FoundContext);
    });

    it("should pass pathTags from tryLocationMatch to result", () => {
      tryLocationMatchSpy.mockReturnValueOnce({
        groups: {
          userId: "123",
          postId: "456",
        },
      });

      const contexts: Context[] = [
        {
          paths: ["https://example.com/users/(?<userId>\\d+)/posts/(?<postId>\\d+)"],
          contexts: "post-context",
          msalRedirectUrl: "foo",
        },
      ];
      const mockWindow = createMockWindow("https://example.com/users/123/posts/456");

      const result = initialiseContext({ window: mockWindow, config: { CONTEXTS: contexts } });
      expect(result).toEqual({
        contextIndex: 0,
        found: true,
        paths: ["https://example.com/users/(?<userId>\\d+)/posts/(?<postId>\\d+)"],
        contexts: "post-context",
        domTagDefinitions: undefined,
        pathTags: {
          userId: "123",
          postId: "456",
        },
        msalRedirectUrl: "foo",
      } as FoundContext);
    });

    it("should use pathTags in msalRedirectUrl substitution", () => {
      tryLocationMatchSpy.mockReturnValueOnce({
        groups: {
          port: "3000",
        },
      });

      const contexts: Context[] = [
        {
          paths: ["https://example.com:(?<port>\\d+)/page"],
          contexts: "page-context",
          msalRedirectUrl: "https://redirect.com:{port}/callback",
        },
      ];
      const mockWindow = createMockWindow("https://example.com:3000/page");

      const result = initialiseContext({ window: mockWindow, config: { CONTEXTS: contexts } });
      expect(result.msalRedirectUrl).toEqual("https://redirect.com:3000/callback");
    });
  });
});
