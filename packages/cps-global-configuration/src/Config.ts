import { z } from "zod";

const dcfContextsToUseEventNavigationSchema = z.object({
  contexts: z.string(),
  data: z.string(),
  paramsToAddToQuery: z
    .record(z.string(), z.union([z.string(), z.null()]))
    .optional(),
  waitingBehaviour: z.enum(["disabled", "default-dcf", "default-no-dcf"]),
});

export type ContextsToUseEventNavigation = z.infer<
  typeof dcfContextsToUseEventNavigationSchema
>;

const linkSchema = z.object({
  label: z.string(),
  href: z.string(),
  dcfHref: z.string().optional(),
  activeContexts: z.string(),
  visibleContexts: z.string(),
  openInNewTab: z.boolean().optional(),
  dcfContextsToUseEventNavigation:
    dcfContextsToUseEventNavigationSchema.optional(),
  level: z.number(),
});

export type Link = z.infer<typeof linkSchema>;

const domTagDefinitionsSchema = z.object({
  cssSelector: z.string(),
  regex: z.string(),
});

export type DomTagDefinitions = z.infer<typeof domTagDefinitionsSchema>;

const authorisationSchema = z.object({
  adGroup: z.string(),
  unAuthedRedirectUrl: z.string(),
});

export type Authorisation = z.infer<typeof authorisationSchema>;

// All four inclusion fields below are independent OR conditions: a user is
// "in" if ANY one of them is satisfied. Combine freely — e.g. "test team
// always on, plus 1% of everyone else" is `adGroupIds + variants`.
const featureFlagUsersSchema = z.object({
  // AD security group ids; user is in if their token has any of these.
  adGroupIds: z.array(z.string()).optional(),
  // AAD object ids (UUIDs) for ad-hoc enrolment — used for individual
  // engineers who don't fit a group. Object ids don't convey personal data, so
  // they're safe to commit to source control.
  adHocUserObjectIds: z.array(z.string()).optional(),
  // Trump card: when true, everyone is in regardless of any other condition.
  generallyAvailable: z.boolean().optional(),
  // A/B / canary bucketing. Authed users are bucketed deterministically by
  // their objectId; landing on a non-control share puts them "in" AND tags the
  // result with the variant name. The implicit residual is "control" — never
  // name a variant "control" here. Salt defaults to the parent FEATURE_FLAG_*
  // key; override via `variantSalt` if you ever rename the key and want the
  // existing population to keep its assignments.
  variants: z
    .record(
      z.string().refine(k => k !== "control", "variant name 'control' is reserved"),
      z.number().min(0).max(100),
    )
    .optional(),
  variantSalt: z.string().optional(),
});

export type FeatureFlagUsers = z.infer<typeof featureFlagUsersSchema>;

const hostAppEventTargetSchema = z.object({
  selector: z.string(),
  action: z.enum(["click", "appear"]),
});

export type HostAppEventTarget = z.infer<typeof hostAppEventTargetSchema>;

const skipLinksSchema = z.object({
  mainSelector: z.string().optional(),
  searchSelector: z.string().optional(),
  listSelector: z.string().optional(),
  useScroll: z.boolean().optional(),
});

export type SkipLinks = z.infer<typeof skipLinksSchema>;

const caseLockingRegionSchema = z.object({
  // The section kind, lower-case by local convention; the wire form upper-cases it,
  // so "victim_witness" becomes VICTIM_WITNESS. Must match what CMS Classic and CMS
  // Modern register for the same thing, or the two systems register different
  // sections and never see each other.
  code: z.string(),
  // The subject, for kinds scoped to one person. A TEMPLATE, substituted from the
  // current tags exactly as msalRedirectUrl and the menu hrefs are — so a named
  // group captured by this context's own path regex is all it takes:
  //   path:    "...In_WitnessID=(?<witnessId>\\d+)..."
  //   subject: "{witnessId}"
  // Omitted for case-wide kinds. If the template resolves to nothing the region is
  // case-wide rather than scoped to an empty subject.
  subject: z.string().optional(),
});

export type CaseLockingRegion = z.infer<typeof caseLockingRegionSchema>;

const contextPathsSchema = z.object({
  path: z.string(),
  contextIds: z.string(),
  // See contextsBaseSchema — a leaf may name its own app rather than inherit one.
  caseLockingAppName: z.string().optional(),
  // See contextsBaseSchema — likewise for the section this path represents.
  caseLockingRegion: caseLockingRegionSchema.optional(),
  domTagDefinitions: z.array(domTagDefinitionsSchema).optional(),
  showNotification: z.boolean().optional(),
  preventADAndDataCalls: z.boolean().optional(),
  preventPageViewAnalytics: z.boolean().optional(),
  takeTagsFromHandover: z.boolean().optional(),
  hostAppEventTargets: z.array(hostAppEventTargetSchema).optional(),
});

export type ContextPathsSchema = z.infer<typeof contextPathsSchema>;

const contextsBaseSchema = z.object({
  // The application name to REGISTER with the presence API for pages matching this
  // context. The API keeps a fixed vocabulary — "Work Management App", "Case Review
  // App", "Casework App", "CMS Classic", "CMS Modern" — and rejects anything else,
  // so a typo here is reported as no app rather than as itself.
  //
  // Lives on the context tree because it is a fact about WHICH APP a URL belongs to,
  // which is exactly what the tree already encodes. Set it on a branch and every
  // path under it inherits; a leaf can override. Display names are NOT here: they
  // are a code-level mapping shared with the legacy clients.
  caseLockingAppName: z.string().optional(),
  /**
   * WHICH SECTION OF THE CASE this path represents, for presence.
   *
   * Every variant we need to report is identifiable from the address bar, and this
   * tree is already the thing that matches addresses — so the section is recorded
   * here rather than discovered in the DOM. A path that says which witness is being
   * edited has said everything presence needs.
   *
   * ABSENT MEANS NO PRESENCE ON THIS PATH — there is no fallback. Every case
   * context states its own section, including the plain ones that say { "code":
   * "case" }. That verbosity buys two things: "this page reports nothing" becomes
   * something config can say, and presence stops being a side effect of whether a
   * caseId happened to reach the store from a path group or from a handover.
   *
   * ORDERING MATTERS. Contexts are first-match-wins, so a path that names a finer
   * section must sit BEFORE the broader one it would otherwise fall through to —
   * and should carry the same contextIds, so the only new thing about it is the
   * section it reports.
   *
   * This does NOT replace <cps-region>. The header renders one either way, with the
   * code this names — so a host app that later needs something finer than a URL can
   * express drops its own tag in, and the more-specific-region rule in
   * initialise-case-locking stands ours down. One mechanism, two ways to drive it.
   */
  caseLockingRegion: caseLockingRegionSchema.optional(),
  msalRedirectUrl: z.string().optional(),
  domTagDefinitions: z.array(domTagDefinitionsSchema).optional(),
  forceCmsAuthRefresh: z.boolean().optional(),
  authorisation: authorisationSchema.optional(),
  headerCustomCssClasses: z.string().optional(),
  headerCustomCssStyles: z.record(z.string(), z.string().optional()).optional(),
  cmsAuthFromStorageKey: z.string().optional(),
  skipLinks: skipLinksSchema.optional(),
});

const contextStorageSchema: z.ZodType<ContextStorageSchema> =
  contextsBaseSchema.extend({
    contexts: z.lazy(() =>
      z.array(z.union([contextStorageSchema, contextPathsSchema]))
    ),
  });

// Because of the recursion we define the type before the schema
export type ContextStorageSchema = z.infer<typeof contextsBaseSchema> & {
  contexts: (ContextStorageSchema | ContextPathsSchema)[];
};

const contextSchema = contextsBaseSchema.extend({
  path: z.string(),
  contextIds: z.string(),
  msalRedirectUrl: z.string(), // redefine as required, not optional in app config
  showNotification: z.boolean().optional(),
  preventADAndDataCalls: z.boolean().optional(),
  preventPageViewAnalytics: z.boolean().optional(),
  takeTagsFromHandover: z.boolean().optional(),
  hostAppEventTargets: z.array(hostAppEventTargetSchema).optional(),
});

export type Context = z.infer<typeof contextSchema>;

const cacheConfigSchema = z.object({
  maxAge: z.number(),
  maxItems: z.number(),
});

export type CacheConfig = z.infer<typeof cacheConfigSchema>;

const fetchCircuitBreakerConfigSchema = z.object({
  maxPerInterval: z.number(),
  intervalMs: z.number(),
});

export type FetchCircuitBreakerConfig = z.infer<
  typeof fetchCircuitBreakerConfigSchema
>;

const cmsAuthStorageKeysSchema = z.object({
  WMA_JSON: z.string(),
  WMA_COOKIES: z.string(),
  CASE_REVIEW_JSON: z.string(),
  CASE_REVIEW_COOKIES: z.string(),
  HOME_JSON: z.string(),
  HOME_COOKIES: z.string(),
  HOME_IS_FROM_PROXY: z.string(),
  // VCA (FCT2-21576) rolls out per environment, so its ClientVar keys are
  // optional: an env where Victims Case Application isn't live yet simply omits
  // them and every VCA read/write in os-handover/core/storage.ts no-ops. They
  // are deliberately absent from prod until VCA goes live there — adding them
  // makes isStoredAuthCurrent false for every existing user (nobody has the key
  // yet), pushing all of them through an extra token-handover hop on their next
  // CMS→OS handover.
  VCA_JSON: z.string().optional(),
  VCA_COOKIES: z.string().optional(),
});

export type CmsAuthStorageKeys = z.infer<typeof cmsAuthStorageKeysSchema>;

export const configBaseSchema = z.object({
  ENVIRONMENT: z.string(),
  REDIRECT_SCRIPT_URL: z.string().optional(),
  CASE_LOCKING_API_URL: z.string().optional(),
  // Scopes for the presence API access token. NOT the gateway scopes: one token
  // has one audience, and AD_GATEWAY_SCOPES asks for Microsoft Graph, so a token
  // acquired with those would be rejected by the presence API the moment it starts
  // validating. The presence API is the SAME app registration the SPA signs in
  // with (client and resource in one), which is why no consent grant is involved —
  // see _PRESENCE_API_SCOPE in global-components.cms-auth-v2.ts, where the legacy
  // clients request exactly the same scope. Empty means send no token at all.
  CASE_LOCKING_SCOPES: z.array(z.string()).optional(),
  // Where the interruption's secondary action sends someone: the case's details
  // page. One value rather than one per context — case details is the same RCMS
  // page whichever application you were interrupted in, so a per-context URL would
  // be three copies of one fact.
  //
  // Templated like the menu's own hrefs, and substituted the same way: {caseId} and
  // {urn} come from the current tags. Absent means no link is offered rather than
  // a link that goes nowhere.
  CASE_LOCKING_CASE_DETAILS_URL: z.string().optional(),
  LINKS: z.array(linkSchema),
  BANNER_TITLE_HREF: z.string(),
  AD_TENANT_AUTHORITY: z.string().optional(),
  AD_CLIENT_ID: z.string().optional(),
  // Scopes to request on every MSAL call (silent, redirect, gateway token).
  // Used as the single source of truth so the login cascade and the gateway
  // token-fetch share a cache entry rather than asking AAD for two unrelated
  // access tokens. Defaults to `[]`, in which case MSAL falls back to OIDC
  // defaults (openid, profile, offline_access) — the cascade still works but
  // without the access-token cache short-circuit, so each silent step does a
  // /token round-trip on cache miss.
  AD_GATEWAY_SCOPES: z.array(z.string()).default([]),
  GATEWAY_URL: z.string().optional(),
  APP_INSIGHTS_CONNECTION_STRING: z.string().optional(),
  SURVEY_LINK: z.string().optional(),
  REPORT_ISSUE_LINK: z.string().optional(),
  // Absolute URL of the deployed accessibility statement page. Could be derived
  // from rootUrl (the statement is a sibling artifact of the bundle), but kept
  // here so we can repoint it at a different location without a code change.
  ACCESSIBILITY_STATEMENT_URL: z.string().optional(),
  SHOW_MENU: z.boolean().optional(),
  SHOW_RECENT_CASES: z.boolean().optional(),
  SHOW_MONITORING_CODES: z.boolean().optional(),
  SHOW_HEADER_REBRAND: z.union([z.literal("cps"), z.literal("gds")]).optional(),
  SHOW_CASE_DETAILS: z.union([z.literal("a"), z.literal("b")]).optional(),
  SHOW_NOTIFICATIONS: z.boolean().optional(),
  OS_HANDOVER_URL: z.string().optional(),
  // localStorage key (an OS ClientVar, e.g.
  // "$OS_Users$Casework_Blocks$ClientVars$EntraID") that the auth-handover
  // writes the user's Entra objectId into on the OS origin, so OutSystems can
  // read it. Blank/absent turns the feature off — no write happens. Tactical
  // bridge (FCT2-21199); the objectId is the same one the AuthHint carries.
  OS_ENTRA_ID_STORAGE_KEY: z.string().optional(),
  FEATURE_FLAG_MENU_USERS: featureFlagUsersSchema.optional(),
  FEATURE_FLAG_USE_MSAL_FULL_REDIRECT_USERS: featureFlagUsersSchema.optional(),
  FEATURE_FLAG_CASE_LOCKING_USERS: featureFlagUsersSchema.optional(),
  // Who gets accessibility mode — the footer "Settings" link and the low-contrast
  // background that page controls. generallyAvailable is the env-wide switch (on
  // across pre-prod); adGroupIds/adHocUserObjectIds let us pilot with named groups
  // in prod ahead of GA. ORs with the per-user preview flag and local-dev.
  FEATURE_FLAG_ACCESSIBILITY_MODE_USERS: featureFlagUsersSchema.optional(),
  // Broad on/off for the OutSystems Triage XHR observation shim. The shim
  // also installs when the per-user preview flag is set, so flipping this off
  // disables observation for everyone except preview-flag opt-ins (which is
  // what we want: ops can cut the feature instantly while engineers can still
  // exercise it in a "should-be-off" state).
  OS_TRIAGE_REQUEST_OBSERVATION_ENABLED: z.boolean().optional(),
  // Broad on/off for the Dark Reader usage probe (one-shot analytics event when we spot the
  // Dark Reader extension on <html>). Shipped enabled in every environment; flip to false to
  // kill the probe en masse for an environment. Absent is treated as off by the consumer, so
  // keep it set true in each env config.
  PROBE_DARK_READER_USAGE: z.boolean().optional(),
  // Broad on/off (GA gate) for the footer shim — the DOM surgery that hides the
  // host <footer> and swaps in cps-global-footer. ORs with the per-user preview
  // flag and local-dev: true switches the shim on for everyone, false reverts to
  // preview opt-ins + local dev only. Kept as an env-config kill-switch so ops can
  // cut the feature instantly if it misbehaves in prod, without a code change.
  FOOTER_SHIM_ENABLED: z.boolean().optional(),
  SSO_SILENT_DELAY_MS: z.number().optional(),
  CACHE_CONFIG: cacheConfigSchema.optional(),
  FETCH_CIRCUIT_BREAKER_CONFIG: fetchCircuitBreakerConfigSchema.optional(),
  RECENT_CASES_NAVIGATE_URL: z.string().optional(),
  RECENT_CASES_LIST_LENGTH: z.number().optional(),
  PROBE_NAVIGATOR_PERMISSIONS_REFRESH_PERIOD_MINS: z.number().int().min(0).optional(),
  USER_DATA_REFRESH_PERIOD_MINS: z.number().int().min(0).optional(),
  USER_DATA_ATTEMPT_RETRY_ON_SPA_NAVIGATION: z.boolean().optional(),
  CMS_AUTH_STORAGE_KEYS: cmsAuthStorageKeysSchema,
});

export const configStorageSchema = configBaseSchema.extend({
  CONTEXTS: z.array(contextStorageSchema),
});

export type ConfigStorage = z.infer<typeof configStorageSchema>;

export const configSchema = configBaseSchema.extend({
  CONTEXTS: z.array(contextSchema),
});

export type Config = z.infer<typeof configSchema>;
