import { z } from "zod";

const linkSchema = z.object({
  label: z.string(),
  href: z.string(),
  activeContexts: z.string(),
  visibleContexts: z.string(),
  openInNewTab: z.boolean().optional(),
  preferEventNavigationContexts: z.string().optional(),
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

const contextPathsSchema = z.object({
  path: z.string(),
  contextIds: z.string(),
});

export type ContextPathsSchema = z.infer<typeof contextPathsSchema>;

const contextsBaseSchema = z.object({
  msalRedirectUrl: z.string().optional(),
  domTagDefinitions: z.array(domTagDefinitionsSchema).optional(),
  applyOutSystemsShim: z.boolean().optional(),
  forceCmsAuthRefresh: z.boolean().optional(),
  authorisation: authorisationSchema.optional(),
  headerCustomCssClasses: z.string().optional(),
  headerCustomCssStyles: z.record(z.string(), z.string().optional()).optional(),
  showMenuOverride: z
    .union([z.literal("always-show-menu"), z.literal("never-show-menu")])
    .optional(),
  cmsAuthFromStorageKey: z.string().optional(),
  skipToMainContentCustomSelector: z.string().optional(),
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
});

export type Context = z.infer<typeof contextSchema>;

const configBaseSchema = z.object({
  ENVIRONMENT: z.string(),
  LINKS: z.array(linkSchema),
  BANNER_TITLE_HREF: z.string(),
  AD_TENANT_AUTHORITY: z.string().optional(),
  AD_CLIENT_ID: z.string().optional(),
  AD_GATEWAY_SCOPE: z.string().optional(),
  GATEWAY_URL: z.string().optional(),
  APP_INSIGHTS_CONNECTION_STRING: z.string().optional(),
  SURVEY_LINK: z.string().optional(),
  SHOW_MENU: z.boolean().optional(),
  SHOW_GOVUK_REBRAND: z.boolean().optional(),
  OS_HANDOVER_URL: z.string().optional(),
  COOKIE_HANDOVER_URL: z.string().optional(),
  TOKEN_HANDOVER_URL: z.string().optional(),
  FEATURE_FLAG_MENU_USERS: featureFlagUsersSchema.optional(),
  FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: z.boolean().optional(),
});

export const configStorageSchema = configBaseSchema.extend({
  CONTEXTS: z.array(contextStorageSchema),
});

export type ConfigStorage = z.infer<typeof configStorageSchema>;

export const configSchema = configBaseSchema.extend({
  CONTEXTS: z.array(contextSchema),
});

export type Config = z.infer<typeof configSchema>;
