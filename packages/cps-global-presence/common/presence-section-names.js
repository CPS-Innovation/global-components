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
 * What to call a section when it is the very one the reader is looking at.
 *
 * Only the subject-scoped kinds appear here. "A witness or victim" and "this
 * witness or victim" are different pieces of news: the first says someone is
 * elsewhere in the case, the second says they are on the record open in front of
 * you. The case and the case review have no subject — there is only one of each per
 * case — so "the case" is already definite and needs no second form.
 */
CCPSectionNames.CURRENT_NAMES = {
  VICTIM_WITNESS: "this witness or victim",
  DEFENDANT: "this defendant"
};

/**
 * @param {string|undefined} kind
 * @param {boolean} [isCurrent] true when this is the section the reader is in
 * @returns {string}
 */
CCPSectionNames.displayName = function (kind, isCurrent) {
  if (!kind) {
    return "";
  }
  var key = String(kind).toUpperCase();
  if (isCurrent && CCPSectionNames.CURRENT_NAMES[key]) {
    return CCPSectionNames.CURRENT_NAMES[key];
  }
  var mapped = CCPSectionNames.DISPLAY_NAMES[key];
  return mapped || kind;
};

/**
 * A list of section names as a reader would say it: "the case review", or "this
 * witness or victim and the case", or "the case, the case review and a defendant".
 *
 * @param {Array<{kind: string, isCurrent?: boolean}>} sections
 * @returns {string}
 */
CCPSectionNames.describe = function (sections) {
  var names = [];
  var i, name;
  for (i = 0; i < sections.length; i++) {
    name = sections[i] ? CCPSectionNames.displayName(sections[i].kind, sections[i].isCurrent) : "";
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
