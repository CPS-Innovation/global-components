import { z } from "zod";

export const CaseDetailsSchema = z.object({
  id: z.number(),
  urn: z.string(),
  isDcfCase: z.boolean(),
});

export type CaseDetails = z.infer<typeof CaseDetailsSchema>;

const caseDetailsKeySchema = CaseDetailsSchema.keyof();
type CaseDetailsKey = z.infer<typeof caseDetailsKeySchema>;

export const caseDetailsSafeToCacheFields: CaseDetailsKey[] = ["id", "urn", "isDcfCase"];

// caseId is always known in order to get case details so we do not need to put it back in.
export const caseDetailsTagFields: CaseDetailsKey[] = ["urn", "isDcfCase"];

export const isDcfCaseKey: CaseDetailsKey = "isDcfCase";
