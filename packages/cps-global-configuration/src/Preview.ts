import { z } from "zod";

export const PreviewSchema = z.object({
  enabled: z.boolean().optional(),

  // Backwards compatibility: migrate boolean true to "a"
  caseMarkers: z.preprocess(
    (val) => (val === true ? "a" : val),
    z.union([z.literal("a"), z.literal("b"), z.literal("off")]).optional(),
  ),
  caseSearch: z.boolean().optional(),
  myRecentCasesOnHeader: z.boolean().optional(),

  // Backwards compatibility: migrate boolean true to "gds"
  newHeader: z.preprocess(
    (val) => (val === true ? "gds" : val),
    z.union([z.literal("gds"), z.literal("cps")]).optional(),
  ),
  footer: z.boolean().optional(),
  accessibility: z.boolean().optional(),
  homePageNotification: z.boolean().optional(),
  tabTitleUrn: z.boolean().optional(),
  notifications: z.boolean().optional(),
  useFullPageMsalRedirect: z.boolean().optional(),
  caseLocking: z.boolean().optional(),
  requestObservationShim: z.boolean().optional(),

  // OutSystems region override (FCT2-20670). Absent means no override, i.e.
  // Dublin — the domain every config already hardcodes. "frontDoor" is
  // reserved for the eventual front-door domain; until we know it, selecting it
  // is disabled in the preview UI and it maps to no rewrite.
  region: z.union([z.literal("london"), z.literal("frontDoor")]).optional(),
});

export type Preview = z.infer<typeof PreviewSchema>;
