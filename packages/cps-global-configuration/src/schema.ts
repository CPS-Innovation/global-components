import { z } from "zod";

export type Link = {
  label: string;
  href: string;
  activeContexts: string;
  openInNewTab?: boolean;
  visibleContexts?: string;
  useEventNavigationContext?: string;
  level: number;
};

export type Context = {
  paths: string[];
  contexts: string;
};

const LinkSchema: z.ZodType<Link> = z.lazy(() =>
  z.object({
    label: z.string(),
    href: z.string(),
    activeContexts: z.string(),
    openInNewTab: z.boolean().optional(),
    visibleContexts: z.string().optional(),
    useEventNavigationContext: z.string().optional(),
    level: z.number(),
  })
);

const ContextSchema: z.ZodType<Context> = z.lazy(() =>
  z.object({
    paths: z.array(z.string()),
    contexts: z.string(),
  })
);

export const ConfigSchema = z.object({
  ENVIRONMENT: z.string(),
  APP_INSIGHTS_KEY: z.string().optional(),
  SURVEY_LINK: z.string(),
  SHOULD_SHOW_HEADER: z.boolean(),
  SHOULD_SHOW_MENU: z.boolean(),
  CONTEXTS: z.array(ContextSchema),
  LINKS: z.array(LinkSchema),
  _CONFIG_ERROR: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
