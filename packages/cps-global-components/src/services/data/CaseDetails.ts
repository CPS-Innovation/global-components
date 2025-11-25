import { z } from "zod";

export const CaseDetailsSchema = z.object({
  caseId: z.number(),
  urn: z.string(),
  isDcfCase: z.boolean(),
});

export type CaseDetails = z.infer<typeof CaseDetailsSchema>;

export const caseDetailsSafeToCacheFields: (keyof CaseDetails)[] = ["urn", "isDcfCase"];

export const caseDetailsTagFields: (keyof CaseDetails)[] = ["urn", "isDcfCase"];
