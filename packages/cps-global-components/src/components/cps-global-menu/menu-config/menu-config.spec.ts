jest.mock("./helpers/should-show-link");
jest.mock("./helpers/map-link-config");
jest.mock("./helpers/group-links-by-level");

import { menuConfig } from "./menu-config";
import { Config } from "cps-global-configuration";
import { FoundContext } from "../../../services/context/FoundContext";
import { shouldShowLink } from "./helpers/should-show-link";
import { mapLinkConfig } from "./helpers/map-link-config";
import { groupLinksByLevel } from "./helpers/group-links-by-level";
import { ApplicationFlags } from "../../../services/application-flags/ApplicationFlags";
import { Tags } from "@microsoft/applicationinsights-web";
import { AuthResult } from "../../../services/auth/AuthResult";
import { Build, State } from "../../../store/store";
import { CorrelationIds } from "../../../services/correlation/CorrelationIds";
import { CaseDetails } from "../../../services/data/CaseDetails";
import { MonitoringCodes } from "../../../services/data/MonitoringCode";
import { Result } from "../../../utils/Result";
import { CmsSessionHint } from "cps-global-configuration";

// Type the mocked functions
const mockShouldShowLink = shouldShowLink as jest.MockedFunction<typeof shouldShowLink>;
const mockMapLinkConfig = mapLinkConfig as jest.MockedFunction<typeof mapLinkConfig>;
const mockGroupLinksByLevel = groupLinksByLevel as jest.MockedFunction<typeof groupLinksByLevel>;

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
        dcfContextsToUseEventNavigation: { contexts: "event1", data: "" },
      },
      {
        label: "Link 2",
        href: "/link2",
        level: 1,
        visibleContexts: "context2",
        activeContexts: "active2",
        openInNewTab: true,
        dcfContextsToUseEventNavigation: { contexts: "event2", data: "" },
      },
      {
        label: "Link 3",
        href: "/link3",
        level: 0,
        visibleContexts: "context3",
        activeContexts: "active3",
        openInNewTab: false,
        dcfContextsToUseEventNavigation: { contexts: "event3", data: "" },
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
    isOutSystems: false,
    e2eTestMode: { isE2eTestMode: false },
    isLocalDevelopment: false,
    environment: "test",
  };

  const mockTags: Tags = {};

  const mockCaseDetails: Result<CaseDetails> = {
    found: true,
    result: { id: 1, urn: "foo", isDcfCase: false, leadDefendantFirstNames: "", leadDefendantSurname: "", leadDefendantType: "", numberOfDefendants: 1 },
  };

  const mockCaseMonitoringCodes: Result<MonitoringCodes> = { found: true, result: [] };

  const mockCmsSessionHint: Result<CmsSessionHint> = {
    found: false,
    error: {} as Error,
  };

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
      rootUrl: "",
      preview: { found: true, result: {} },
      context: foundContext,
      firstContext: foundContext,
      caseDetails: mockCaseDetails,
      config: mockConfig,
      flags: mockFlags,
      propTags: {},
      pathTags: {},
      domTags: mockTags,
      caseDetailsTags: {},
      cmsSessionTags: {},
      tags: {},
      auth: {} as AuthResult,
      fatalInitialisationError: undefined as any,
      initialisationStatus: "complete",
      correlationIds: {} as CorrelationIds,
      caseIdentifiers: { caseId: "1" },
      caseMonitoringCodes: mockCaseMonitoringCodes,
      build: {} as Build,
      cmsSessionHint: mockCmsSessionHint,
      handover: { found: false, error: {} as Error },
      recentCases: { found: false, error: {} as Error },
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
      cmsAuth: "",
      currentHref: "https://foo",
    };

    const mockState: State = {
      rootUrl: "",
      preview: { found: true, result: {} },
      context: foundContext,
      firstContext: foundContext,
      caseDetails: mockCaseDetails,
      config: mockConfig,
      flags: mockFlags,
      propTags: {},
      pathTags: {},
      domTags: foundTags,
      caseDetailsTags: {},
      cmsSessionTags: {},
      tags: {},
      auth: {} as AuthResult,
      fatalInitialisationError: undefined as any,
      initialisationStatus: "complete",
      correlationIds: {} as CorrelationIds,
      caseIdentifiers: { caseId: "1" },
      caseMonitoringCodes: mockCaseMonitoringCodes,
      build: {} as Build,
      cmsSessionHint: mockCmsSessionHint,
      handover: { found: false, error: {} as Error },
      recentCases: { found: false, error: {} as Error },
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
        dcfContextsToUseEventNavigation: undefined,
        disabled: false,
      })
      .mockReturnValueOnce({
        label: "Mapped Link 3",
        href: "/mapped3",
        level: 0,
        selected: false,
        openInNewTab: false,
        dcfContextsToUseEventNavigation: { contexts: "app-event section-event", data: "" },
        disabled: false,
      });
    mockMapLinkConfig.mockReturnValue(mockMapFunction);

    // Mock groupLinksByLevel
    const groupedLinks = [
      [
        { label: "Mapped Link 1", href: "/mapped1", selected: true, openInNewTab: false, dcfContextsToUseEventNavigation: undefined, ariaSelected: true as true, disabled: false },
        {
          label: "Mapped Link 3",
          href: "/mapped3",
          selected: false,
          openInNewTab: false,
          dcfContextsToUseEventNavigation: { contexts: "app-event section-event", data: "" },
          disabled: false,
        },
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
    expect(mockMapLinkConfig).toHaveBeenCalledWith({
      context: foundContext,
      tags: {},
      flags: mockFlags,
      config: mockConfig,
      cmsSessionHint: mockCmsSessionHint,
    });
    expect(mockMapFunction).toHaveBeenCalledTimes(2); // Only called for filtered links
    expect(mockGroupLinksByLevel).toHaveBeenCalledWith([
      {
        label: "Mapped Link 1",
        href: "/mapped1",
        level: 0,
        selected: true,
        openInNewTab: false,
        dcfContextsToUseEventNavigation: undefined,
        disabled: false,
      },
      {
        label: "Mapped Link 3",
        href: "/mapped3",
        level: 0,
        selected: false,
        openInNewTab: false,
        dcfContextsToUseEventNavigation: { contexts: "app-event section-event", data: "" },
        disabled: false,
      },
    ]);
  });
});
