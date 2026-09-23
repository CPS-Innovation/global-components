/* common/presence-apps.js — what to SHOW for the API's application names.
 * SHARED, MODE 5 FLOOR.
 *
 * The presence API reports sourceApplication from a fixed vocabulary of its own —
 * see _WATCHDOG_APP_NAMES in global-components.cms-auth-v2.ts, which rejects
 * anything outside it. Some of those names draw distinctions users do not: Work
 * Management, Case Review and Casework are all RCMS to the people using them, so
 * they are mapped.
 *
 * ONLY THE NAMES THAT NEED CHANGING ARE LISTED. CMS Classic and CMS Modern are
 * different applications in the user's lexicon and are already called what users
 * call them, so they are absent — and their absence is the point: an entry here
 * means "this name is wrong for a user", and everything else passes through. A
 * table listing every name, including ones mapped to themselves, would suggest a
 * mapping is required before an application can be reported at all.
 *
 * THIS IS WHY THE CLIENT CODE IS SHARED. Classic, Modern/DCF and the web
 * components all render the same rosters, so this table has to be one table. Held
 * to the mode 5 floor like the rest of common/: no const, no arrow functions, no
 * Object.assign — see check-syntax.js, which proves it.
 */

var CCPApps = {};

CCPApps.DISPLAY_NAMES = {
  "Work Management App": "RCMS",
  "Case Review App": "RCMS",
  "Casework App": "RCMS"
};

/**
 * FALLS BACK TO THE NAME AS SENT, deliberately. An application the API starts
 * reporting before this table knows about it shows the backend's own wording,
 * which is imperfect but true. Hiding it would lose the one thing a user needs in
 * order to go and find the person.
 *
 * Returns "" when there is no application at all, so callers can omit the clause
 * rather than printing an empty gap.
 *
 * @param {string|undefined} appName
 * @returns {string}
 */
CCPApps.displayName = function (appName) {
  if (!appName) {
    return "";
  }
  var mapped = CCPApps.DISPLAY_NAMES[appName];
  return mapped || appName;
};
