import { z } from "zod";

/**
 * WHO IS HOLDING THE CMS LOCK, as the case summary reports it.
 *
 * Distinct from presence, and a stronger fact. Presence says someone is reading
 * the case; the lock says writes will fail. It is taken when a user opens the
 * Classic case screen and released when they leave it — so it is not a save-time
 * lock, and a browser closed without leaving keeps it.
 *
 * EVERY FIELD IS OPTIONAL AND NULLABLE, deliberately. The swagger shows them flat,
 * but we have never seen what the API sends for an UNLOCKED case, because Zod has
 * been stripping the whole block. A shape we did not predict must not fail
 * validation and take the entire case-details fetch — urn, defendant, tags — down
 * with it over a field that only decorates a banner.
 */
export const CaseLockingSchema = z.object({
  application: z.string().nullable().optional(),
  bySurname: z.string().nullable().optional(),
  byFirstNames: z.string().nullable().optional(),
  locked: z.boolean().nullable().optional(),
  since: z.string().nullable().optional(),
});

export type CaseLocking = z.infer<typeof CaseLockingSchema>;

export const CaseDetailsSchema = z.object({
  id: z.number(),
  /**
   * BOTH LOCK FLAGS ARE CARRIED, on purpose and for now. The API reports a
   * top-level isLocked as well as locking.locked and we do not yet know whether
   * they can disagree — so both come in, getCaseLock picks a dominant one, and it
   * says so when they differ. Drop the loser once real payloads have settled it.
   */
  isLocked: z.boolean().nullable().optional(),
  locking: CaseLockingSchema.nullable().optional(),
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
