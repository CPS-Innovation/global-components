import { CCPApps } from "cps-global-presence";
import { CaseDetails } from "../data/CaseDetails";
import { Result } from "../../utils/Result";
import { makeConsole } from "../../logging/makeConsole";
import { formatJoined } from "./format-joined";

const { _debug } = makeConsole("getCaseLock");

/**
 * The CMS lock, reduced to what a banner needs.
 *
 * undefined means WE DO NOT KNOW — no case details yet, or the fetch failed —
 * which callers must not confuse with "not locked". Saying a case is unlocked
 * when we simply have not looked would be the one genuinely misleading thing
 * this could tell someone.
 */
export type CaseLock = {
  locked: boolean;
  /** "John Smith", or "" when the API named nobody. */
  by: string;
  /** Through CCPApps so the lock names an application the way the roster does. */
  application: string;
  /** ISO timestamp, for formatJoined. Absent if the server omits it. */
  since?: string;
};

export const getCaseLock = (caseDetails: Result<CaseDetails> | undefined): CaseLock | undefined => {
  if (!caseDetails?.found) {
    return undefined;
  }
  const { isLocked, locking } = caseDetails.result;

  // THE DOMINANT FLAG IS locking.locked, because it is the one that arrives with a
  // holder attached — a lock we can name is more useful than a bare boolean, and if
  // only one of the two can be right about who, it is that one. isLocked stands in
  // when the block is absent entirely.
  const locked = locking?.locked ?? isLocked ?? false;

  // Logged rather than resolved. We do not yet know whether these can legitimately
  // disagree; this is how we find out from real traffic instead of guessing.
  if (typeof isLocked === "boolean" && typeof locking?.locked === "boolean" && isLocked !== locking.locked) {
    _debug("isLocked and locking.locked disagree", { isLocked, lockingLocked: locking.locked });
  }

  return {
    locked,
    by: [locking?.byFirstNames, locking?.bySurname].filter(Boolean).join(" "),
    application: CCPApps.displayName(locking?.application ?? undefined),
    since: locking?.since ?? undefined,
  };
};

/**
 * The lock as one sentence: "John Smith is locking this case in RCMS, since 3.38pm".
 *
 * ONE SENTENCE, TWO SURFACES. The banner and the interruption both say this, and
 * they must say it identically — the interruption is the banner's more insistent
 * twin, and a reader who dismisses one and then reads the other should not have to
 * work out whether two differently-worded lines describe the same lock.
 *
 * Every clause after the name is dropped when the API did not send it, so an
 * incomplete record degrades to a shorter true sentence rather than one with a
 * gap in it. Returns "" when there is no lock, so callers can omit the line.
 */
export const describeCaseLock = (lock: CaseLock | undefined): string => {
  if (!lock?.locked) {
    return "";
  }
  const since = formatJoined(lock.since);
  return (
    (lock.by ? `${lock.by} is locking this case` : "Someone is locking this case") +
    (lock.application ? ` in ${lock.application}` : "") +
    (since ? `, since ${since}` : "") +
    "."
  );
};
