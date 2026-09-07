/**
 * The presence API's application vocabulary, and what to SHOW for each.
 *
 * DESTINED TO BE SHARED. The Classic and Modern clients render the same rosters
 * and need the same translation, so this table is the single place it is written
 * down — a code file rather than environment config precisely because it must be
 * one table for all three clients, not three copies that drift. When the shared
 * client code moves into packages/, this file moves with it; keep it free of
 * anything that would not survive that move (no imports, no TS-only syntax in the
 * data itself).
 *
 * WHY A TRANSLATION AT ALL. The API's names are the backend's own — see
 * _WATCHDOG_APP_NAMES in global-components.cms-auth-v2.ts, which rejects anything
 * outside them. Three of the five are the same product to the people using it:
 * Work Management, Case Review and Casework are all RCMS. CMS Classic and CMS
 * Modern are already the names users know, so they are deliberately absent and
 * fall through unchanged.
 */
export const APP_DISPLAY_NAMES: Record<string, string> = {
  "Work Management App": "RCMS",
  "Case Review App": "RCMS",
  "Casework App": "RCMS",
};

/**
 * FALLS BACK TO THE NAME AS SENT, deliberately. An application the API starts
 * reporting before this table knows about it shows the backend's own wording,
 * which is imperfect but true. Hiding it would lose the one piece of information
 * a user needs in order to go and find the person.
 *
 * Returns undefined when the API sends no application at all, so callers omit the
 * clause rather than printing an empty gap.
 */
export const appDisplayName = (appName: string | undefined): string | undefined => {
  if (!appName) {
    return undefined;
  }
  return APP_DISPLAY_NAMES[appName] ?? appName;
};
