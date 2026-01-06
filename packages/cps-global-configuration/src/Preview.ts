import { z } from "zod";

export const PreviewSchema = z.object({
  enabled: z.boolean().optional(),

  caseMarkers: z.boolean().optional(),
  caseSearch: z.boolean().optional(),
  myRecentCases: z.boolean().optional(),
  myRecentCasesOnHome: z.boolean().optional(),
  myRecentCasesOnCases: z.boolean().optional(),
  myRecentCasesOnHeader: z.boolean().optional(),
  newHeader: z.boolean().optional(),
  footer: z.boolean().optional(),
  accessibility: z.boolean().optional(),
  forceDcfHeader: z.boolean().optional(),
});

export type Preview = z.infer<typeof PreviewSchema>;
