import { z } from "zod";

export type Link = {
  label: string;
  href: string;
  activeContexts: string;
  openInNewTab?: boolean;
  visibleContexts?: string;
  preferEventNavigationContexts?: string;
  level: number;
};

const LinkSchema: z.ZodType<Link> = z.lazy(() =>
  z.object({
    label: z.string(),
    href: z.string(),
    activeContexts: z.string(),
    openInNewTab: z.boolean().optional(),
    visibleContexts: z.string().optional(),
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
};

const ContextSchema: z.ZodType<Context> = z.lazy(() =>
  z.object({
    paths: z.array(z.string()),
    contexts: z.string(),
    msalRedirectUrl: z.string(),
    domTags: z.array(DomTagsSchema).optional(),
  })
);

export const ConfigSchema = z.object({
  ENVIRONMENT: z.string(),
  AD_TENANT_AUTHORITY: z.string().optional(),
  AD_CLIENT_ID: z.string().optional(),
  APP_INSIGHTS_KEY: z.string().optional(),
  SURVEY_LINK: z.string().optional(),
  SHOW_BANNER: z.boolean().optional(),
  SHOW_MENU: z.boolean().optional(),
  SHOW_GOVUK_REBRAND: z.boolean().optional(),
  CONTEXTS: z.array(ContextSchema).optional(),
  LINKS: z.array(LinkSchema).optional(),
  OS_HANDOVER_URL: z.string().optional(),
  COOKIE_HANDOVER_URL: z.string().optional(),
  TOKEN_HANDOVER_URL: z.string().optional(),
  _CONFIG_ERROR: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
