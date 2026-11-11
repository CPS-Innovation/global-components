import { CCPMember } from "cps-global-presence";

/**
 * Everyone present in one section we hold, keyed by the region code we registered
 * it as.
 *
 * `members` is the roster as the API reports it: one record per person, per
 * section, per application, THE READER INCLUDED, each record's sections marked
 * isCurrent when they are the one this region registered. Who to leave out, and
 * how to collapse records into people, is CCPView's job — the same as in the two
 * legacy clients — so the caseLockingCountSelf preview flag is applied where the
 * roster is drawn, not here.
 */
export type CaseLockingPresentSection = {
  code: string;
  members: CCPMember[];
  /**
   * Was anyone else already in this section when we arrived?
   *
   * Decided on the FIRST snapshot of our own section and never revisited. It is
   * what separates the two devices: walking into a section someone already
   * occupies is an interruption, whereas someone joining a section you are already
   * in is news you can read at your own pace, so it gets the pinned banner instead.
   *
   * The corollary is that two people on one case produce exactly one interruption,
   * shown to whoever arrived second.
   */
  occupiedOnEntry: boolean;
};

/** Every section we hold that has anyone in it; undefined when none has. */
export type CaseLockingPresentUsers = { sections: CaseLockingPresentSection[] } | undefined;
