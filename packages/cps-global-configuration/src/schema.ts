import { z } from "zod";

const linkSchema = z.object({
  label: z.string(),
  href: z.string(),
  activeContexts: z.string(),
  openInNewTab: z.boolean().optional(),
  visibleContexts: z.string(),
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

const contextSchema = z.object({
  paths: z.array(z.string()),
  contexts: z.string(),
  msalRedirectUrl: z.string(),
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
});

export type Context = z.infer<typeof contextSchema>;

export const configSchema = z.object({
  ENVIRONMENT: z.string(),
  CONTEXTS: z.array(contextSchema),
  LINKS: z.array(linkSchema),
  BANNER_TITLE_HREF: z.string(),
  AD_TENANT_AUTHORITY: z.string().optional(),
  AD_CLIENT_ID: z.string().optional(),
  AD_GATEWAY_SCOPE: z.string().optional(),
  GATEWAY_URL: z.string().optional(),
  APP_INSIGHTS_KEY: z.string().optional(),
  SURVEY_LINK: z.string().optional(),
  SHOW_MENU: z.boolean().optional(),
  SHOW_GOVUK_REBRAND: z.boolean().optional(),
  OS_HANDOVER_URL: z.string().optional(),
  COOKIE_HANDOVER_URL: z.string().optional(),
  TOKEN_HANDOVER_URL: z.string().optional(),
  FEATURE_FLAG_MENU_USERS: featureFlagUsersSchema.optional(),
  FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: z.boolean().optional(),
});

export type Config = z.infer<typeof configSchema>;
