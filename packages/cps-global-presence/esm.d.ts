/**
 * The module surface of dist/esm/index.js, which build.sh generates.
 *
 * Hand-written and deliberately small. The generated types/ describe common/ as
 * GLOBALS (that is how the legacy bundles consume it); this describes the same
 * code as an ES module, which is how the web components consume it. Keep the two
 * exports here in step with ESM_EXPORTS in build.sh — the list is short precisely
 * so that staying in step is easy.
 */
declare module "cps-global-presence" {
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
    /** Collapse denormalised member records to one row per person. */
    collapse(members: CCPMember[] | undefined): CCPPerson[];
  };
}
