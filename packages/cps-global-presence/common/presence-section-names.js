/* common/presence-section-names.js — what to CALL a section. SHARED, MODE 5 FLOOR.
 *
 * The API's section kinds are wire identifiers: CASE, CASE_REVIEW, VICTIM_WITNESS,
 * DEFENDANT. A reader being told where someone is needs words, and the same words
 * whichever client is telling them — so the table lives here, beside CCPApps, for
 * the same reason.
 *
 * PHRASED TO SIT IN A SENTENCE, not as headings: the callers say things like
 * "also in the case review", so the values read as places rather than labels.
 *
 * Unmapped kinds fall through to the kind itself. That is deliberate and the same
 * bargain CCPApps makes: a section the API starts reporting before this table knows
 * about it shows its wire name, which is ugly but true, rather than vanishing.
 */

var CCPSectionNames = {};

CCPSectionNames.DISPLAY_NAMES = {
  CASE: "the case",
  CASE_REVIEW: "the case review",
  VICTIM_WITNESS: "a witness or victim",
  DEFENDANT: "a defendant"
};

/**
 * @param {string|undefined} kind
 * @returns {string}
 */
CCPSectionNames.displayName = function (kind) {
  if (!kind) {
    return "";
  }
  var mapped = CCPSectionNames.DISPLAY_NAMES[String(kind).toUpperCase()];
  return mapped || kind;
};

/**
 * A list of section names as a reader would say it: "the case review", or "the case
 * review and a defendant", or "the case, the case review and a defendant".
 *
 * @param {string[]} kinds
 * @returns {string}
 */
CCPSectionNames.describe = function (kinds) {
  var names = [];
  var i, name;
  for (i = 0; i < kinds.length; i++) {
    name = CCPSectionNames.displayName(kinds[i]);
    if (name && CCPSectionNames.indexOf(names, name) === -1) {
      names.push(name);
    }
  }
  if (names.length === 0) {
    return "";
  }
  if (names.length === 1) {
    return names[0];
  }
  return names.slice(0, names.length - 1).join(", ") + " and " + names[names.length - 1];
};

// Array.prototype.indexOf does not exist at document mode 5.
CCPSectionNames.indexOf = function (list, value) {
  var i;
  for (i = 0; i < list.length; i++) {
    if (list[i] === value) {
      return i;
    }
  }
  return -1;
};
