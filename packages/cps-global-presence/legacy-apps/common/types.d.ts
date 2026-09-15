/* common/types.d.ts — shapes the presence API puts on the wire.
 *
 * Hand-written because they describe the SERVER's contract, not our code: there
 * is nothing in common/*.js for tsc to infer them from. Everything else in
 * types/ is generated — see tsconfig.json.
 *
 * Identical over both transports: JSONP `poll` for the legacy clients and
 * SignalR `ReceiveNotification` for the current apps return the same shape.
 */

/** Which part of a case a session is registered against. */
interface CCPSection {
  caseId?: string | number;
  /** "CASE" | "CASE_REVIEW" | "VICTIM_WITNESS" | "DEFENDANT" */
  kind?: string;
  /** Present only for subject-scoped kinds, e.g. a person id. */
  subjectId?: string | number | null;
}

/** One person present in a section. */
interface CCPMember {
  userEmail?: string;
  /** The app they are in: "CMS Classic" | "CMS Modern" | "Work Management App" | ... */
  sourceApplication?: string;
  joinedAt?: string;
}

/** A section's membership at a point in time. Versions order the deltas. */
interface CCPSnapshot {
  section?: CCPSection;
  version?: number | string;
  members?: CCPMember[];
}

/** What poll returns: notifications, each carrying snapshots. */
interface CCPNotification {
  payload?: { snapshots?: CCPSnapshot[] };
}

/** One person, deduped across sections. */
interface CCPPerson {
  userEmail: string;
  /** e.g. ["CASE_REVIEW", "VICTIM_WITNESS:98765"] */
  regions: string[];
  /** distinct sourceApplication values seen for them */
  apps: string[];
}
