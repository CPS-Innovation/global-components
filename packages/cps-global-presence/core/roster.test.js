/* Unit tests for core/roster.js, against the API's real wire shape. */
var h = require("../test-harness");

var CCPRoster = h.load(["core/environment.js", "core/sections.js", "core/roster.js"], ["CCPRoster"]).CCPRoster;

var CASE = "124253";

// One notification carrying one snapshot, as poll returns it.
function notify(kind, subjectId, version, members, caseId) {
  return [{ payload: { snapshots: [{ section: { caseId: caseId || CASE, kind: kind, subjectId: subjectId }, version: version, members: members }] } }];
}

function member(email, app) {
  return { userEmail: email, sourceApplication: app || "CMS Modern", joinedAt: "2026-08-25T09:00:00Z" };
}

// Everyone held, as "email KIND", in roster order.
function who(r, caseId) {
  return r.members([], caseId).map(function (m) {
    return m.userEmail + " " + m.sections[0].kind;
  });
}

h.describe("applying snapshots");

h.test("a first snapshot is applied and reported as a change", function () {
  var r = CCPRoster.createRoster();
  h.assertEqual(r.apply(notify("CASE", null, 1, [member("stef@cps.gov.uk")])), true);
  h.assertEqual(who(r), ["stef@cps.gov.uk CASE"]);
});

h.test("a stale or equal version is ignored — poll gives no ordering guarantee", function () {
  var r = CCPRoster.createRoster();
  r.apply(notify("CASE", null, 2, [member("stef@cps.gov.uk")]));
  h.assertEqual(r.apply(notify("CASE", null, 1, [member("other@cps.gov.uk")])), false);
  h.assertEqual(r.apply(notify("CASE", null, 2, [member("other@cps.gov.uk")])), false);
  h.assertEqual(who(r), ["stef@cps.gov.uk CASE"]);
});

h.test("an empty poll changes nothing", function () {
  var r = CCPRoster.createRoster();
  r.apply(notify("CASE", null, 1, [member("stef@cps.gov.uk")]));
  h.assertEqual(r.apply([]), false);
  h.assertEqual(who(r), ["stef@cps.gov.uk CASE"]);
});

h.test("an empty members list at a newer version clears that section only", function () {
  var r = CCPRoster.createRoster();
  r.apply(notify("CASE", null, 1, [member("stef@cps.gov.uk")]));
  r.apply(notify("VICTIM_WITNESS", "98765", 1, [member("joe@cps.gov.uk")]));
  h.assertEqual(r.apply(notify("CASE", null, 2, [])), true);
  h.assertEqual(who(r), ["joe@cps.gov.uk VICTIM_WITNESS"]);
});

h.test("an unversioned snapshot is accepted", function () {
  var r = CCPRoster.createRoster();
  h.assertEqual(r.apply(notify("CASE", null, undefined, [member("stef@cps.gov.uk")])), true);
});

h.test("survives malformed input, and skips what cannot be identified or named", function () {
  var r = CCPRoster.createRoster();
  h.assertEqual(r.apply(null), false);
  h.assertEqual(r.apply({}), false);
  h.assertEqual(r.apply([null, {}, { payload: {} }, { payload: { snapshots: null } }]), false);
  h.assertEqual(r.apply([{ payload: { snapshots: [{ section: {}, version: 1, members: [member("a@b")] }] } }]), false);
  r.apply(notify("CASE", null, 1, [member(""), { sourceApplication: "x" }, member("real@cps.gov.uk")]));
  h.assertEqual(who(r), ["real@cps.gov.uk CASE"]);
});

h.describe("members");

h.test("marks our own sections current and filters by case", function () {
  var r = CCPRoster.createRoster();
  r.apply(notify("CASE", null, 1, [member("ann@cps.gov.uk")]));
  r.apply(notify("CASE_REVIEW", null, 1, [member("bob@cps.gov.uk")]));
  r.apply(notify("CASE", null, 1, [member("cy@cps.gov.uk")], "999"));
  var mine = r.members([CASE + ":CASE"], CASE);
  h.assertEqual(mine.map(function (m) { return m.userEmail + " " + m.sections[0].isCurrent; }), ["ann@cps.gov.uk true", "bob@cps.gov.uk false"]);
});

h.describe("forgetting a section we held");

h.test("drops its own roster", function () {
  var r = CCPRoster.createRoster();
  r.apply(notify("CASE", null, 1, [member("ann@cps.gov.uk")]), CASE + ":CASE");
  h.assertEqual(r.forget(CASE + ":CASE"), true);
  h.assertEqual(who(r), []);
});

h.test("drops the conflict rosters only it delivered", function () {
  var r = CCPRoster.createRoster();
  r.apply(notify("CASE_REVIEW", null, 1, [member("bob@cps.gov.uk")]), CASE + ":CASE");
  h.assertEqual(r.forget(CASE + ":CASE"), true, "a change, though we never held the review");
  h.assertEqual(who(r), []);
});

h.test("keeps a conflict roster another held section still delivers", function () {
  var r = CCPRoster.createRoster();
  r.apply(notify("CASE_REVIEW", null, 1, [member("bob@cps.gov.uk")]), CASE + ":CASE");
  r.apply(notify("CASE_REVIEW", null, 1, [member("bob@cps.gov.uk")]), CASE + ":DEFENDANT:1");
  r.forget(CASE + ":CASE");
  h.assertEqual(who(r), ["bob@cps.gov.uk CASE_REVIEW"]);
  r.forget(CASE + ":DEFENDANT:1");
  h.assertEqual(who(r), []);
});

h.test("leaves unattributed rosters alone, and reports no change when nothing went", function () {
  var r = CCPRoster.createRoster();
  r.apply(notify("CASE_REVIEW", null, 1, [member("bob@cps.gov.uk")]));
  h.assertEqual(r.forget(CASE + ":CASE"), false);
  h.assertEqual(who(r), ["bob@cps.gov.uk CASE_REVIEW"]);
});

h.test("clear() empties everything", function () {
  var r = CCPRoster.createRoster();
  r.apply(notify("CASE", null, 1, [member("stef@cps.gov.uk")]));
  r.clear();
  h.assertEqual(who(r), []);
});

h.describe("who arrived and who left, for the log");

h.test("reports arrivals once, lower-cased, across sections", function () {
  var r = CCPRoster.createRoster();
  r.apply(notify("CASE", null, 1, [member("Ann@cps.gov.uk")]));
  r.apply(notify("CASE_REVIEW", null, 1, [member("ann@cps.gov.uk"), member("bob@cps.gov.uk")]));
  h.assertEqual(r.takeChanges(), { joined: ["ann@cps.gov.uk", "bob@cps.gov.uk"], left: [] });
  h.assertEqual(r.takeChanges(), { joined: [], left: [] });
});

h.test("reports departures, including when a section is forgotten", function () {
  var r = CCPRoster.createRoster();
  r.apply(notify("CASE", null, 1, [member("ann@cps.gov.uk"), member("bob@cps.gov.uk")]));
  r.takeChanges();
  r.apply(notify("CASE", null, 2, [member("ann@cps.gov.uk")]));
  h.assertEqual(r.takeChanges(), { joined: [], left: ["bob@cps.gov.uk"] });
  r.forget(CASE + ":CASE");
  h.assertEqual(r.takeChanges(), { joined: [], left: ["ann@cps.gov.uk"] });
});
