/* Unit tests for modern/bar.js — the wording rules.
 *
 * describePerson is the part worth pinning down: it decides what a caseworker
 * actually reads. The DOM plumbing around it is exercised in the browser, not
 * here — a fake document would only prove the fake works.
 *
 * The shared tables load first, because the wording is now assembled from them
 * rather than written here: CCPSectionNames for where, CCPApps for which
 * application, CCPJoined for when. That is the point of the change — this bar and
 * the web components' pinned notification say the same things the same way.
 */
var h = require("../../test-harness");

var describePerson = h.load(
  [
    "common/presence-apps.js",
    "common/presence-section-names.js",
    "common/presence-joined.js",
    "common/presence-people.js",
    "legacy-apps/modern/bar.js"
  ],
  ["describePerson"]
).describePerson;

// The collapsed shape CCPPeople.collapse produces, which is what the bar now takes.
function person(username, sections, apps, isCurrentUser) {
  return { username: username, sections: sections || [], apps: apps || [], isCurrentUser: !!isCurrentUser };
}

function app(appDisplayName, timeEntered) {
  return { appDisplayName: appDisplayName, timeEntered: timeEntered };
}

// Fixed so the "since" clause is stable: same calendar day as the timestamps below.
function todayAt(hhmm) {
  var now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hhmm[0], hhmm[1]).toISOString();
}

h.describe("describePerson");

h.test("names where they are and which application", function () {
  h.assertEqual(
    describePerson(person("joe.smith@cps.gov.uk", [{ kind: "CASE" }], [app("CMS Modern")]), "CMS Modern"),
    "joe.smith@cps.gov.uk is in the case — CMS Modern"
  );
});

// Mapped, not raw: "Work Management App" is the API's name for RCMS.
h.test("their app is named as users name it, not as the API does", function () {
  h.assertEqual(
    describePerson(person("ann@cps.gov.uk", [{ kind: "CASE" }], [app("RCMS")]), "CMS Modern"),
    "ann@cps.gov.uk is in the case — RCMS"
  );
});

// The gap this change closes: skin 1 showed only the first application and never
// said when. One person in two systems is two sessions, and both are worth saying.
h.test("names every application they are in, with when they arrived", function () {
  h.assertEqual(
    describePerson(
      person("ann@cps.gov.uk", [{ kind: "CASE" }], [app("RCMS", todayAt([15, 38])), app("CMS Classic", todayAt([9, 5]))]),
      "CMS Modern"
    ),
    "ann@cps.gov.uk is in the case — RCMS since 3.38pm, CMS Classic since 9.05am"
  );
});

// The conflict set means a DCF session hears about the case around it, so saying
// WHICH part matters — it used to be a hardcoded CASE_REVIEW prefix test.
h.test("distinguishes the case review from the case", function () {
  h.assertEqual(
    describePerson(person("ann@cps.gov.uk", [{ kind: "CASE_REVIEW" }], [app("RCMS")]), "CMS Modern"),
    "ann@cps.gov.uk is in the case review — RCMS"
  );
});

h.test("says both when someone is in a section and the case around it", function () {
  h.assertEqual(
    describePerson(person("ann@cps.gov.uk", [{ kind: "CASE_REVIEW" }, { kind: "CASE" }], [app("RCMS")]), "CMS Modern"),
    "ann@cps.gov.uk is in the case review and the case — RCMS"
  );
});

h.test("uses the definite form for the section the reader is in too", function () {
  h.assertEqual(
    describePerson(person("ann@cps.gov.uk", [{ kind: "VICTIM_WITNESS", isCurrent: true }], [app("RCMS")]), "CMS Modern"),
    "ann@cps.gov.uk is in this witness or victim — RCMS"
  );
});

h.test("falls back to our own app name when the server named none", function () {
  h.assertEqual(
    describePerson(person("ann@cps.gov.uk", [{ kind: "CASE" }], []), "Work Management App"),
    "ann@cps.gov.uk is in the case — RCMS"
  );
});

// An unmapped kind shows its wire name rather than vanishing — the bargain the
// shared table makes everywhere.
h.test("an unrecognised section shows its own name rather than nothing", function () {
  h.assertEqual(
    describePerson(person("ann@cps.gov.uk", [{ kind: "SOMETHING_NEW" }], [app("RCMS")]), "CMS Modern"),
    "ann@cps.gov.uk is in SOMETHING_NEW — RCMS"
  );
});

h.test("says something sensible when we know nothing but the name", function () {
  h.assertEqual(describePerson(person("ann@cps.gov.uk", [], []), ""), "ann@cps.gov.uk is on this case");
});

// While the feature is being proved the reader stays in the list, labelled — the
// only outside evidence that whoami identified them and that the address matches
// what the API reports.
h.test("marks the reader, and the grammar still reads", function () {
  h.assertEqual(
    describePerson(person("me@cps.gov.uk", [{ kind: "CASE" }], [app("CMS Modern")], true), "CMS Modern"),
    "me@cps.gov.uk (current user) is in the case — CMS Modern"
  );
});

h.test("everyone else is unmarked", function () {
  h.assertEqual(
    describePerson(person("ann@cps.gov.uk", [{ kind: "CASE" }], [app("CMS Modern")], false), "CMS Modern"),
    "ann@cps.gov.uk is in the case — CMS Modern"
  );
});
