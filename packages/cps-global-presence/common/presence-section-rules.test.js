/* Unit tests for common/presence-section-rules.js
 *
 * The table is short enough to read, so what is worth pinning down is the
 * BARGAIN it makes: quiet unless listed, and normalising between the two cases
 * the same string arrives in.
 */
var h = require("../test-harness");

var CCPSectionRules = h.load(["common/presence-section-rules.js"], ["CCPSectionRules"]).CCPSectionRules;

h.describe("CCPSectionRules.interrupts");

h.test("the editable sections interrupt", function () {
  h.assertEqual(CCPSectionRules.interrupts("CASE_REVIEW"), true);
  h.assertEqual(CCPSectionRules.interrupts("VICTIM_WITNESS"), true);
});

// The whole point of the change: two people reading a case is not a clash.
h.test("case-wide presence does not interrupt", function () {
  h.assertEqual(CCPSectionRules.interrupts("CASE"), false);
});

// Config writes region codes in lower case and the wire uses upper; callers
// should not have to know which one they are holding.
h.test("takes a region code as readily as a wire kind", function () {
  h.assertEqual(CCPSectionRules.interrupts("case_review"), true);
  h.assertEqual(CCPSectionRules.interrupts("victim_witness"), true);
  h.assertEqual(CCPSectionRules.interrupts("case"), false);
});

// The opposite bargain from CCPApps and CCPSectionNames, deliberately: an
// unmapped name there is shown, an unmapped kind here is silent.
h.test("a kind nobody has classified stays quiet", function () {
  h.assertEqual(CCPSectionRules.interrupts("DEFENDANT"), false);
  h.assertEqual(CCPSectionRules.interrupts("SOMETHING_NEW"), false);
});

h.test("nothing at all is not an interruption", function () {
  h.assertEqual(CCPSectionRules.interrupts(undefined), false);
  h.assertEqual(CCPSectionRules.interrupts(""), false);
});

// A bare lookup would find Object.prototype.constructor and read as truthy.
h.test("prototype members are not table entries", function () {
  h.assertEqual(CCPSectionRules.interrupts("constructor"), false);
  h.assertEqual(CCPSectionRules.interrupts("toString"), false);
  h.assertEqual(CCPSectionRules.interrupts("hasOwnProperty"), false);
});
