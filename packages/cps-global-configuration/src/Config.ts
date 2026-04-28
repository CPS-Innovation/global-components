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

const featureFlagUsersSchema = z.object({
  adGroupIds: z.array(z.string()).optional(),
  // Lets use AD accounts UUID ObjectID rather than email address for ad-hoc user enrolment
  //  into the feature flag.  At the time of writing we check config in to source
  //  control, object ids do not convey personal data.
  adHocUserObjectIds: z.array(z.string()).optional(),
  generallyAvailable: z.boolean().optional(),
});

export type FeatureFlagUsers = z.infer<typeof featureFlagUsersSchema>;

const hostAppEventTargetSchema = z.object({
  selector: z.string(),
  action: z.enum(["click", "appear"]),
});

export type HostAppEventTarget = z.infer<typeof hostAppEventTargetSchema>;

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
  skipLinkClassName: z.string().optional(),
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

export const configBaseSchema = z.object({
  ENVIRONMENT: z.string(),
  REDIRECT_SCRIPT_URL: z.string().optional(),
  LINKS: z.array(linkSchema),
  BANNER_TITLE_HREF: z.string(),
  AD_TENANT_AUTHORITY: z.string().optional(),
  AD_CLIENT_ID: z.string().optional(),
  AD_GATEWAY_SCOPE: z.string().optional(),
  GATEWAY_URL: z.string().optional(),
  APP_INSIGHTS_CONNECTION_STRING: z.string().optional(),
  SURVEY_LINK: z.string().optional(),
  REPORT_ISSUE_LINK: z.string().optional(),
  SHOW_MENU: z.boolean().optional(),
  SHOW_RECENT_CASES: z.boolean().optional(),
  SHOW_MONITORING_CODES: z.boolean().optional(),
  SHOW_GOVUK_REBRAND: z.boolean().optional(),
  SHOW_NOTIFICATIONS: z.boolean().optional(),
  OS_HANDOVER_URL: z.string().optional(),
  FEATURE_FLAG_MENU_USERS: featureFlagUsersSchema.optional(),
  FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: z.boolean().optional(),
  SSO_SILENT_DELAY_MS: z.number().optional(),
  CACHE_CONFIG: cacheConfigSchema.optional(),
  FETCH_CIRCUIT_BREAKER_CONFIG: fetchCircuitBreakerConfigSchema.optional(),
  RECENT_CASES_NAVIGATE_URL: z.string().optional(),
  RECENT_CASES_LIST_LENGTH: z.number().optional(),
  SILENT_FLOW_DIAGNOSTICS_LENGTH: z.number().int().min(0).optional(),
  PROBE_IFRAME_BASE_URL: z.string().optional(),
  PROBE_IFRAME_TIMEOUT_MS: z.number().int().min(0).optional(),
  PROBE_IFRAME_REFRESH_PERIOD_MINS: z.number().int().min(0).optional(),
  PROBE_NAVIGATOR_PERMISSIONS_REFRESH_PERIOD_MINS: z.number().int().min(0).optional(),
  USER_DATA_REFRESH_PERIOD_MINS: z.number().int().min(0).optional(),
  USER_DATA_ATTEMPT_RETRY_ON_SPA_NAVIGATION: z.boolean().optional(),
});

export const configStorageSchema = configBaseSchema.extend({
  CONTEXTS: z.array(contextStorageSchema),
});

export type ConfigStorage = z.infer<typeof configStorageSchema>;

export const configSchema = configBaseSchema.extend({
  CONTEXTS: z.array(contextSchema),
});

export type Config = z.infer<typeof configSchema>;
