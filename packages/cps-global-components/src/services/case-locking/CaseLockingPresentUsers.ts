/** One section a person is in, and whether it is the one the reader is in too. */
export type CaseLockingPresentUserSection = { kind: string; isCurrent: boolean };

export type CaseLockingPresentUser = {
  user: string;
  appName: string;
  /**
   * The sections this person is in, as the API names their kinds — CASE,
   * CASE_REVIEW, VICTIM_WITNESS. Usually one; more when someone is in a section
   * and the case around it.
   *
   * Carried per person because a case-wide session merges every section of its
   * case into one roster, and without this the UI could only ever say "this case"
   * — which is true and useless. CCPSectionNames turns them into words.
   *
   * isCurrent marks the section the READER is looking at, so the UI can say "this
   * witness or victim" rather than "a witness or victim". The distinction only
   * exists for kinds that have a subject: a case-wide roster reports everyone
   * anywhere in the case, and "a witness or victim" there could be any of them.
   */
  sections?: CaseLockingPresentUserSection[];
  /** ISO timestamp from the API's member record. Absent if the server omits it. */
  joinedAt?: string;
};

/** Everyone present in one section, keyed by the region code we registered it as. */
export type CaseLockingPresentSection = {
  code: string;
  users: CaseLockingPresentUser[];
  /**
   * Was anyone already here when we arrived?
   *
   * Decided on the FIRST snapshot after we register the section and never
   * revisited. It is what separates the two devices: walking into a section
   * someone already occupies is an interruption, whereas someone joining a
   * section you are already in is news you can read at your own pace, so it gets
   * the pinned banner instead.
   *
   * The corollary is that two people on one case produce exactly one
   * interruption, shown to whoever arrived second — the first person is never
   * interrupted on a case they were already working on.
   */
  occupiedOnEntry: boolean;
};

/**
 * A LIST of sections, not one.
 *
 * This was previously `{ code, users }` — a single section — which could not
 * express the UI the design asks for (people grouped under "Witnesses",
 * "Defendants" and so on), and had a quieter problem too: with two sections live,
 * each publish overwrote the other, so whichever polled last won and the other
 * silently vanished.
 */
export type CaseLockingPresentUsers = { sections: CaseLockingPresentSection[] } | undefined;
