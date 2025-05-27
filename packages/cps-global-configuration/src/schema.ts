import { z } from "zod";

export const LinkSchema: z.ZodType<Link> = z.lazy(() =>
  z.object({
    ID: z.string(),
    LABEL: z.string(),
    HREF: z.string(),
    ACTIVE_WHEN: z.array(z.string()),
    LINKS: z.array(LinkSchema).optional(),
  })
);

export const ConfigSchema = z.object({
  ENVIRONMENT: z.string(),
  APP_INSIGHTS_KEY: z.string().optional(),
  SURVEY_LINK: z.string(),
  SHOULD_SHOW_HEADER: z.boolean(),
  SHOULD_SHOW_MENU: z.boolean(),
  LINKS: z.array(LinkSchema),
});

export type Link = {
  ID: string;
  LABEL: string;
  HREF: string;
  ACTIVE_WHEN: string[];
  LINKS?: Link[];
};

export type Config = z.infer<typeof ConfigSchema>;
