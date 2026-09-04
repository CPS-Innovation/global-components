export type CaseLockingPresentUser = {
  user: string;
  appName: string;
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
