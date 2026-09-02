/* Unit tests for modern/bar.js — the wording rules.
 *
 * describePerson is the part worth pinning down: it decides what a caseworker
 * actually reads. The DOM plumbing around it is exercised in the browser, not
 * here — a fake document would only prove the fake works.
 */
var h = require("../test-harness");

var describePerson = h.load(["modern/bar.js"], ["describePerson"]).describePerson;

function person(email, regions, apps) {
  return { userEmail: email, regions: regions, apps: apps || [] };
}

h.describe("describePerson");

h.test("someone on the case is reported as viewing, naming their app", function () {
  h.assertEqual(
    describePerson(person("joe.smith@cps.gov.uk", ["CASE"], ["CMS Modern"]), "CMS Modern"),
    "joe.smith@cps.gov.uk is also viewing this case in CMS Modern"
  );
});

h.test("their app is named as the server reported it, not as ours", function () {
  h.assertEqual(
    describePerson(person("ann@cps.gov.uk", ["CASE"], ["Work Management App"]), "CMS Modern"),
    "ann@cps.gov.uk is also viewing this case in Work Management App"
  );
});

h.test("someone reviewing is reported as reviewing", function () {
  h.assertEqual(
    describePerson(person("joe.smith@cps.gov.uk", ["CASE_REVIEW"], ["CMS Modern"]), "CMS Modern"),
    "joe.smith@cps.gov.uk is reviewing this case"
  );
});

h.test("the more specific region wins — reviewing implies being on the case", function () {
  h.assertEqual(
    describePerson(person("sam@cps.gov.uk", ["CASE", "CASE_REVIEW"], ["CMS Modern"]), "CMS Modern"),
    "sam@cps.gov.uk is reviewing this case"
  );
});

h.test("falls back to our own app name when the server named none", function () {
  h.assertEqual(
    describePerson(person("no.app@cps.gov.uk", ["CASE"], []), "CMS Modern"),
    "no.app@cps.gov.uk is also viewing this case in CMS Modern"
  );
});

h.test("an unrecognised region reads as viewing rather than saying something wrong", function () {
  h.assertEqual(
    describePerson(person("x@cps.gov.uk", ["DEFENDANT:98765"], ["CMS Classic"]), "CMS Modern"),
    "x@cps.gov.uk is also viewing this case in CMS Classic"
  );
});

h.summarise();
