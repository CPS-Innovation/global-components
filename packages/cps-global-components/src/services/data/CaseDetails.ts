import { z } from "zod";

export const CaseDetailsSchema = z.object({
  id: z.number(),
  urn: z.string().nullable(),
  isDcfCase: z
    .boolean()
    .nullable()
    .transform(val => val ?? false),
  leadDefendantFirstNames: z.string().nullable(),
  leadDefendantSurname: z.string().nullable(),
  leadDefendantType: z.string(),
  numberOfDefendants: z
    .number()
    .nullable()
    .transform(val => val ?? 0),
});

export type CaseDetails = z.infer<typeof CaseDetailsSchema>;

const caseDetailsKeySchema = CaseDetailsSchema.keyof();
type CaseDetailsKey = z.infer<typeof caseDetailsKeySchema>;

// caseId is always known in order to get case details so we do not need to put it back in.
export const caseDetailsTagFields: CaseDetailsKey[] = ["urn", "isDcfCase"];

export const isDcfCaseKey: CaseDetailsKey = "isDcfCase";
