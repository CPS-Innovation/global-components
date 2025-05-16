export type LinkCode = "tasks" | "cases" | "details" | "case-materials" | "review" | "cms-pre-charge-triage" | "bulk-um-classification";

export type OnwardLinkDefinition = string | { link: string; isOutSystems: true };

export type OnwardLinkDefinitions = Partial<{ [key in LinkCode]: OnwardLinkDefinition }>;

export type PathMatcher = { paths: string[]; matchedLinkCode: LinkCode; showSecondRow: boolean; onwardLinks: OnwardLinkDefinitions };

export type MatchedPathMatcher = Omit<PathMatcher, "paths"> & {
  href: string;
  pathTags?: { [key: string]: string };
};

export type AppLocationConfig = {
  pathRoots: string[];
  pathMatchers: PathMatcher[];
};

export const appLocationConfigs: AppLocationConfig[] = [
  {
    pathRoots: ["https://polaris-dev-notprod.cps.gov.uk/polaris-ui", "https://polaris-dev-cmsproxy.azurewebsites.net/polaris-ui", "http://localhost:3000/polaris-ui"],
    pathMatchers: [
      {
        paths: ["/polaris-ui/case-details/(?<urn>[^/]+)/(?<caseId>\\d+).*taskId=(?<taskId>\\d+)"],
        matchedLinkCode: "case-materials",
        showSecondRow: true,
        onwardLinks: {
          tasks: "https://cps-dev.outsystemsenterprise.com/WorkManagementApp/TaskList",
          cases: "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/TaskList?IsCasesNavigation=true",
          review: "https://cps-dev.outsystemsenterprise.com/CaseReview/RedirectCW?URN={urn}&CMSCaseId={caseId}",
          details: "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview?URN={urn}&CaseId={caseId}&IsDCFCase=false",
        },
      },
      {
        paths: ["/polaris-ui/case-details/(?<urn>[^/]+)/(?<caseId>\\d+)"],
        matchedLinkCode: "case-materials",
        showSecondRow: true,
        onwardLinks: {
          tasks: "https://cps-dev.outsystemsenterprise.com/WorkManagementApp/TaskList",
          cases: "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/TaskList?IsCasesNavigation=true",
          review: "https://cps-dev.outsystemsenterprise.com/CaseReview/RedirectCW?URN={urn}&CMSCaseId={caseId}",
          details: "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview?URN={urn}&CaseId={caseId}&IsDCFCase=false",
        },
      },
      {
        paths: ["/polaris-ui"],
        matchedLinkCode: "case-materials",
        showSecondRow: false,
        onwardLinks: {
          tasks: "https://cps-dev.outsystemsenterprise.com/WorkManagementApp/TaskList",
          cases: "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/TaskList?IsCasesNavigation=true",
        },
      },
    ],
  },
  {
    pathRoots: ["https://cps-dev.outsystemsenterprise.com/WorkManagementApp"],
    pathMatchers: [
      {
        paths: ["/WorkManagementApp/TaskList"],
        matchedLinkCode: "tasks",
        showSecondRow: false,
        onwardLinks: {
          tasks: "/WorkManagementApp/TaskList",
          cases: "https://sacpsglobalcomponents.z33.web.core.windows.net/static-app/cases",
        },
      },
    ],
  },
  {
    pathRoots: ["http://localhost:3333" /* npm start inside cps-global-header*/],
    pathMatchers: [
      {
        paths: [""],
        matchedLinkCode: "cases",
        showSecondRow: true,
        // add query params in alphabetical order e.g. ?a=1&b=2&c=1 rather than ?b=2&a=1&c=1
        onwardLinks: {
          tasks: "/?urn={urn}&caseId={caseId}",
          cases: "/?urn={urn}&caseId={caseId}",
          review: "/review",
          details: { link: "Please navigate to details page for case {caseId}", isOutSystems: true },
        },
      },
      {
        paths: ["/urns/(?<urn>[^/]+)/cases/(?<caseId>[^/]+)"],
        matchedLinkCode: "tasks",
        showSecondRow: false,
        onwardLinks: {
          tasks: "/urns/12AB121212/cases/11112222",
          cases: "/urns/34AB343434/cases/333344444",
        },
      },
    ],
  },
  {
    pathRoots: ["http://127.0.0.1:3000/static-app", "https://sacpsglobalcomponents.z33.web.core.windows.net/static-app"],
    pathMatchers: [
      {
        paths: ["/static-app/cases/urns/(?<urn>[^/]+)/cases/(?<caseId>[^/]+)/review"],
        matchedLinkCode: "review",
        showSecondRow: true,
        onwardLinks: {
          "tasks": "https://cps-dev.outsystemsenterprise.com/WorkManagementApp/TaskList",
          "cases": "/static-app/cases",
          "details": "/static-app/cases/urns/{urn}/cases/{caseId}",
          "case-materials": "/static-app/cases/urns/{urn}/cases/{caseId}/materials",
        },
      },
      {
        paths: ["/static-app/cases/urns/(?<urn>[^/]+)/cases/(?<caseId>[^/]+)/materials"],
        matchedLinkCode: "case-materials",
        showSecondRow: true,
        onwardLinks: {
          tasks: "https://cps-dev.outsystemsenterprise.com/WorkManagementApp/TaskList",
          cases: "/static-app/cases",
          details: "/static-app/cases/urns/{urn}/cases/{caseId}",
          review: "/static-app/cases/urns/{urn}/cases/{caseId}/review",
        },
      },
      {
        paths: ["/static-app/cases/urns/(?<urn>[^/]+)/cases/(?<caseId>[^/]+)"],
        matchedLinkCode: "details",
        showSecondRow: true,
        onwardLinks: {
          "tasks": "https://cps-dev.outsystemsenterprise.com/WorkManagementApp/TaskList",
          "cases": "/static-app/cases",
          "review": "/static-app/cases/urns/{urn}/cases/{caseId}/review",
          "case-materials": "/static-app/cases/urns/{urn}/cases/{caseId}/materials",
        },
      },
      {
        paths: ["/static-app/cases"],
        matchedLinkCode: "cases",
        showSecondRow: false,
        onwardLinks: {
          tasks: "https://cps-dev.outsystemsenterprise.com/WorkManagementApp/TaskList",
        },
      },
    ],
  },
  {
    pathRoots: ["http://localhost:3000/spa-app", "http://127.0.0.1:3000/spa-app", "https://sacpsglobalcomponents.z33.web.core.windows.net/spa-app"],
    pathMatchers: [
      {
        paths: ["/spa-app/#/tasks"],
        matchedLinkCode: "tasks",
        showSecondRow: false,
        onwardLinks: {
          cases: "/spa-app/#/cases",
        },
      },
      {
        paths: ["/spa-app/#/cases/urns/(?<urn>[^/]+)/cases/(?<caseId>[^/]+)/review"],
        matchedLinkCode: "review",
        showSecondRow: true,
        onwardLinks: {
          "tasks": "/spa-app/#/tasks",
          "cases": "/spa-app/#/cases",
          "details": "/spa-app/#/cases/urns/{urn}/cases/{caseId}",
          "case-materials": "/spa-app/#/cases/urns/{urn}/cases/{caseId}/materials",
        },
      },
      {
        paths: ["/spa-app/#/cases/urns/(?<urn>[^/]+)/cases/(?<caseId>[^/]+)/materials"],
        matchedLinkCode: "case-materials",
        showSecondRow: true,
        onwardLinks: {
          tasks: "/spa-app/#/tasks",
          cases: "/spa-app/#/cases",
          details: "/spa-app/#/cases/urns/{urn}/cases/{caseId}",
          review: "/spa-app/#/cases/urns/{urn}/cases/{caseId}/review",
        },
      },
      {
        paths: ["/spa-app/#/cases/urns/(?<urn>[^/]+)/cases/(?<caseId>[^/]+)"],
        matchedLinkCode: "details",
        showSecondRow: true,
        onwardLinks: {
          "tasks": "/spa-app/#/tasks",
          "cases": "/spa-app/#/cases",
          "review": "/spa-app/#/cases/urns/{urn}/cases/{caseId}/review",
          "case-materials": "/spa-app/#/cases/urns/{urn}/cases/{caseId}/materials",
        },
      },
      {
        paths: ["/spa-app/#/cases"],
        matchedLinkCode: "cases",
        showSecondRow: false,
        onwardLinks: {
          tasks: "/spa-app/#/tasks",
        },
      },
    ],
  },
  {
    pathRoots: ["https://personal-3hxfhjxg.outsystemscloud.com/Steftest"],
    pathMatchers: [
      {
        paths: ["/Steftest/AnotherPage"],
        matchedLinkCode: "cases",
        showSecondRow: false,
        onwardLinks: {
          tasks: { link: "/Steftest/", isOutSystems: true },
          cases: { link: "/Steftest/AnotherPage", isOutSystems: true },
        },
      },
      {
        paths: ["/Steftest/", "/Steftest/Home"],
        matchedLinkCode: "tasks",
        showSecondRow: false,
        onwardLinks: {
          tasks: { link: "/Steftest/", isOutSystems: true },
          cases: { link: "/Steftest/AnotherPage", isOutSystems: true },
        },
      },
    ],
  },
];
