/* Unit tests for common/presence-section-names.js */
var h = require("../test-harness");

var CCPSectionNames = h.load(["common/presence-section-names.js"], ["CCPSectionNames"]).CCPSectionNames;

h.describe("CCPSectionNames.displayName");

h.test("names the kinds the API reports", function () {
  h.assertEqual(CCPSectionNames.displayName("CASE"), "the case");
  h.assertEqual(CCPSectionNames.displayName("CASE_REVIEW"), "the case review");
  h.assertEqual(CCPSectionNames.displayName("VICTIM_WITNESS"), "a witness or victim");
  h.assertEqual(CCPSectionNames.displayName("DEFENDANT"), "a defendant");
});

// Region codes are lower-case by local convention and upper-cased on the wire; both
// spellings reach this table depending on which side is asking.
h.test("is indifferent to case", function () {
  h.assertEqual(CCPSectionNames.displayName("case_review"), "the case review");
});

h.test("shows an unknown kind as sent rather than hiding it", function () {
  h.assertEqual(CCPSectionNames.displayName("SOMETHING_NEW"), "SOMETHING_NEW");
  h.assertEqual(CCPSectionNames.displayName(undefined), "");
});

h.describe("CCPSectionNames.describe");

h.test("reads as a sentence, not a list", function () {
  h.assertEqual(CCPSectionNames.describe(["CASE_REVIEW"]), "the case review");
  h.assertEqual(CCPSectionNames.describe(["CASE_REVIEW", "DEFENDANT"]), "the case review and a defendant");
  h.assertEqual(CCPSectionNames.describe(["CASE", "CASE_REVIEW", "DEFENDANT"]), "the case, the case review and a defendant");
});

// Two witnesses are two sections but one phrase — repeating "a witness or victim"
// would say nothing extra.
h.test("does not repeat a name", function () {
  h.assertEqual(CCPSectionNames.describe(["VICTIM_WITNESS", "VICTIM_WITNESS"]), "a witness or victim");
});

h.test("says nothing when there is nothing to say", function () {
  h.assertEqual(CCPSectionNames.describe([]), "");
});
