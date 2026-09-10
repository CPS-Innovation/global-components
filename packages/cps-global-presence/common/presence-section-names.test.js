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
  h.assertEqual(CCPSectionNames.describe([{ kind: "CASE_REVIEW" }]), "the case review");
  h.assertEqual(CCPSectionNames.describe([{ kind: "CASE_REVIEW" }, { kind: "DEFENDANT" }]), "the case review and a defendant");
  h.assertEqual(CCPSectionNames.describe([{ kind: "CASE" }, { kind: "CASE_REVIEW" }, { kind: "DEFENDANT" }]), "the case, the case review and a defendant");
});

// Two witnesses are two sections but one phrase — repeating "a witness or victim"
// would say nothing extra.
h.test("does not repeat a name", function () {
  h.assertEqual(CCPSectionNames.describe([{ kind: "VICTIM_WITNESS" }, { kind: "VICTIM_WITNESS" }]), "a witness or victim");
});

h.test("says nothing when there is nothing to say", function () {
  h.assertEqual(CCPSectionNames.describe([]), "");
});

h.describe("the reader's own section");

// The distinction worth drawing: someone elsewhere in the case, versus someone on
// the very record open in front of you.
h.test("names the reader's own subject definitely", function () {
  h.assertEqual(CCPSectionNames.displayName("VICTIM_WITNESS", true), "this witness or victim");
  h.assertEqual(CCPSectionNames.displayName("VICTIM_WITNESS", false), "a witness or victim");
  h.assertEqual(CCPSectionNames.displayName("DEFENDANT", true), "this defendant");
});

// There is only one case and one case review per case, so "the case" is already
// definite and has no second form to fall back to.
h.test("leaves the case-wide kinds alone", function () {
  h.assertEqual(CCPSectionNames.displayName("CASE", true), "the case");
  h.assertEqual(CCPSectionNames.displayName("CASE_REVIEW", true), "the case review");
});

h.test("mixes both in one phrase", function () {
  h.assertEqual(
    CCPSectionNames.describe([{ kind: "VICTIM_WITNESS", isCurrent: true }, { kind: "CASE" }]),
    "this witness or victim and the case"
  );
});

h.describe("CCPSectionNames.describe — one phrase per kind");

// The interstitial unions the sections of everyone it is interrupting for, so a
// kind genuinely arrives twice: once as the record in front of the reader, once
// from elsewhere in the same case. One phrase, and the definite one.
h.test("the definite form wins when a kind arrives both ways", function () {
  h.assertEqual(
    CCPSectionNames.describe([{ kind: "VICTIM_WITNESS", isCurrent: true }, { kind: "VICTIM_WITNESS", isCurrent: false }]),
    "this witness or victim"
  );
});

h.test("and whichever order the two arrive in", function () {
  h.assertEqual(
    CCPSectionNames.describe([{ kind: "VICTIM_WITNESS", isCurrent: false }, { kind: "VICTIM_WITNESS", isCurrent: true }]),
    "this witness or victim"
  );
});

h.test("kinds are matched case-insensitively when collapsing", function () {
  h.assertEqual(CCPSectionNames.describe([{ kind: "victim_witness" }, { kind: "VICTIM_WITNESS", isCurrent: true }]), "this witness or victim");
});

// First-appearance order, so a caller controls the reading order by the order it
// collects sections in rather than by an alphabet nobody asked for.
h.test("keeps first-appearance order across kinds", function () {
  h.assertEqual(
    CCPSectionNames.describe([{ kind: "VICTIM_WITNESS", isCurrent: true }, { kind: "CASE" }, { kind: "VICTIM_WITNESS" }]),
    "this witness or victim and the case"
  );
});

h.test("skips records with no kind, and takes no list at all", function () {
  h.assertEqual(CCPSectionNames.describe([null, { kind: "" }, { kind: "CASE" }]), "the case");
  h.assertEqual(CCPSectionNames.describe(undefined), "");
});

