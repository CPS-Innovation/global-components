/* core/sections.js — section identity: the id we register under, and the key the
 * roster files snapshots by. The two must agree.
 */

var CCPSections = {};

/**
 * How often a client must touch each section's session. The Watchdog evicts a
 * session it has not heard from for 10 seconds, so every client beats well inside
 * that: one missed beat is survivable, two late ones are not.
 */
CCPSections.HEARTBEAT_MS = 3000;

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
