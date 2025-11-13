cps_global_components_config_jsonp_callback({
  ENVIRONMENT: "local-development",
  APP_INSIGHTS_KEY: "e572c03c-8d38-4771-b193-962f13da1b1a",
  SURVEY_LINK: "https://forms.office.com/e/8KM9A7aS0e",
  SHOW_MENU: true,
  OS_HANDOVER_URL:
    "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html",
  COOKIE_HANDOVER_URL: "https://cin3.cps.gov.uk/polaris",
  TOKEN_HANDOVER_URL:
    "https://polaris-qa-notprod.cps.gov.uk/auth-refresh-cms-modern-token",
  CONTEXTS: [
    {
      paths: ["http://localhost:3333/cases/(?<caseId>\\d+)/materials"],
      contexts: "case materials",
      msalRedirectUrl: "",
    },
    {
      paths: ["http://localhost:3333/cases/(?<caseId>\\d+)/review"],
      contexts: "case review",
      msalRedirectUrl: "",
    },
    {
      paths: ["http://localhost:3333/cases/(?<caseId>\\d+)"],
      contexts: "case details",
      msalRedirectUrl: "",
    },
    {
      paths: ["http://localhost:3333/cases"],
      contexts: "cases",
      msalRedirectUrl: "",
    },
    {
      paths: ["http://localhost:3333/"],
      contexts: "tasks",
      msalRedirectUrl: "",
      domTagDefinitions: [
        {
          cssSelector: "a[href*='/polaris-ui/case-details/']",
          regex: "/polaris-ui/case-details/(?<urn>[^/]+)/(?<caseId>\\d+)",
        },
      ],
    },
  ],
  LINKS: [
    { label: "Tasks", level: 0, href: "/", activeContexts: "tasks" },
    { label: "Cases", level: 0, href: "/cases", activeContexts: "cases case" },
    {
      label: "Details",
      level: 1,
      href: "/cases/{caseId}",
      visibleContexts: "case",
      activeContexts: "details",
    },
    {
      label: "Materials",
      level: 1,
      href: "/cases/{caseId}/materials",
      visibleContexts: "case",
      activeContexts: "materials",
    },
    {
      label: "Review",
      level: 1,
      href: "/cases/{caseId}/review",
      visibleContexts: "case",
      activeContexts: "review",
      preferEventNavigationContexts: "details",
    },
  ],
});
