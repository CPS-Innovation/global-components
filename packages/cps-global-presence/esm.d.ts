/**
 * The module surface of dist/esm/index.js, which build.sh generates.
 *
 * Hand-written and deliberately small. The generated types/ describe core/ as
 * GLOBALS (that is how the legacy bundles consume it); this describes the same
 * code as an ES module, which is how the web components consume it. Keep the two
 * exports here in step with bundles.esm.exports in bundles.json — the list is short precisely
 * so that staying in step is easy.
 */
declare module "cps-global-presence" {
  /**
   * The CMS instance whose presence we join. CIN2/CIN3/CIN5 share one Watchdog and
   * isolate by suffixing every section kind, so we must use the same suffix as the
   * Classic client or be invisible to it. Wire-only: on when registering, off when
   * a kind is read back.
   *
   * DISCOVERED, not configured: each client learns the environment at runtime and
   * adopt()s it before registering anything. Ours comes from the session hint we
   * already fetch at boot (see initialise-case-locking); the two legacy CMS
   * clients ask the proxy's whoami op for it.
   */
  export const CCPEnvironment: {
    /**
     * The suffix in force. null means NOT YET KNOWN; "" means known, and that this
     * environment takes none. The difference matters: naming a section while the
     * answer is still missing joins a room nobody is in, which looks exactly like
     * working presence on a quiet case. Assign directly only in tests.
     */
    CIN: string | null;
    /** Whether anyone has said which environment this is. */
    known(): boolean;
    /**
     * Take a cmsEnv label as the answer, mapping it through suffixFor. Set-once: a
     * later label meaning the same suffix is accepted, a different one is REFUSED
     * (false) because the roster is already keyed under the first.
     *
     * Known-ness is the CALLER's assertion, so adopt("") means "known, no suffix" —
     * a source's own unknown-empty must be filtered out before it gets here.
     */
    adopt(label: string | null | undefined): boolean;
    /** The mapping all three clients share: "CIN3" -> "CIN3", "CMS" -> "", else "". */
    suffixFor(label: string | null | undefined): string;
    /** "cin3.cps.gov.uk" -> "CIN3". For clients holding the session hint itself. */
    labelFor(domain: string | null | undefined): string;
    /** "CASE" -> "CASE_CIN3". Never doubles an existing suffix. */
    suffixKind(kind: string | undefined): string;
    /** "CASE_CIN3" -> "CASE". Strips only our own instance's suffix. */
    baseKind(kind: string | undefined): string;
  };

  export const CCPApps: {
    DISPLAY_NAMES: Record<string, string>;
    /** The name to show for an API application name; the name itself if unmapped, "" if absent. */
    displayName(appName: string | undefined): string;
  };

  /**
   * When someone arrived, as a reader would say it: "3.38pm", "3.38pm yesterday",
   * "3.38pm on 21 September 2026". "" when there is nothing usable, so callers can
   * drop the clause rather than print a fallback.
   */
  export const CCPJoined: {
    /** An ISO-8601 timestamp as a Date, or null. Parsed by hand — mode 5 cannot Date.parse one. */
    parse(iso: string | undefined): Date | null;
    format(iso: string | undefined, now?: Date): string;
  };

  /** One member record as the API sends it — one per user, per section, per app. */
  export type CCPMember = {
    userEmail?: string;
    sourceApplication?: string;
    joinedAt?: string;
    /** The sections this record puts the user in. */
    sections?: CCPSection[];
  };

  /**
   * One section a person is in. isCurrent marks the section the READER is in too,
   * which is what lets a UI say "this witness or victim" instead of "a witness or
   * victim" — the definite article is only honest when the subjects match.
   */
  export type CCPSection = { kind: string; isCurrent?: boolean };

  /** A person, once, with the applications they are in. */
  export type CCPPerson = {
    username: string;
    /**
     * Is this the reader? True only when collapse was told who they are. Marked
     * rather than filtered while the feature is being built — a roster that
     * includes you and says so is the evidence that identification works.
     */
    isCurrentUser: boolean;
    apps: { appDisplayName: string; timeEntered: string | undefined }[];
    /** Every section of the case this person is in, unioned across their records. */
    sections: { kind: string; isCurrent: boolean }[];
  };

  export const CCPSectionNames: {
    DISPLAY_NAMES: Record<string, string>;
    /** The definite forms, for the section the reader is in: "this defendant". */
    CURRENT_NAMES: Record<string, string>;
    /** What to call one section kind; the kind itself if unmapped, "" if absent. */
    displayName(kind: string | undefined, isCurrent?: boolean): string;
    /** Several, as a reader would say them: "the case review and a defendant". */
    describe(sections: CCPSection[]): string;
  };

  /**
   * How presence in a section should be surfaced, as opposed to what it is
   * called. Web components only — the legacy clients interrupt nobody, so
   * build.sh keeps this out of their bundles.
   */
  export const CCPSectionRules: {
    /** The kinds worth interrupting for. An allowlist: absent means quiet. */
    INTERRUPTS: Record<string, boolean>;
    /** Takes a wire kind (VICTIM_WITNESS) or a config region code (victim_witness). */
    interrupts(kind: string | undefined): boolean;
  };

  export const CCPPeople: {
    /**
     * Collapse denormalised member records to one row per person. viewerEmail, when
     * given, marks the reader's own row as isCurrentUser (compared case-insensitively).
     */
    collapse(members: CCPMember[] | undefined, viewerEmail?: string): CCPPerson[];
    /** The name to show, with "(current user)" appended for the reader. */
    displayName(person: { username?: string; isCurrentUser?: boolean } | undefined): string;
    /** The suffix displayName appends. */
    CURRENT_USER_SUFFIX: string;
    /**
     * Everyone but the reader. An empty or absent viewerEmail filters NOBODY —
     * showing one person too many beats hiding every colleague when the identity
     * is not known yet.
     */
    others<T extends { userEmail?: string }>(members: T[] | undefined, viewerEmail: string | undefined): T[];
  };

  /**
   * EVERY SENTENCE PRESENCE SHOWS, for all three UIs. The web component's wording,
   * which Modern had been tracking by hand and Classic had never matched at all.
   * Assembles words from pieces the caller derived; it reads no data of its own.
   */
  export const CCPContent: {
    /** What the banner says as it goes away. Only the web component announces it. */
    ALL_CLEAR: string;
    /** The collapsed/expanded toggle all three surfaces carry. */
    DETAILS_SHOW: string;
    DETAILS_HIDE: string;
    detailsToggle(expanded: boolean): string;
    /** Locked, with nobody to report. */
    LOCKED_ONLY: string;
    /**
     * The one line before anything is opened. "other" is dropped when the count
     * includes the reader; the lock, when known, leads and presence follows as a
     * subordinate clause. The legacy clients never pass `locked` — neither can know.
     */
    summary(people: number, includesSelf: boolean, locked?: boolean): string;
    /**
     * One application: "RCMS since 3.38pm on 8 September 2026", or just the
     * application when there is no time to give.
     *
     * `since` IS WIDE ON PURPOSE. The two real formatters express "nothing usable"
     * differently — CCPJoined.format returns "", and the web components'
     * formatJoined maps that to undefined — and this treats either the same way, so
     * neither caller needs a conversion at the call site to satisfy the other.
     */
    appClause(appDisplayName: string, since: string | undefined): string;
    /** Every application one person is in, as one clause. */
    where(
      apps: { appDisplayName: string; timeEntered?: string }[] | undefined,
      format: (timeEntered: string | undefined) => string | undefined,
    ): string;
    /** One person as a sentence: "A Name is in the case review — RCMS since ...". */
    personLine(name: string, sections: string, where: string): string;
  };
}
