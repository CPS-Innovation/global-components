import { z } from "zod";

export const LinkSchema: z.ZodType<Link> = z.lazy(() =>
  z.object({
    id: z.string(),
    label: z.string(),
    href: z.string(),
    activeWhen: z.array(z.string()),
    links: z.array(LinkSchema).optional(),
  })
);

export const ConfigSchema = z.object({
  environment: z.string(),
  appInsightsKey: z.string().optional(),
  surveyLink: z.string(),
  showHeader: z.boolean().optional(),
  showMenu: z.boolean().optional(),
  links: z.array(LinkSchema),
});

export type Link = {
  id: string;
  label: string;
  href: string;
  activeWhen: string[];
  links?: Link[];
};

export type Config = z.infer<typeof ConfigSchema>;
