import { z } from "zod";

export const previewStateSchema = z.object({
  enabled: z.boolean().optional(),

  caseMarkers: z.boolean().optional(),
  caseSearch: z.boolean().optional(),
  myRecentCases: z.boolean().optional(),
  newHeader: z.boolean().optional(),
  accessibility: z.boolean().optional(),

  forceDcfHeader: z.boolean().optional(),
});

export type PreviewState = z.infer<typeof previewStateSchema>;
