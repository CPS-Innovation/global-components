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

const LinkSchema: z.ZodType<Link> = z.lazy(() =>
  z.object({
    label: z.string(),
    href: z.string(),
    activeContexts: z.string(),
    openInNewTab: z.boolean().optional(),
    visibleContexts: z.string(),
    preferEventNavigationContexts: z.string().optional(),
    level: z.number(),
  })
);

export type DomTags = {
  cssSelector: string;
  regex: string;
};

const DomTagsSchema: z.ZodType<DomTags> = z.lazy(() =>
  z.object({
    cssSelector: z.string(),
    regex: z.string(),
  })
);

export type Context = {
  paths: string[];
  contexts: string;
  msalRedirectUrl: string;
  domTags?: DomTags[];
  applyOutSystemsShim?: boolean | "hide-existing" | "insert-new";
  forceCmsAuthRefresh?: boolean;
};

const ContextSchema: z.ZodType<Context> = z.lazy(() =>
  z.object({
    paths: z.array(z.string()),
    contexts: z.string(),
    msalRedirectUrl: z.string(),
    domTags: z.array(DomTagsSchema).optional(),
    applyOutSystemsShim: z
      .union([z.boolean(), z.literal("hide-existing"), z.literal("insert-new")])
      .optional(),
    forceCmsAuthRefresh: z.boolean().optional(),
  })
);

export const ConfigSchema = z.object({
  ENVIRONMENT: z.string(),
  CONTEXTS: z.array(ContextSchema),
  LINKS: z.array(LinkSchema),
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

export type Config = z.infer<typeof ConfigSchema>;
