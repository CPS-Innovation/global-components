export type CaseLockingPresentUser = {
  user: string;
  appName: string;
  /** ISO timestamp from the API's member record. Absent if the server omits it. */
  joinedAt?: string;
};

/** Everyone present in one section, keyed by the region code we registered it as. */
export type CaseLockingPresentSection = { code: string; users: CaseLockingPresentUser[] };

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
