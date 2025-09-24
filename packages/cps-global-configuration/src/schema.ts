import { z } from "zod";

export type Link = {
  label: string;
  href: string;
  activeContexts: string;
  openInNewTab?: boolean;
  visibleContexts: string;
  preferEventNavigationContexts?: string;
  level: number;
};

const linkSchema: z.ZodType<Link> = z.object({
  label: z.string(),
  href: z.string(),
  activeContexts: z.string(),
  openInNewTab: z.boolean().optional(),
  visibleContexts: z.string(),
  preferEventNavigationContexts: z.string().optional(),
  level: z.number(),
});

export type DomTags = {
  cssSelector: string;
  regex: string;
};

const domTagsSchema: z.ZodType<DomTags> = z.object({
  cssSelector: z.string(),
  regex: z.string(),
});

export type Authorisation = {
  adGroup: string;
  unAuthedRedirectUrl: string;
};

const authorisationSchema: z.ZodType<Authorisation> = z.object({
  adGroup: z.string(),
  unAuthedRedirectUrl: z.string(),
});

export type Context = {
  paths: string[];
  contexts: string;
  msalRedirectUrl: string;
  domTags?: DomTags[];
  applyOutSystemsShim?: boolean | "hide-existing" | "insert-new";
  forceCmsAuthRefresh?: boolean;
  authorisation?: Authorisation;
};

const contextSchema: z.ZodType<Context> = z.object({
  paths: z.array(z.string()),
  contexts: z.string(),
  msalRedirectUrl: z.string(),
  domTags: z.array(domTagsSchema).optional(),
  applyOutSystemsShim: z
    .union([z.boolean(), z.literal("hide-existing"), z.literal("insert-new")])
    .optional(),
  forceCmsAuthRefresh: z.boolean().optional(),
  authorisation: authorisationSchema.optional(),
});

export const configSchema = z.object({
  ENVIRONMENT: z.string(),
  CONTEXTS: z.array(contextSchema),
  LINKS: z.array(linkSchema),
  AD_TENANT_AUTHORITY: z.string().optional(),
  AD_CLIENT_ID: z.string().optional(),
  APP_INSIGHTS_KEY: z.string().optional(),
  SURVEY_LINK: z.string().optional(),
  SHOW_MENU: z.boolean().optional(),
  SHOW_GOVUK_REBRAND: z.boolean().optional(),
  OS_HANDOVER_URL: z.string().optional(),
  COOKIE_HANDOVER_URL: z.string().optional(),
  TOKEN_HANDOVER_URL: z.string().optional(),
  FEATURE_FLAG_ENABLE_MENU_GROUP: z.string().optional(),
  FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: z.boolean().optional(),
});

export type Config = z.infer<typeof configSchema>;
