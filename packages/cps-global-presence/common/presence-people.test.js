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
