cps_global_components_config_jsonp_callback({
  ENVIRONMENT: "local-development",
  BANNER_TITLE_HREF: "http://localhost:3333/",
  APP_INSIGHTS_KEY: "e572c03c-8d38-4771-b193-962f13da1b1a",
  SURVEY_LINK: "https://forms.office.com/e/8KM9A7aS0e",
  SHOW_MENU: true,
  OS_HANDOVER_URL: "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html",
  COOKIE_HANDOVER_URL: "https://cin3.cps.gov.uk/polaris",
  TOKEN_HANDOVER_URL: "https://polaris-qa-notprod.cps.gov.uk/auth-refresh-cms-modern-token",
  CONTEXTS: [
    {
      msalRedirectUrl: "",
      contexts: [
        {
          path: "http://localhost:3333/cases/(?<caseId>\\d+)/materials",
          contextId: "materials",
        },
        {
          path: "http://localhost:3333/cases/(?<caseId>\\d+)/review",
          contextId: "review",
        },
        {
          path: "http://localhost:3333/cases/(?<caseId>\\d+)",
          contextId: "details",
        },
        {
          path: "http://localhost:3333/cases",
          contextId: "cases",
        },
        {
          domTagDefinitions: [
            {
              cssSelector: "a[href*='/polaris-ui/case-details/']",
              regex: '/polaris-ui/case-details/(?<urn>.+)/(?<caseId>\\d+)"',
            },
          ],
          contexts: [
            {
              path: "http://localhost:3333/",
              contextId: "tasks",
            },
          ],
        },
      ],
    },
  ],
  LINKS: [
    { label: "Tasks", level: 0, href: "/", activeContexts: "tasks" },
    { label: "Cases", level: 0, href: "/cases", activeContexts: "cases details materials review" },
    { label: "Details", level: 1, href: "/cases/{caseId}", visibleContexts: "details materials review", activeContexts: "details" },
    { label: "Materials", level: 1, href: "/cases/{caseId}/materials", visibleContexts: "details materials review", activeContexts: "materials" },
    {
      label: "Review",
      level: 1,
      href: "/cases/{caseId}/review",
      visibleContexts: "details materials review",
      activeContexts: "review",
      dcfContextsToUseEventNavigation: { contexts: "details", data: "" },
    },
  ],
});
