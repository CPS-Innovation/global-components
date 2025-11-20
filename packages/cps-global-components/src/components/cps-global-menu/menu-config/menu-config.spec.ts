jest.mock("./helpers/should-show-link");
jest.mock("./helpers/map-link-config");
jest.mock("./helpers/group-links-by-level");
jest.mock("../../../services/application-flags/is-outsystems-app");
jest.mock("cps-global-os-handover");

import { menuConfig } from "./menu-config";
import { Config } from "cps-global-configuration";
import { FoundContext } from "../../../services/context/FoundContext";
import { shouldShowLink } from "./helpers/should-show-link";
import { mapLinkConfig, MapLinkConfigParams } from "./helpers/map-link-config";
import { groupLinksByLevel } from "./helpers/group-links-by-level";
import { ApplicationFlags } from "../../../services/application-flags/ApplicationFlags";
import { Tags } from "@microsoft/applicationinsights-web";
import { AuthResult } from "../../../services/auth/AuthResult";
import { isOutSystemsApp } from "../../../services/application-flags/is-outsystems-app";
import { createOutboundUrlDirect } from "cps-global-os-handover";
import { State } from "../../../store/store";
import { CaseDetails } from "../../../services/data/types";
import { CorrelationIds } from "../../../services/correlation/CorrelationIds";

// Type the mocked functions
const mockShouldShowLink = shouldShowLink as jest.MockedFunction<typeof shouldShowLink>;
const mockMapLinkConfig = mapLinkConfig as jest.MockedFunction<typeof mapLinkConfig>;
const mockGroupLinksByLevel = groupLinksByLevel as jest.MockedFunction<typeof groupLinksByLevel>;
const mockIsOutSystemsApp = isOutSystemsApp as jest.MockedFunction<typeof isOutSystemsApp>;
const mockCreateOutboundUrlDirect = createOutboundUrlDirect as jest.MockedFunction<typeof createOutboundUrlDirect>;

describe("menuConfig", () => {
  // Test data
  const mockConfig: Config = {
    ENVIRONMENT: "test",
    SURVEY_LINK: "https://example.com/survey",
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
        path: "https://example.com/test",
        contextIds: "test-context",
        msalRedirectUrl: "foo",
      },
    ],
  } as Config;

  const mockFlags: ApplicationFlags = {
    isOverrideMode: false,
    isOutSystems: false,
    isE2eTestMode: false,
    isLocalDevelopment: false,
  };

  const mockTags: Tags = {};

  const mockCaseDetails: CaseDetails = { urn: "foo", caseId: 1, isDcf: false };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return error when context is not found", () => {
    const foundContext: FoundContext = {
      found: false,
      domTagDefinitions: undefined,
      contextIndex: undefined,
    };

    const mockState: State = {
      context: foundContext,
      caseDetails: mockCaseDetails,
      config: mockConfig,
      flags: mockFlags,
      propTags: {},
      pathTags: {},
      domTags: mockTags,
      tags: {},
      auth: {} as AuthResult,
      fatalInitialisationError: undefined as any,
      initialisationStatus: "complete",
      correlationIds: {} as CorrelationIds,
    };

    const result = menuConfig(mockState);

    expect(result).toEqual({
      status: "error",
      error: new Error("No context found for this URL."),
    });

    expect(mockShouldShowLink).not.toHaveBeenCalled();
    expect(mockMapLinkConfig).not.toHaveBeenCalled();
    expect(mockGroupLinksByLevel).not.toHaveBeenCalled();
  });

  it("should process links when context is found", () => {
    const foundContexts = "test-context";
    const foundTags = { tag1: "value1", tag2: "value2" };

    const foundContext: FoundContext = {
      found: true,
      path: "https://example.com/test",
      contextIds: foundContexts,
      domTagDefinitions: undefined,
      pathTags: {},
      contextIndex: 0,
      msalRedirectUrl: "foo",
      cmsAuthFromStorageKey: undefined,
    };

    const mockState: State = {
      context: foundContext,
      caseDetails: mockCaseDetails,
      config: mockConfig,
      flags: mockFlags,
      propTags: {},
      pathTags: {},
      domTags: foundTags,
      tags: {},
      auth: {} as AuthResult,
      fatalInitialisationError: undefined as any,
      initialisationStatus: "complete",
      correlationIds: {} as CorrelationIds,
    };

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

    const result = menuConfig(mockState);

    expect(result).toEqual({
      status: "ok",
      links: groupedLinks,
    });

    expect(mockShouldShowLink).toHaveBeenCalledWith(foundContexts);
    expect(mockFilterFunction).toHaveBeenCalledTimes(3);
    // The handoverAdapter should be a function when not in OutSystems (even with empty OS_HANDOVER_URL)
    expect(mockMapLinkConfig).toHaveBeenCalledWith({
      contextIds: foundContexts,
      tags: {},
      handoverAdapter: expect.any(Function),
    } as MapLinkConfigParams);
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

  it("should NOT create handoverAdapter when in OutSystems", () => {
    const foundContexts = "test-context";
    const foundTags = { tag1: "value1" };

    const foundContext: FoundContext = {
      found: true,
      path: "https://example.com/test",
      contextIds: foundContexts,
      domTagDefinitions: undefined,
      pathTags: {},
      contextIndex: 0,
      msalRedirectUrl: "foo",
      cmsAuthFromStorageKey: undefined,
    };

    const mockState: State = {
      context: foundContext,
      caseDetails: mockCaseDetails,
      config: {
        ...mockConfig,
        OS_HANDOVER_URL: "https://handover.example.com",
      },
      flags: {
        ...mockFlags,
        isOutSystems: true, // In OutSystems
      },
      propTags: {},
      pathTags: {},
      domTags: foundTags,
      tags: {},
      auth: {} as AuthResult,
      fatalInitialisationError: undefined as any,
      initialisationStatus: "complete",
      correlationIds: {} as CorrelationIds,
    };

    // Mock shouldShowLink to pass all links
    const mockFilterFunction = jest.fn().mockReturnValue(true);
    mockShouldShowLink.mockReturnValue(mockFilterFunction);

    // Mock mapLinkConfig
    const mockMapFunction = jest.fn().mockReturnValue({
      label: "Link",
      href: "/link",
      level: 0,
      selected: false,
      openInNewTab: false,
      preferEventNavigation: false,
    });
    mockMapLinkConfig.mockReturnValue(mockMapFunction);

    // Mock groupLinksByLevel
    mockGroupLinksByLevel.mockReturnValue([[]]);

    menuConfig(mockState);

    // Verify handoverAdapter is undefined when in OutSystems
    expect(mockMapLinkConfig).toHaveBeenCalledWith({
      contextIds: foundContexts,
      tags: {},
      handoverAdapter: undefined,
    } as MapLinkConfigParams);
  });

  it("should create handoverAdapter when not in OutSystems and OS_HANDOVER_URL is provided", () => {
    const foundContexts = "test-context";
    const foundTags = { tag1: "value1" };

    const foundContext: FoundContext = {
      found: true,
      path: "https://example.com/test",
      contextIds: foundContexts,
      domTagDefinitions: undefined,
      pathTags: {},
      contextIndex: 0,
      msalRedirectUrl: "foo",
      cmsAuthFromStorageKey: undefined,
    };

    const mockState: State = {
      context: foundContext,
      caseDetails: mockCaseDetails,
      config: {
        ...mockConfig,
        OS_HANDOVER_URL: "https://handover.example.com",
      },
      flags: {
        ...mockFlags,
        isOutSystems: false,
      },
      propTags: {},
      pathTags: {},
      domTags: foundTags,
      tags: {},
      auth: {} as AuthResult,
      fatalInitialisationError: undefined as any,
      initialisationStatus: "complete",
      correlationIds: {} as CorrelationIds,
    };

    // Mock shouldShowLink to pass all links
    const mockFilterFunction = jest.fn().mockReturnValue(true);
    mockShouldShowLink.mockReturnValue(mockFilterFunction);

    // Mock mapLinkConfig
    const mockMapFunction = jest.fn().mockReturnValue({
      label: "Link",
      href: "/link",
      level: 0,
      selected: false,
      openInNewTab: false,
      preferEventNavigation: false,
    });
    mockMapLinkConfig.mockReturnValue(mockMapFunction);

    // Mock groupLinksByLevel
    mockGroupLinksByLevel.mockReturnValue([[]]);

    menuConfig(mockState);

    // Verify handoverAdapter is passed as a function (not undefined)
    expect(mockMapLinkConfig).toHaveBeenCalledWith({
      contextIds: foundContexts,
      tags: {},
      handoverAdapter: expect.any(Function),
    } as MapLinkConfigParams);
  });

  it("should test handoverAdapter returns URL unchanged when OS_HANDOVER_URL or COOKIE_HANDOVER_URL is empty", () => {
    const foundContexts = "test-context";
    const foundTags = { tag1: "value1" };

    const foundContext: FoundContext = {
      found: true,
      path: "https://example.com/test",
      contextIds: foundContexts,
      domTagDefinitions: undefined,
      pathTags: foundTags,
      contextIndex: 0,
      msalRedirectUrl: "foo",
      cmsAuthFromStorageKey: undefined,
    };

    const mockState: State = {
      context: foundContext,
      caseDetails: mockCaseDetails,
      config: {
        ...mockConfig,
        OS_HANDOVER_URL: "", // Empty OS_HANDOVER_URL
        COOKIE_HANDOVER_URL: "", // Empty COOKIE_HANDOVER_URL
      },
      flags: {
        ...mockFlags,
        isOutSystems: false,
      },
      propTags: {},
      pathTags: {},
      domTags: mockTags,
      tags: {},
      auth: {} as AuthResult,
      fatalInitialisationError: undefined as any,
      initialisationStatus: "complete",
      correlationIds: {} as CorrelationIds,
    };

    // Mock shouldShowLink to pass all links
    const mockFilterFunction = jest.fn().mockReturnValue(true);
    mockShouldShowLink.mockReturnValue(mockFilterFunction);

    // Capture the handoverAdapter function
    let capturedHandoverAdapter: ((targetUrl: string) => string) | undefined;
    mockMapLinkConfig.mockImplementation(args => {
      capturedHandoverAdapter = args.handoverAdapter;
      return jest.fn();
    });

    // Mock groupLinksByLevel
    mockGroupLinksByLevel.mockReturnValue([[]]);

    menuConfig(mockState);

    // Test the handoverAdapter function
    expect(capturedHandoverAdapter).toBeDefined();

    // Even if it's an OutSystems URL, without OS_HANDOVER_URL and COOKIE_HANDOVER_URL it should return unchanged
    mockIsOutSystemsApp.mockReturnValue(true);
    expect(capturedHandoverAdapter!("https://os-app.com/page")).toBe("https://os-app.com/page");

    expect(mockIsOutSystemsApp).toHaveBeenCalledWith({ location: { href: "https://os-app.com/page" } });
    expect(mockCreateOutboundUrlDirect).not.toHaveBeenCalled();
  });

  it("should test handoverAdapter function behavior with handover URLs", () => {
    const foundContexts = "test-context";
    const foundTags = { tag1: "value1" };

    const foundContext: FoundContext = {
      found: true,
      path: "https://example.com/test",
      contextIds: foundContexts,
      domTagDefinitions: undefined,
      pathTags: foundTags,
      contextIndex: 0,
      msalRedirectUrl: "foo",
      cmsAuthFromStorageKey: undefined,
    };

    const mockState: State = {
      context: foundContext,
      caseDetails: mockCaseDetails,
      config: {
        ...mockConfig,
        OS_HANDOVER_URL: "https://handover.example.com",
        COOKIE_HANDOVER_URL: "https://cookie.example.com",
      },
      flags: {
        ...mockFlags,
        isOutSystems: false,
      },
      propTags: {},
      pathTags: {},
      domTags: mockTags,
      tags: {},
      auth: {} as AuthResult,
      fatalInitialisationError: undefined as any,
      initialisationStatus: "complete",
      correlationIds: {} as CorrelationIds,
    };

    // Mock shouldShowLink to pass all links
    const mockFilterFunction = jest.fn().mockReturnValue(true);
    mockShouldShowLink.mockReturnValue(mockFilterFunction);

    // Capture the handoverAdapter function
    let capturedHandoverAdapter: ((targetUrl: string) => string) | undefined;
    mockMapLinkConfig.mockImplementation(args => {
      capturedHandoverAdapter = args.handoverAdapter;
      return jest.fn();
    });

    // Mock groupLinksByLevel
    mockGroupLinksByLevel.mockReturnValue([[]]);

    menuConfig(mockState);

    // Test the handoverAdapter function
    expect(capturedHandoverAdapter).toBeDefined();

    // Test case 1: Non-OutSystems URL should not be modified
    mockIsOutSystemsApp.mockReturnValue(false);
    expect(capturedHandoverAdapter!("https://regular-app.com/page")).toBe("https://regular-app.com/page");

    // Test case 2: OutSystems URL should go through direct handover
    mockIsOutSystemsApp.mockReturnValue(true);
    mockCreateOutboundUrlDirect.mockReturnValue("https://cookie.example.com?r=https://handover.example.com?stage=os-cookie-return&r=https://os-app.com/page");

    const result = capturedHandoverAdapter!("https://os-app.com/page");

    expect(mockIsOutSystemsApp).toHaveBeenCalledWith({ location: { href: "https://os-app.com/page" } });
    expect(mockCreateOutboundUrlDirect).toHaveBeenCalledWith({
      cookieHandoverUrl: "https://cookie.example.com",
      handoverUrl: "https://handover.example.com",
      targetUrl: "https://os-app.com/page",
    });
    expect(result).toBe("https://cookie.example.com?r=https://handover.example.com?stage=os-cookie-return&r=https://os-app.com/page");
  });
});
