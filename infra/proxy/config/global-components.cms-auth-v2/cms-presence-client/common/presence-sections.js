/* common/presence-sections.js — section identity. SHARED, DOCUMENT MODE 5 FLOOR.
 *
 * Everything under common/ must run in Classic (document mode 5, old JScript) as
 * well as Modern/DCF (mode 11). build.sh proves it with check-syntax.js es3 — no
 * const/let/arrow/template literals, no trailing commas, and none of the ES5
 * runtime (no Array.prototype.forEach/indexOf, no Object.keys, no JSON, no
 * delete-on-window). Write plainly; the checker will tell you if you slip.
 *
 * TYPES: these files are plain JS, but tsc type-checks them from the JSDoc below
 * (checkJs) and GENERATES types/*.d.ts from it — so the published surface cannot
 * drift from the code, and nothing is emitted into the shipping path. The
 * one-namespace-per-file pattern is what makes that inference work (tsc infers
 * expando properties within a file, not across files), so keep it.
 */

var CCPSections = {};

/**
 * A section id as the presence API expects it. Case-wide kinds carry NO subject
 * and NO trailing colon — "544545:CASE", not "544545:CASE:" — while
 * subject-scoped kinds append theirs: "544545:VICTIM_WITNESS:98765".
 * @param {string|number|null|undefined} caseId
 * @param {string|null|undefined} kind
 * @param {string|number|null=} subjectId
 * @returns {string|null} null when there is no case or kind to name
 */
CCPSections.sectionId = function (caseId, kind, subjectId) {
  if (!caseId || !kind) {
    return null;
  }
  var id = String(caseId) + ":" + String(kind);
  if (subjectId != null && String(subjectId) !== "") {
    id = id + ":" + String(subjectId);
  }
  return id;
};

/**
 * The same identity, derived from a snapshot's section object rather than parts.
 * Used to key the roster cache, so it MUST agree with sectionId above.
 * @param {CCPSection|null|undefined} section
 * @returns {string} "" when the section cannot be identified
 */
CCPSections.sectionKey = function (section) {
  if (!section) {
    return "";
  }
  var caseId = section.caseId != null ? String(section.caseId) : "";
  var kind = section.kind != null ? String(section.kind) : "";
  var subjectId = section.subjectId != null ? String(section.subjectId) : "";
  if (!caseId || !kind) {
    return "";
  }
  var key = caseId + ":" + kind;
  if (subjectId !== "") {
    key = key + ":" + subjectId;
  }
  return key;
};

/**
 * Array.prototype.indexOf does not exist at document mode 5.
 * @param {string[]} list
 * @param {string} value
 * @returns {number} the index, or -1
 */
CCPSections.indexOfString = function (list, value) {
  var i;
  for (i = 0; i < list.length; i++) {
    if (list[i] === value) {
      return i;
    }
  }
  return -1;
};
