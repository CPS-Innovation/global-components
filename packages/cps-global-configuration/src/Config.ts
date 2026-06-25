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

const contextPathsSchema = z.object({
  path: z.string(),
  contextIds: z.string(),
  domTagDefinitions: z.array(domTagDefinitionsSchema).optional(),
  showNotification: z.boolean().optional(),
  preventADAndDataCalls: z.boolean().optional(),
  preventPageViewAnalytics: z.boolean().optional(),
  takeTagsFromHandover: z.boolean().optional(),
  hostAppEventTargets: z.array(hostAppEventTargetSchema).optional(),
});

export type ContextPathsSchema = z.infer<typeof contextPathsSchema>;

const contextsBaseSchema = z.object({
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
});

export type CmsAuthStorageKeys = z.infer<typeof cmsAuthStorageKeysSchema>;

export const configBaseSchema = z.object({
  ENVIRONMENT: z.string(),
  REDIRECT_SCRIPT_URL: z.string().optional(),
  CASE_LOCKING_POC_SCRIPT_BLOB_ADDRESS: z.string().optional(),
  CASE_LOCKING_API_URL: z.string().optional(),
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
  FEATURE_FLAG_MENU_USERS: featureFlagUsersSchema.optional(),
  FEATURE_FLAG_USE_MSAL_FULL_REDIRECT_USERS: featureFlagUsersSchema.optional(),
  FEATURE_FLAG_CASE_LOCKING_USERS: featureFlagUsersSchema.optional(),
  // Short-lived AD-redirect beacons (drop 8). Both default off; flip per env to
  // enable. Beacon URL is derived at runtime from script.src (sibling of the
  // handover bundle), so no separate config entry. Independent kill-switches
  // so success / failure can be enabled / disabled independently.
  BEACON_AD_REDIRECT_SUCCESSES_ENABLED: z.boolean().optional(),
  BEACON_AD_REDIRECT_FAILURES_ENABLED: z.boolean().optional(),
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
  SSO_SILENT_DELAY_MS: z.number().optional(),
  CACHE_CONFIG: cacheConfigSchema.optional(),
  FETCH_CIRCUIT_BREAKER_CONFIG: fetchCircuitBreakerConfigSchema.optional(),
  RECENT_CASES_NAVIGATE_URL: z.string().optional(),
  RECENT_CASES_LIST_LENGTH: z.number().optional(),
  PROBE_IFRAME_BASE_URL: z.string().optional(),
  PROBE_IFRAME_TIMEOUT_MS: z.number().int().min(0).optional(),
  PROBE_IFRAME_REFRESH_PERIOD_MINS: z.number().int().min(0).optional(),
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
