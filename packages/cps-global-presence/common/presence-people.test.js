/* Unit tests for common/presence-people.js
 *
 * The collapse all three clients share. The cases below are the ones that made it
 * worth writing down: the same person arriving twice, and two applications that
 * are one application to a user.
 */
var h = require("../test-harness");

var loaded = h.load(["common/presence-apps.js", "common/presence-people.js"], ["CCPPeople"]);
var CCPPeople = loaded.CCPPeople;

function member(email, app, joinedAt) {
  return { userEmail: email, sourceApplication: app, joinedAt: joinedAt };
}

function sectioned(email, app, sections) {
  return { userEmail: email, sourceApplication: app, joinedAt: "2026-09-08T09:00:00Z", sections: sections };
}

h.describe("CCPPeople.collapse");

h.test("one record per person, not per registration", function () {
  var people = CCPPeople.collapse([
    member("a@cps.gov.uk", "CMS Classic", "2026-09-08T09:00:00Z"),
    member("a@cps.gov.uk", "CMS Classic", "2026-09-08T09:05:00Z")
  ]);
  h.assertEqual(people.length, 1);
  h.assertEqual(people[0].username, "a@cps.gov.uk");
  h.assertEqual(people[0].apps.length, 1);
});

// The reason this lives next to CCPApps: two of the API's names are one product.
h.test("two applications that display the same are one application", function () {
  var people = CCPPeople.collapse([
    member("a@cps.gov.uk", "Work Management App", "2026-09-08T09:00:00Z"),
    member("a@cps.gov.uk", "Case Review App", "2026-09-08T10:00:00Z")
  ]);
  h.assertEqual(people.length, 1);
  h.assertEqual(people[0].apps.length, 1);
  h.assertEqual(people[0].apps[0].appDisplayName, "RCMS");
});

h.test("genuinely different applications are kept apart", function () {
  var people = CCPPeople.collapse([
    member("a@cps.gov.uk", "CMS Classic", "2026-09-08T09:00:00Z"),
    member("a@cps.gov.uk", "Work Management App", "2026-09-08T10:00:00Z")
  ]);
  h.assertEqual(people[0].apps.length, 2);
  h.assertEqual(people[0].apps[0].appDisplayName, "CMS Classic");
  h.assertEqual(people[0].apps[1].appDisplayName, "RCMS");
});

h.test("the earliest arrival wins when records collapse", function () {
  var people = CCPPeople.collapse([
    member("a@cps.gov.uk", "Case Review App", "2026-09-08T10:00:00Z"),
    member("a@cps.gov.uk", "Work Management App", "2026-09-08T09:00:00Z")
  ]);
  h.assertEqual(people[0].apps[0].timeEntered, "2026-09-08T09:00:00Z");
});

// The server derives the email from token claims; its casing is not ours to rely on.
h.test("matches people case-insensitively but reports what the server sent", function () {
  var people = CCPPeople.collapse([
    member("A.Person@cps.gov.uk", "CMS Classic", "2026-09-08T09:00:00Z"),
    member("a.person@cps.gov.uk", "CMS Modern", "2026-09-08T09:00:00Z")
  ]);
  h.assertEqual(people.length, 1);
  h.assertEqual(people[0].username, "A.Person@cps.gov.uk");
  h.assertEqual(people[0].apps.length, 2);
});

h.test("keeps a person the API gave no application for", function () {
  var people = CCPPeople.collapse([member("a@cps.gov.uk", undefined, "2026-09-08T09:00:00Z")]);
  h.assertEqual(people.length, 1);
  h.assertEqual(people[0].apps.length, 0);
});

h.test("skips a record with nobody in it", function () {
  h.assertEqual(CCPPeople.collapse([member("", "CMS Classic", "x"), null]).length, 0);
});

h.test("preserves first-appearance order so a UI does not reshuffle", function () {
  var people = CCPPeople.collapse([
    member("b@cps.gov.uk", "CMS Classic", "2026-09-08T09:00:00Z"),
    member("a@cps.gov.uk", "CMS Classic", "2026-09-08T08:00:00Z")
  ]);
  h.assertEqual(people[0].username, "b@cps.gov.uk");
  h.assertEqual(people[1].username, "a@cps.gov.uk");
});

h.test("an empty or missing list is an empty result", function () {
  h.assertEqual(CCPPeople.collapse([]).length, 0);
  h.assertEqual(CCPPeople.collapse(undefined).length, 0);
});

h.describe("CCPPeople.collapse — which parts of the case");

// The union is the point: a case-wide session reports a person once per section,
// and a UI that took only the first record would name whichever section happened
// to arrive first.
h.test("unions the sections a person is reported in", function () {
  var people = CCPPeople.collapse([
    sectioned("a@cps.gov.uk", "CMS Classic", [{ kind: "CASE", isCurrent: true }]),
    sectioned("a@cps.gov.uk", "CMS Classic", [{ kind: "CASE_REVIEW", isCurrent: false }])
  ]);
  h.assertEqual(people.length, 1);
  h.assertEqual(people[0].sections.length, 2);
  h.assertEqual(people[0].sections[0].kind, "CASE");
  h.assertEqual(people[0].sections[1].kind, "CASE_REVIEW");
});

// Two witnesses are two sections but ONE phrase — "a witness or victim and a
// witness or victim" would be a UI repeating itself rather than informing.
h.test("one entry per kind, however many subjects", function () {
  var people = CCPPeople.collapse([
    sectioned("a@cps.gov.uk", "CMS Classic", [{ kind: "VICTIM_WITNESS", isCurrent: false }]),
    sectioned("a@cps.gov.uk", "CMS Classic", [{ kind: "VICTIM_WITNESS", isCurrent: false }])
  ]);
  h.assertEqual(people[0].sections.length, 1);
});

// THE DEFINITE ARTICLE SURVIVES THE UNION. Someone on the witness in focus is
// also reported by the case-wide roster as being on a witness somewhere; the
// second record must not talk the first back down to "a witness or victim".
h.test("isCurrent wins over a later record that is not current", function () {
  var people = CCPPeople.collapse([
    sectioned("a@cps.gov.uk", "CMS Classic", [{ kind: "VICTIM_WITNESS", isCurrent: true }]),
    sectioned("a@cps.gov.uk", "CMS Classic", [{ kind: "VICTIM_WITNESS", isCurrent: false }])
  ]);
  h.assertEqual(people[0].sections.length, 1);
  h.assertEqual(people[0].sections[0].isCurrent, true);
});

h.test("isCurrent wins whichever order the records arrive in", function () {
  var people = CCPPeople.collapse([
    sectioned("a@cps.gov.uk", "CMS Classic", [{ kind: "VICTIM_WITNESS", isCurrent: false }]),
    sectioned("a@cps.gov.uk", "CMS Classic", [{ kind: "VICTIM_WITNESS", isCurrent: true }])
  ]);
  h.assertEqual(people[0].sections[0].isCurrent, true);
});

// The legacy roster does not carry sections at all, so this is the everyday shape
// on two of the three clients, not an edge case.
h.test("a record with no sections is a person with no sections", function () {
  var people = CCPPeople.collapse([member("a@cps.gov.uk", "CMS Classic", "2026-09-08T09:00:00Z")]);
  h.assertEqual(people[0].sections.length, 0);
});
