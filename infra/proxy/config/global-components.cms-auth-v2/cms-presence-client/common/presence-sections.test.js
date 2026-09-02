/* Unit tests for common/presence-sections.js */
var h = require("../test-harness");

var S = h.load(["common/presence-sections.js"], ["CCPSections"]).CCPSections;

h.describe("CCPSections.sectionId");

h.test("case-wide kinds carry no subject and no trailing colon", function () {
  h.assertEqual(S.sectionId("544545", "CASE"), "544545:CASE");
  h.assertEqual(S.sectionId("544545", "CASE_REVIEW"), "544545:CASE_REVIEW");
});

h.test("subject-scoped kinds append the subject", function () {
  h.assertEqual(S.sectionId("544545", "VICTIM_WITNESS", "98765"), "544545:VICTIM_WITNESS:98765");
});

h.test("numbers are accepted — ids come off the CMS DOM as either", function () {
  h.assertEqual(S.sectionId(544545, "DEFENDANT", 98765), "544545:DEFENDANT:98765");
});

h.test("an empty subject is omitted, not appended as a bare colon", function () {
  h.assertEqual(S.sectionId("544545", "CASE", ""), "544545:CASE");
  h.assertEqual(S.sectionId("544545", "CASE", null), "544545:CASE");
});

h.test("no case or no kind means no section", function () {
  h.assertEqual(S.sectionId(null, "CASE"), null);
  h.assertEqual(S.sectionId("544545", null), null);
  h.assertEqual(S.sectionId("", ""), null);
});

h.describe("CCPSections.sectionKey");

h.test("agrees with sectionId — the roster cache is keyed on it", function () {
  h.assertEqual(S.sectionKey({ caseId: "544545", kind: "CASE" }), S.sectionId("544545", "CASE"));
  h.assertEqual(
    S.sectionKey({ caseId: "544545", kind: "VICTIM_WITNESS", subjectId: "98765" }),
    S.sectionId("544545", "VICTIM_WITNESS", "98765")
  );
});

h.test("a null subject is the same as no subject", function () {
  h.assertEqual(S.sectionKey({ caseId: "1", kind: "CASE", subjectId: null }), "1:CASE");
});

h.test("an unidentifiable section keys as empty, so callers can skip it", function () {
  h.assertEqual(S.sectionKey(null), "");
  h.assertEqual(S.sectionKey({}), "");
  h.assertEqual(S.sectionKey({ caseId: "1" }), "");
});

h.describe("CCPSections.indexOfString");

h.test("finds, and reports absence", function () {
  h.assertEqual(S.indexOfString(["a", "b"], "b"), 1);
  h.assertEqual(S.indexOfString(["a", "b"], "c"), -1);
  h.assertEqual(S.indexOfString([], "a"), -1);
});

h.test("matches strictly — no coercion", function () {
  h.assertEqual(S.indexOfString(["1"], 1), -1);
});

h.summarise();
