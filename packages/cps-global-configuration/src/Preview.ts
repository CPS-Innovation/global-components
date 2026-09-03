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

  // Case-locking is deliberately split three ways so the mechanism can run for
  // real in QA while staying invisible to real users:
  //   caseLocking            register presence — exercises the hub and the API
  //   caseLockingNotifications  show the banner when someone else is present
  //   caseLockingCountSelf   count yourself as another user, so the banner can be
  //                          seen at all by one developer on a case alone
  // Registration is the part we want load on; the banner is the part we do not
  // want a caseworker discovering mid-work.
  caseLockingNotifications: z.boolean().optional(),
  caseLockingCountSelf: z.boolean().optional(),
  // The interruption card (MoJ interruption-card), separate from the pinned
  // banner so either can be tried on its own while we work out which belongs
  // where. Both currently trigger on the same "someone else is on this case"
  // condition; the real rules (which section kinds interrupt, which merely
  // inform) come later.
  caseLockingInterstitial: z.boolean().optional(),
  requestObservationShim: z.boolean().optional(),

  // OutSystems region override (FCT2-20670). Absent means no override, i.e.
  // Dublin — the domain every config already hardcodes. "frontDoor" is
  // reserved for the eventual front-door domain; until we know it, selecting it
  // is disabled in the preview UI and it maps to no rewrite.
  region: z.union([z.literal("london"), z.literal("frontDoor")]).optional(),
});

export type Preview = z.infer<typeof PreviewSchema>;
