import { z } from "zod";

export const CaseDetailsSchema = z.object({
  id: z.number(),
  urn: z.string(),
  isDcfCase: z.boolean(),
});

export type CaseDetails = z.infer<typeof CaseDetailsSchema>;

export const caseDetailsSafeToCacheFields: (keyof CaseDetails)[] = ["id", "urn", "isDcfCase"];

// caseId is always known in order to get case details so we do not need to put it back in.
export const caseDetailsTagFields: (keyof CaseDetails)[] = ["urn", "isDcfCase"];
