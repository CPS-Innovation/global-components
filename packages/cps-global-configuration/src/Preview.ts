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
  //   caseLockingNotifications  show what presence found: the pinned banner, and
  //                          the interruption card in the sections that warrant one
  //   caseLockingCountSelf   count yourself as another user, so the banner can be
  //                          seen at all by one developer on a case alone
  // Registration is the part we want load on; the visible part is what we do not
  // want a caseworker discovering mid-work.
  //
  // THE INTERRUPTION HAD ITS OWN FLAG HERE and no longer needs one. It existed
  // while both surfaces fired on the same "someone else is on this case"
  // condition and the only way to see one was to switch off the other. The rule
  // is now the section itself — the case review and witness or victim records
  // interrupt, case-wide presence informs — so the way to see the interruption is
  // to go to a case review, not to flip a switch.
  caseLockingNotifications: z.boolean().optional(),
  caseLockingCountSelf: z.boolean().optional(),
  requestObservationShim: z.boolean().optional(),

  // OutSystems region override (FCT2-20670). Absent means no override, i.e.
  // Dublin — the domain every config already hardcodes. "frontDoor" is
  // reserved for the eventual front-door domain; until we know it, selecting it
  // is disabled in the preview UI and it maps to no rewrite.
  region: z.union([z.literal("london"), z.literal("frontDoor")]).optional(),
});

export type Preview = z.infer<typeof PreviewSchema>;
