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
  };

  /** A person, once, with the applications they are in. */
  export type CCPPerson = {
    username: string;
    apps: { appDisplayName: string; timeEntered: string | undefined }[];
  };

  export const CCPPeople: {
    /** Collapse denormalised member records to one row per person. */
    collapse(members: CCPMember[] | undefined): CCPPerson[];
  };
}
