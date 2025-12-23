import { z } from "zod";

export const StatePutResponseSchema = z.object({
  success: z.boolean(),
  path: z.string(),
  cleared: z.boolean().optional(),
});

export type StatePutResponse = z.infer<typeof StatePutResponseSchema>;
