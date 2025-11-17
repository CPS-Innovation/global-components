import { z } from "zod";

const linkSchema = z.object({
  label: z.string(),
  href: z.string(),
  activeContexts: z.array(z.string()), // To array
  visibleContexts: z.array(z.string()), // To array
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

const contextBase = z.object({
  msalRedirectUrl: z.string().optional(), // OK
  domTagDefinitions: z.array(domTagDefinitionsSchema).optional(), // OK
  applyOutSystemsShim: z.boolean().optional(), // OK
  forceCmsAuthRefresh: z.boolean().optional(), // OK
  authorisation: authorisationSchema.optional(), // OK
  headerCustomCssClasses: z.string().optional(), // OK
  headerCustomCssStyles: z.record(z.string(), z.string().optional()).optional(), // OK
  showMenuOverride: z
    .union([z.literal("always-show-menu"), z.literal("never-show-menu")])
    .optional(), // OK
  cmsAuthFromStorageKey: z.string().optional(), // OK
});

const context = contextBase.extend({
  paths: z.array(z.string()),
});

const contextGroup = contextBase.extend({
  get contexts() {
    return z.record(z.string(), z.union([context, contextGroup]));
  },
});

export const configSchema2 = z.object({
  ENVIRONMENT: z.string(),
  CONTEXTS: z.record(z.string(), contextGroup),
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

export type Config2 = z.infer<typeof configSchema2>;
