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

  export const CCPPeople: {
    /** Collapse denormalised member records to one row per person. */
    collapse(members: CCPMember[] | undefined): CCPPerson[];
  };
}
