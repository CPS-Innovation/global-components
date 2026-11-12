/* Unit tests for core/names.js
 *
 * Every case is one of the shapes found in the 2026-11-12 Entra survey (see the
 * header of names.js). The names here are made up.
 */
var h = require("../test-harness");

var loaded = h.load(["core/names.js"], ["CCPNames"]);
var CCPNames = loaded.CCPNames;

h.describe("CCPNames.displayName: addresses that are names");

h.test("first.surname", function () {
  h.assertEqual(CCPNames.displayName("jane.doe@cps.gov.uk"), "Jane Doe");
});

h.test("drops the digits that tell namesakes apart", function () {
  h.assertEqual(CCPNames.displayName("john.smith2@cps.gov.uk"), "John Smith");
  h.assertEqual(CCPNames.displayName("john.smith-jones12@cps.gov.uk"), "John Smith-Jones");
});

h.test("keeps hyphens, capitalising each piece, in either name", function () {
  h.assertEqual(CCPNames.displayName("jane.smith-jones@cps.gov.uk"), "Jane Smith-Jones");
  h.assertEqual(CCPNames.displayName("mary-jane.doe@cps.gov.uk"), "Mary-Jane Doe");
});

h.test("keeps an apostrophe and capitalises after it", function () {
  h.assertEqual(CCPNames.displayName("sean.o'brien@cps.gov.uk"), "Sean O'Brien");
});

h.test("keeps a mixed case the address already has", function () {
  h.assertEqual(CCPNames.displayName("Jane.McDonald@cps.gov.uk"), "Jane McDonald");
});

h.test("normalises an address that is all one case", function () {
  h.assertEqual(CCPNames.displayName("JANE.DOE@CPS.GOV.UK"), "Jane Doe");
  h.assertEqual(CCPNames.displayName("jane.mcdonald@cps.gov.uk"), "Jane Mcdonald");
});

h.test("reads every staff domain", function () {
  h.assertEqual(CCPNames.displayName("jane.doe@attorneygeneral.gov.uk"), "Jane Doe");
  h.assertEqual(CCPNames.displayName("jane.doe@hmcpsi.gov.uk"), "Jane Doe");
});

h.describe("CCPNames.displayName: addresses that are not names come back as they are");

h.test("admin accounts on the tenant domain", function () {
  h.assertEqual(CCPNames.displayName("a.jdoe@cpsgovuk.onmicrosoft.com"), "a.jdoe@cpsgovuk.onmicrosoft.com");
  h.assertEqual(CCPNames.displayName("a.jdoe@CPSGOVUK.onmicrosoft.com"), "a.jdoe@CPSGOVUK.onmicrosoft.com");
});

h.test("any domain we do not know", function () {
  h.assertEqual(CCPNames.displayName("jane.doe@example.com"), "jane.doe@example.com");
});

h.test("functional mailboxes with no dot", function () {
  h.assertEqual(CCPNames.displayName("servicedesk@cps.gov.uk"), "servicedesk@cps.gov.uk");
  h.assertEqual(CCPNames.displayName("case-team@cps.gov.uk"), "case-team@cps.gov.uk");
  h.assertEqual(CCPNames.displayName("team2@cps.gov.uk"), "team2@cps.gov.uk");
});

h.test("digits anywhere but the end of the surname", function () {
  h.assertEqual(CCPNames.displayName("jane2.doe@cps.gov.uk"), "jane2.doe@cps.gov.uk");
  h.assertEqual(CCPNames.displayName("unit-a.9@cps.gov.uk"), "unit-a.9@cps.gov.uk");
  h.assertEqual(CCPNames.displayName("jane.2doe@cps.gov.uk"), "jane.2doe@cps.gov.uk");
});

h.test("underscores, several dots, and stray joiners", function () {
  h.assertEqual(CCPNames.displayName("jane_doe@cps.gov.uk"), "jane_doe@cps.gov.uk");
  h.assertEqual(CCPNames.displayName("jane.q.doe@cps.gov.uk"), "jane.q.doe@cps.gov.uk");
  h.assertEqual(CCPNames.displayName("jane.doe-@cps.gov.uk"), "jane.doe-@cps.gov.uk");
  h.assertEqual(CCPNames.displayName("jane.-doe@cps.gov.uk"), "jane.-doe@cps.gov.uk");
  h.assertEqual(CCPNames.displayName(".doe@cps.gov.uk"), ".doe@cps.gov.uk");
});

h.test("not an address at all", function () {
  h.assertEqual(CCPNames.displayName("jane.doe"), "jane.doe");
  h.assertEqual(CCPNames.displayName("@cps.gov.uk"), "@cps.gov.uk");
});

h.test("is empty when there is no address", function () {
  h.assertEqual(CCPNames.displayName(undefined), "");
  h.assertEqual(CCPNames.displayName(null), "");
  h.assertEqual(CCPNames.displayName(""), "");
});

h.describe("CCPNames.parse");

h.test("gives the two names separately", function () {
  var name = CCPNames.parse("mary-jane.o'brien3@cps.gov.uk");
  h.assertEqual(name.given, "Mary-Jane");
  h.assertEqual(name.surname, "O'Brien");
});

h.test("is null for anything displayName would show as the address", function () {
  h.assertEqual(CCPNames.parse("a.jdoe@cpsgovuk.onmicrosoft.com"), null);
  h.assertEqual(CCPNames.parse("servicedesk@cps.gov.uk"), null);
  h.assertEqual(CCPNames.parse(undefined), null);
});

h.describe("CCPNames.matches: is this address the person CMS names?");

h.test("matches on first name and surname, whatever the case or digits", function () {
  h.assertEqual(CCPNames.matches("jane.doe2@cps.gov.uk", "JANE", "doe"), true);
});

h.test("takes the first of several first names, or all of them run together", function () {
  h.assertEqual(CCPNames.matches("jane.doe@cps.gov.uk", "Jane Alice", "Doe"), true);
  h.assertEqual(CCPNames.matches("mary-jane.doe@cps.gov.uk", "Mary Jane", "Doe"), true);
  h.assertEqual(CCPNames.matches("mary-jane.doe@cps.gov.uk", "Mary-Jane", "Doe"), true);
});

h.test("ignores hyphens and apostrophes in the surname", function () {
  h.assertEqual(CCPNames.matches("sean.obrien@cps.gov.uk", "Sean", "O'Brien"), true);
  h.assertEqual(CCPNames.matches("jane.smith-jones@cps.gov.uk", "Jane", "Smith Jones"), true);
});

h.test("does not match a different name, or an address that is not a name", function () {
  h.assertEqual(CCPNames.matches("chris.doe@cps.gov.uk", "Christopher", "Doe"), false);
  h.assertEqual(CCPNames.matches("jane.doe@cps.gov.uk", "Jane", "Dough"), false);
  h.assertEqual(CCPNames.matches("a.jdoe@cpsgovuk.onmicrosoft.com", "J", "Doe"), false);
  h.assertEqual(CCPNames.matches("jane.doe@cps.gov.uk", "", ""), false);
  h.assertEqual(CCPNames.matches(undefined, "Jane", "Doe"), false);
});
