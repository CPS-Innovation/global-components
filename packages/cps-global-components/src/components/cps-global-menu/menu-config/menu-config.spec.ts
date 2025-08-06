jest.mock("../../../config/context/find-context");
jest.mock("./helpers/should-show-link");
jest.mock("./helpers/map-link-config");
jest.mock("./helpers/group-links-by-level");
jest.mock("./helpers/dom/tags");

import { menuConfig } from "./menu-config";
import { Config } from "cps-global-configuration";
import { findContext } from "../../../config/context/find-context";
import { shouldShowLink } from "./helpers/should-show-link";
import { mapLinkConfig } from "./helpers/map-link-config";
import { groupLinksByLevel } from "./helpers/group-links-by-level";
import { getDomTags } from "./helpers/dom/tags";

// Type the mocked functions
const mockFindContext = findContext as jest.MockedFunction<typeof findContext>;
const mockShouldShowLink = shouldShowLink as jest.MockedFunction<typeof shouldShowLink>;
const mockMapLinkConfig = mapLinkConfig as jest.MockedFunction<typeof mapLinkConfig>;
const mockGroupLinksByLevel = groupLinksByLevel as jest.MockedFunction<typeof groupLinksByLevel>;
const mockGetDomTags = getDomTags as jest.MockedFunction<typeof getDomTags>;

describe("menuConfig", () => {
  // Test data
  const mockLocation = {
    origin: "https://example.com",
    pathname: "/test",
    search: "?param=value",
    hash: "#section",
  } as Location;

  const mockWindow = {
    location: mockLocation,
  } as Window;

  const mockConfig: Config = {
    ENVIRONMENT: "test",
    SURVEY_LINK: "https://example.com/survey",
    SHOW_BANNER: true,
    SHOW_MENU: true,
    OS_HANDOVER_URL: "",
    COOKIE_HANDOVER_URL: "",
    TOKEN_HANDOVER_URL: "",
    LINKS: [
      {
        label: "Link 1",
        href: "/link1",
        level: 0,
        visibleContexts: "context1",
        activeContexts: "active1",
        openInNewTab: false,
        preferEventNavigationContexts: "event1",
      },
      {
        label: "Link 2",
        href: "/link2",
        level: 1,
        visibleContexts: "context2",
        activeContexts: "active2",
        openInNewTab: true,
        preferEventNavigationContexts: "event2",
      },
      {
        label: "Link 3",
        href: "/link3",
        level: 0,
        visibleContexts: "context3",
        activeContexts: "active3",
        openInNewTab: false,
        preferEventNavigationContexts: "event3",
      },
    ],
    CONTEXTS: [
      {
        paths: ["https://example.com/test"],
        contexts: "test-context",
        msalRedirectUrl: "foo",
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDomTags.mockReturnValue(undefined);
  });

  it("should return not found when context is not found", () => {
    mockFindContext.mockReturnValue({
      found: false,
      domTags: undefined,
      contextIndex: undefined,
    });

    const result = menuConfig(mockConfig, mockWindow);

    expect(result).toEqual({
      found: false,
      links: undefined,
    });

    expect(mockFindContext).toHaveBeenCalledWith(mockConfig.CONTEXTS, mockWindow);
    expect(mockShouldShowLink).not.toHaveBeenCalled();
    expect(mockMapLinkConfig).not.toHaveBeenCalled();
    expect(mockGroupLinksByLevel).not.toHaveBeenCalled();
  });

  it("should process links when context is found", () => {
    const foundContexts = "test-context";
    const foundTags = { tag1: "value1", tag2: "value2" };

    mockFindContext.mockReturnValue({
      found: true,
      paths: ["https://example.com/test"],
      contexts: foundContexts,
      domTags: undefined,
      tags: foundTags,
      contextIndex: 0,
      msalRedirectUrl: "foo",
    });

    // Mock shouldShowLink to filter out the second link
    const mockFilterFunction = jest
      .fn()
      .mockReturnValueOnce(true) // Link 1 passes
      .mockReturnValueOnce(false) // Link 2 filtered out
      .mockReturnValueOnce(true); // Link 3 passes
    mockShouldShowLink.mockReturnValue(mockFilterFunction);

    // Mock mapLinkConfig to transform the links
    const mockMapFunction = jest
      .fn()
      .mockReturnValueOnce({
        label: "Mapped Link 1",
        href: "/mapped1",
        level: 0,
        selected: true,
        openInNewTab: false,
        preferEventNavigation: false,
      })
      .mockReturnValueOnce({
        label: "Mapped Link 3",
        href: "/mapped3",
        level: 0,
        selected: false,
        openInNewTab: false,
        preferEventNavigation: true,
      });
    mockMapLinkConfig.mockReturnValue(mockMapFunction);

    // Mock groupLinksByLevel
    const groupedLinks = [
      [
        { label: "Mapped Link 1", href: "/mapped1", selected: true, openInNewTab: false, preferEventNavigation: false, ariaSelected: true as true },
        { label: "Mapped Link 3", href: "/mapped3", selected: false, openInNewTab: false, preferEventNavigation: true },
      ],
    ];
    mockGroupLinksByLevel.mockReturnValue(groupedLinks);

    const result = menuConfig(mockConfig, mockWindow);

    expect(result).toEqual({
      found: true,
      links: groupedLinks,
    });

    expect(mockFindContext).toHaveBeenCalledWith(mockConfig.CONTEXTS, mockWindow);
    expect(mockShouldShowLink).toHaveBeenCalledWith(foundContexts);
    expect(mockFilterFunction).toHaveBeenCalledTimes(3);
    expect(mockMapLinkConfig).toHaveBeenCalledWith({ contexts: foundContexts, tags: foundTags, handoverAdapter: expect.any(Function) });
    expect(mockMapFunction).toHaveBeenCalledTimes(2); // Only called for filtered links
    expect(mockGroupLinksByLevel).toHaveBeenCalledWith([
      {
        label: "Mapped Link 1",
        href: "/mapped1",
        level: 0,
        selected: true,
        openInNewTab: false,
        preferEventNavigation: false,
      },
      {
        label: "Mapped Link 3",
        href: "/mapped3",
        level: 0,
        selected: false,
        openInNewTab: false,
        preferEventNavigation: true,
      },
    ]);
  });

  it("should handle empty LINKS array", () => {
    const emptyConfig: Config = {
      ...mockConfig,
      LINKS: [],
    };

    mockFindContext.mockReturnValue({
      found: true,
      paths: ["https://example.com/test"],
      contexts: "test-context",
      domTags: undefined,
      tags: {},
      contextIndex: 0,
      msalRedirectUrl: "foo",
    });
    mockShouldShowLink.mockReturnValue(jest.fn());
    mockMapLinkConfig.mockReturnValue(jest.fn());
    mockGroupLinksByLevel.mockReturnValue([]);

    const result = menuConfig(emptyConfig, mockWindow);

    expect(result).toEqual({
      found: true,
      links: [],
    });

    expect(mockGroupLinksByLevel).toHaveBeenCalledWith([]);
  });

  it("should handle all links being filtered out", () => {
    mockFindContext.mockReturnValue({
      found: true,
      paths: ["https://example.com/test"],
      contexts: "test-context",
      domTags: undefined,
      tags: {},
      contextIndex: 0,
      msalRedirectUrl: "foo",
    });

    // Mock shouldShowLink to filter out all links
    const mockFilterFunction = jest.fn().mockReturnValue(false);
    mockShouldShowLink.mockReturnValue(mockFilterFunction);
    mockMapLinkConfig.mockReturnValue(jest.fn());
    mockGroupLinksByLevel.mockReturnValue([]);

    const result = menuConfig(mockConfig, mockWindow);

    expect(result).toEqual({
      found: true,
      links: [],
    });

    expect(mockFilterFunction).toHaveBeenCalledTimes(3);
    expect(mockMapLinkConfig).toHaveBeenCalled();
    expect(mockGroupLinksByLevel).toHaveBeenCalledWith([]);
  });

  it("should pass tags from findContext to mapLinkConfig", () => {
    const complexTags = {
      userId: "123",
      sectionId: "456",
      type: "advanced",
    };

    mockFindContext.mockReturnValue({
      found: true,
      paths: ["https://example.com/test"],
      contexts: "user-context section-context",
      domTags: undefined,
      tags: complexTags,
      contextIndex: 0,
      msalRedirectUrl: "foo",
    });

    mockShouldShowLink.mockReturnValue(jest.fn().mockReturnValue(true));
    mockMapLinkConfig.mockReturnValue(
      jest.fn().mockReturnValue({
        label: "Test",
        href: "/test",
        level: 0,
        selected: false,
        openInNewTab: false,
        preferEventNavigation: false,
      }),
    );
    mockGroupLinksByLevel.mockReturnValue([[]]);

    menuConfig(mockConfig, mockWindow);

    expect(mockMapLinkConfig).toHaveBeenCalledWith({ contexts: "user-context section-context", tags: complexTags, handoverAdapter: expect.any(Function) });
  });

  it("should handle different window locations", () => {
    const differentLocation = {
      origin: "https://app.example.com",
      pathname: "/admin/users",
      search: "?filter=active&sort=name",
      hash: "#top",
    } as Location;

    const differentWindow = {
      location: differentLocation,
    } as Window;

    mockFindContext.mockReturnValue({
      found: true,
      paths: ["https://app.example.com/admin/.*"],
      contexts: "admin",
      domTags: undefined,
      tags: { section: "users" },
      contextIndex: 0,
      msalRedirectUrl: "foo",
    });

    mockShouldShowLink.mockReturnValue(jest.fn().mockReturnValue(true));
    mockMapLinkConfig.mockReturnValue(
      jest.fn().mockReturnValue({
        label: "Test",
        href: "/test",
        level: 0,
        selected: false,
        openInNewTab: false,
        preferEventNavigation: false,
      }),
    );
    mockGroupLinksByLevel.mockReturnValue([[]]);

    menuConfig(mockConfig, differentWindow);

    expect(mockFindContext).toHaveBeenCalledWith(mockConfig.CONTEXTS, differentWindow);
  });

  it("should maintain link processing order", () => {
    mockFindContext.mockReturnValue({
      found: true,
      paths: ["https://example.com/test"],
      contexts: "test-context",
      domTags: undefined,
      tags: {},
      contextIndex: 0,
      msalRedirectUrl: "foo",
    });

    // All links pass the filter
    mockShouldShowLink.mockReturnValue(jest.fn().mockReturnValue(true));

    const mappedLinks: any[] = [];
    const mockMapFunction = jest.fn().mockImplementation(link => {
      const mapped = {
        label: `Mapped ${link.label}`,
        href: link.href,
        level: link.level,
        selected: false,
        openInNewTab: link.openInNewTab,
        preferEventNavigation: false,
      };
      mappedLinks.push(mapped);
      return mapped;
    });
    mockMapLinkConfig.mockReturnValue(mockMapFunction);

    mockGroupLinksByLevel.mockImplementation(links => {
      // Verify the order is maintained
      expect(links[0].label).toBe("Mapped Link 1");
      expect(links[1].label).toBe("Mapped Link 2");
      expect(links[2].label).toBe("Mapped Link 3");
      return [links];
    });

    menuConfig(mockConfig, mockWindow);

    expect(mockMapFunction).toHaveBeenCalledTimes(3);
  });

  it("should handle empty contexts array", () => {
    const configWithNoContexts: Config = {
      ...mockConfig,
      CONTEXTS: [],
    };

    mockFindContext.mockReturnValue({
      found: false,
      domTags: undefined,
      contextIndex: undefined,
    });

    const result = menuConfig(configWithNoContexts, mockWindow);

    expect(result).toEqual({
      found: false,
      links: undefined,
    });

    expect(mockFindContext).toHaveBeenCalledWith([], mockWindow);
  });

  it("should merge tags from DOM when getDomTags returns tagsCalled", () => {
    const contextTags = {
      contextTag1: "value1",
      contextTag2: "value2",
    };

    const domTags = {
      domTag1: "domValue1",
      domTag2: "domValue2",
      tagsCalled: "true",
    };

    mockGetDomTags.mockReturnValue(domTags);

    mockFindContext.mockReturnValue({
      found: true,
      paths: ["https://example.com/test"],
      contexts: "test-context",
      domTags: undefined,
      tags: contextTags,
      contextIndex: 0,
      msalRedirectUrl: "foo",
    });

    mockShouldShowLink.mockReturnValue(jest.fn().mockReturnValue(true));

    const mockMapFunction = jest.fn().mockReturnValue({
      label: "Test",
      href: "/test",
      level: 0,
      selected: false,
      openInNewTab: false,
      preferEventNavigation: false,
    });
    mockMapLinkConfig.mockReturnValue(mockMapFunction);

    mockGroupLinksByLevel.mockReturnValue([[]]);

    menuConfig(mockConfig, mockWindow);

    // Verify that mapLinkConfig was called with merged tags
    expect(mockMapLinkConfig).toHaveBeenCalledWith({
      contexts: "test-context",
      tags: {
        ...contextTags,
        ...domTags,
      },
      handoverAdapter: expect.any(Function),
    });

    // Verify that the merged tags include both context and DOM tags
    const mergedTags = mockMapLinkConfig.mock.calls[0][0].tags;
    expect(mergedTags).toEqual({
      contextTag1: "value1",
      contextTag2: "value2",
      domTag1: "domValue1",
      domTag2: "domValue2",
      tagsCalled: "true",
    });
  });
});
