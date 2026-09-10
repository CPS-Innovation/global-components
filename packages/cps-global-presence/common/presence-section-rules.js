/* common/presence-section-rules.js — how presence in a section should be
 * SURFACED. SHARED, MODE 5 FLOOR.
 *
 * Beside the display names for the same reason they are beside the application
 * names: these are the facts about a section kind that every client would
 * otherwise have to know separately. What a section is CALLED lives in
 * presence-section-names.js; how loudly it is announced lives here.
 *
 * WHAT COUNTS AS A CLASH. Presence on the case as a whole is not one. Two people
 * can read the same case at once all day and nothing is lost; interrupting them
 * for it teaches people to dismiss the interruption without reading it, and then
 * it is worth nothing on the day it matters. A clash is two people in the same
 * EDITABLE section — the case review, or one witness or victim record — where one
 * set of changes really can overwrite the other. Everywhere else a passive
 * notification says the same thing without taking the page away.
 *
 * ONLY THE WEB COMPONENTS READ THIS TODAY. The Classic and Modern clients show a
 * roster and interrupt nobody, so build.sh leaves this file out of their bundles
 * rather than shipping dead weight into an IE-mode tab. It lives here anyway
 * because the rule is not the web components' to own — the day a legacy client
 * grows an interruption, it must agree with this table rather than invent a
 * second one.
 */

var CCPSectionRules = {};

/**
 * The kinds worth interrupting for.
 *
 * AN ALLOWLIST, NOT A DENYLIST, and this is the one place in common/ where an
 * unknown value does NOT fall through to something usable. CCPApps and
 * CCPSectionNames show the wire name when they have no mapping, because a name
 * we did not plan for is ugly but harmless. Here the equivalent fallback would
 * hand the most invasive UI we have to a section nobody had decided was
 * clash-worthy, on the day it is first enrolled. So an absent entry means quiet,
 * and enabling an interruption is always a deliberate edit to this table.
 */
CCPSectionRules.INTERRUPTS = {
  CASE_REVIEW: true,
  VICTIM_WITNESS: true
};

/**
 * Does presence in this section warrant taking the page away?
 *
 * Takes either the wire kind (VICTIM_WITNESS) or the region code config writes
 * (victim_witness) — they are the same string in different cases, so this
 * normalises rather than making callers care which they hold.
 *
 * @param {string|undefined} kind
 * @returns {boolean}
 */
CCPSectionRules.interrupts = function (kind) {
  if (!kind) {
    return false;
  }
  var key = String(kind).toUpperCase();
  // hasOwnProperty, not a bare lookup: INTERRUPTS is a plain object, so a kind
  // called CONSTRUCTOR or TOSTRING would otherwise find a function on the
  // prototype and read as truthy. Unlikely, but the failure is an unwanted
  // interruption that no table entry explains.
  if (!CCPSectionRules.INTERRUPTS.hasOwnProperty(key)) {
    return false;
  }
  return !!CCPSectionRules.INTERRUPTS[key];
};
