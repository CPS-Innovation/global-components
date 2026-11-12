import { CCPApps, CCPContent, CCPNames } from "cps-global-presence";
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
  /** The two halves of `by`, for matching the holder to a person present (CCPNames.matches). */
  firstNames: string;
  surname: string;
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
    firstNames: locking?.byFirstNames ?? "",
    surname: locking?.bySurname ?? "",
    application: CCPApps.displayName(locking?.application ?? undefined),
    since: locking?.since ?? undefined,
  };
};

/**
 * The lock as a line of its own: "John Smith has this case locked in RCMS since
 * 3.38pm." The interruption says this; the banner says the same words through
 * CCPView, which also folds them into the holder's own line when they are present.
 * Both come from CCPContent so the two surfaces cannot drift apart.
 *
 * Returns "" when there is no lock, so callers can omit the line.
 */
export const describeCaseLock = (lock: CaseLock | undefined, viewerEmail?: string): string => {
  if (!lock?.locked) {
    return "";
  }
  return CCPContent.lockLine(lock.by, lock.application, formatJoined(lock.since), isLockedByReader(lock, viewerEmail));
};

/**
 * Does the reader hold this lock themselves — locked in Classic, say, and now
 * looking here? Then it is said as "You have this case locked", because their own
 * name reads as a colleague's. False when the reader is unknown or the names do
 * not clearly match (CCPNames.matches).
 */
export const isLockedByReader = (lock: CaseLock | undefined, viewerEmail: string | undefined): boolean =>
  !!lock?.locked && CCPNames.matches(viewerEmail, lock.firstNames, lock.surname);
