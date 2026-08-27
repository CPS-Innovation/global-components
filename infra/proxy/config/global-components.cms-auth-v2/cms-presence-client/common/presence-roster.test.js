/* Unit tests for common/presence-roster.js
 *
 * This is the logic worth never writing twice — the same reconciliation runs
 * behind JSONP for the legacy clients and SignalR for the current apps — so the
 * cases below are written against the API's real wire shape.
 */
var h = require("../test-harness");

var loaded = h.load(["common/presence-sections.js", "common/presence-roster.js"], ["CCPRoster"]);
var CCPRoster = loaded.CCPRoster;

// One notification carrying one snapshot, as poll returns it.
function notify(kind, subjectId, version, members) {
  return [{ payload: { snapshots: [{ section: { caseId: "124253", kind: kind, subjectId: subjectId }, version: version, members: members }] } }];
}

function member(email, app) {
  return { userEmail: email, sourceApplication: app, joinedAt: "2026-08-25T09:00:00Z" };
}

h.describe("CCPRoster — applying snapshots");

h.test("a first snapshot is applied and reported as a change", function () {
  var r = CCPRoster.createRoster();
  h.assertEqual(r.apply(notify("CASE", null, 1, [member("stef@cps.gov.uk", "CMS Modern")])), true);
  h.assertEqual(r.describe(), "stef@cps.gov.uk [CASE] via CMS Modern");
});

h.test("a stale version is ignored — poll gives no ordering guarantee", function () {
  var r = CCPRoster.createRoster();
  r.apply(notify("CASE", null, 2, [member("stef@cps.gov.uk", "CMS Modern")]));
  h.assertEqual(r.apply(notify("CASE", null, 1, [member("someone.else@cps.gov.uk", "CMS Classic")])), false, "older version must not overwrite");
  h.assertEqual(r.describe(), "stef@cps.gov.uk [CASE] via CMS Modern");
});

h.test("an equal version is ignored too — replays are not news", function () {
  var r = CCPRoster.createRoster();
  r.apply(notify("CASE", null, 1, [member("stef@cps.gov.uk", "CMS Modern")]));
  h.assertEqual(r.apply(notify("CASE", null, 1, [member("stef@cps.gov.uk", "CMS Modern")])), false);
});

h.test("an empty poll changes nothing and leaves the roster standing", function () {
  var r = CCPRoster.createRoster();
  r.apply(notify("CASE", null, 1, [member("stef@cps.gov.uk", "CMS Modern")]));
  h.assertEqual(r.apply([]), false);
  h.assertEqual(r.describe(), "stef@cps.gov.uk [CASE] via CMS Modern");
});

h.test("an empty members list at a NEWER version clears that section", function () {
  var r = CCPRoster.createRoster();
  r.apply(notify("CASE", null, 1, [member("stef@cps.gov.uk", "CMS Modern")]));
  h.assertEqual(r.apply(notify("CASE", null, 2, [])), true);
  h.assertEqual(r.describe(), "(nobody)");
});

h.test("an unversioned snapshot is accepted — better than ignoring it", function () {
  var r = CCPRoster.createRoster();
  h.assertEqual(r.apply(notify("CASE", null, undefined, [member("stef@cps.gov.uk", "CMS Modern")])), true);
});

h.test("sections are independent — one clearing does not disturb another", function () {
  var r = CCPRoster.createRoster();
  r.apply(notify("CASE", null, 1, [member("stef@cps.gov.uk", "CMS Modern")]));
  r.apply(notify("VICTIM_WITNESS", "98765", 1, [member("joe@cps.gov.uk", "CMS Classic")]));
  r.apply(notify("CASE", null, 2, []));
  h.assertEqual(r.describe(), "joe@cps.gov.uk [VICTIM_WITNESS:98765] via CMS Classic");
});

h.describe("CCPRoster — malformed input");

h.test("survives nulls, empties and missing payloads", function () {
  var r = CCPRoster.createRoster();
  h.assertEqual(r.apply(null), false);
  h.assertEqual(r.apply(undefined), false);
  h.assertEqual(r.apply({}), false, "not an array");
  h.assertEqual(r.apply([null, {}, { payload: {} }, { payload: { snapshots: null } }]), false);
  h.assertEqual(r.describe(), "(nobody)");
});

h.test("skips snapshots whose section cannot be identified", function () {
  var r = CCPRoster.createRoster();
  h.assertEqual(r.apply([{ payload: { snapshots: [{ section: {}, version: 1, members: [member("a@b", "x")] }] } }]), false);
});

h.test("skips members with no email — they cannot be named or deduped", function () {
  var r = CCPRoster.createRoster();
  r.apply(notify("CASE", null, 1, [member("", "CMS Modern"), { sourceApplication: "CMS Modern" }, member("real@cps.gov.uk", "CMS Modern")]));
  h.assertEqual(r.people().length, 1);
});

h.describe("CCPRoster — one person, one entry");

h.test("someone in two sections appears once, with both regions", function () {
  var r = CCPRoster.createRoster();
  r.apply(notify("CASE", null, 1, [member("joe@cps.gov.uk", "CMS Classic")]));
  r.apply(notify("VICTIM_WITNESS", "98765", 1, [member("joe@cps.gov.uk", "CMS Classic")]));
  var people = r.people();
  h.assertEqual(people.length, 1);
  h.assertEqual(people[0].regions, ["CASE", "VICTIM_WITNESS:98765"]);
});

h.test("the same person seen in two apps lists both, without duplicates", function () {
  var r = CCPRoster.createRoster();
  r.apply(notify("CASE", null, 1, [member("joe@cps.gov.uk", "CMS Classic")]));
  r.apply(notify("CASE_REVIEW", null, 1, [member("joe@cps.gov.uk", "CMS Modern"), member("joe@cps.gov.uk", "CMS Modern")]));
  h.assertEqual(r.people()[0].apps, ["CMS Classic", "CMS Modern"]);
});

h.test("identity is case-insensitive — the server derives it from token claims", function () {
  var r = CCPRoster.createRoster();
  r.apply(notify("CASE", null, 1, [member("Joe@cps.gov.uk", "CMS Classic")]));
  r.apply(notify("CASE_REVIEW", null, 1, [member("joe@CPS.GOV.UK", "CMS Modern")]));
  h.assertEqual(r.people().length, 1, "one person, however the server cased it");
});

h.test("clear() empties everything", function () {
  var r = CCPRoster.createRoster();
  r.apply(notify("CASE", null, 1, [member("stef@cps.gov.uk", "CMS Modern")]));
  r.clear();
  h.assertEqual(r.describe(), "(nobody)");
  h.assertEqual(r.people(), []);
});

h.summarise();
