import { z } from "zod";

export const CaseDetailsSchema = z.object({
  caseId: z.number(),
  urn: z.string(),
  isDcf: z.boolean(),
});

export type CaseDetails = z.infer<typeof CaseDetailsSchema>;

export const caseDetailsSafeToCacheFields = ["urn", "isDcf"] as (keyof CaseDetails)[];
