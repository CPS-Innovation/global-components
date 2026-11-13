/* core/wire.d.ts — shapes the presence API puts on the wire.
 *
 * Hand-written because they describe the SERVER's contract, not our code: there
 * is nothing in core/*.js for tsc to infer them from. Everything else in
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

/* Not wire shapes, but published with them: what core/ hands its callers. */

/** A member record with the sections it puts the user in (CCPRoster.members). */
interface CCPRosterMember extends CCPMember {
  sections?: { kind: string; isCurrent?: boolean }[];
}

/** One person, collapsed across sections and applications (CCPPeople.collapse). */
interface CCPPerson {
  username: string;
  /** Is this the reader? Only when the caller said who the reader is. */
  isCurrentUser: boolean;
  apps: { appDisplayName: string; timeEntered: string | undefined }[];
  sections: { kind: string; isCurrent: boolean }[];
}
