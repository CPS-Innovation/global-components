import { z } from "zod";

export const RecentCaseSchema = z.object({
  caseId: z.number(),
  urn: z.string(),
  description: z.string(),
});

export type RecentCase = z.infer<typeof RecentCaseSchema>;

export const RecentCasesSchema = z.array(RecentCaseSchema);

export type RecentCases = z.infer<typeof RecentCasesSchema>;
