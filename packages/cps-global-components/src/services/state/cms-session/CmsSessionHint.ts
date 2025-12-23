import { z } from "zod";

export const CmsSessionHintSchema = z.object({
  cmsDomains: z.array(z.string()),
  isProxySession: z.boolean(),
  handoverEndpoint: z.string().nullable(),
});

export type CmsSessionHint = z.infer<typeof CmsSessionHintSchema>;
