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

  // Whether the Settings page shows the "Low contrast background" control and
  // the Edge dark-mode guidance that sits below it — everything on that page
  // concerned with softening a too-bright page.
  //
  // Deliberately NOT the same flag as `accessibility` above: that one means
  // "the Settings page exists at all" (it gates the footer link and the
  // background subscriber together), and the page is wanted — it is only this
  // part of it that is being held back. Read by SettingsApp; it does not gate
  // the paint, so a user who already chose a tone keeps it.
  accessibilityBackground: z.boolean().optional(),
  homePageNotification: z.boolean().optional(),
  tabTitleUrn: z.boolean().optional(),
  notifications: z.boolean().optional(),
  useFullPageMsalRedirect: z.boolean().optional(),
  caseLocking: z.boolean().optional(),

  // Case-locking takes two flags:
  //   caseLocking            register presence — exercises the hub and the API
  //   caseLockingCountSelf   count yourself as another user, so the banner can be
  //                          seen at all by one developer on a case alone
  //
  // THERE WAS A THIRD, caseLockingNotifications, which hid the banner and the
  // interruption while presence registered regardless. Dropped 2026-11-06: with
  // counting yourself off, a QA user alone on a case has nobody to be told about,
  // so it was a second switch doing the first one's job. An old cookie that still
  // carries it parses fine — z.object strips keys it does not know.
  //
  // THE INTERRUPTION HAD ITS OWN FLAG HERE and no longer needs one. It existed
  // while both surfaces fired on the same "someone else is on this case"
  // condition and the only way to see one was to switch off the other. The rule
  // is now the section itself — the case review and witness or victim records
  // interrupt, case-wide presence informs — so the way to see the interruption is
  // to go to a case review, not to flip a switch.
  caseLockingCountSelf: z.boolean().optional(),
  requestObservationShim: z.boolean().optional(),
  openInCmsModern: z.boolean().optional(),
});

export type Preview = z.infer<typeof PreviewSchema>;
