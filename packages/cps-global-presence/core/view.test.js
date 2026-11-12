/* Unit tests for core/view.js — what a caseworker reads, in all three UIs. */
var h = require("../test-harness");

var CCPView = h.load(
  ["core/apps.js", "core/names.js", "core/section-names.js", "core/joined.js", "core/people.js", "core/content.js", "core/view.js"],
  ["CCPView"]
).CCPView;

function todayAt(hh, mi) {
  var now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mi).toISOString();
}

function rec(email, app, kind, joinedAt, isCurrent) {
  return { userEmail: email, sourceApplication: app, joinedAt: joinedAt, sections: kind ? [{ kind: kind, isCurrent: !!isCurrent }] : [] };
}

h.describe("CCPView.build");

h.test("one line per person, naming where they are and which application", function () {
  var v = CCPView.build({ members: [rec("ann@cps.gov.uk", "Work Management App", "CASE", todayAt(15, 38))] });
  h.assertEqual(v.lines, ["ann@cps.gov.uk is in the case — RCMS since 3.38pm."]);
  h.assertEqual(v.summary, "1 other person is working on this case");
  h.assertEqual(v.count, 1);
});

h.test("someone in two sections and two applications is one line", function () {
  var v = CCPView.build({
    members: [
      rec("ann@cps.gov.uk", "Work Management App", "CASE_REVIEW", todayAt(9, 5)),
      rec("ann@cps.gov.uk", "CMS Classic", "CASE", "")
    ]
  });
  h.assertEqual(v.lines, ["ann@cps.gov.uk is in the case review and the case — RCMS since 9.05am, CMS Classic."]);
  h.assertEqual(v.count, 1);
});

h.test("uses the definite form for the reader's own section", function () {
  var v = CCPView.build({ members: [rec("ann@cps.gov.uk", "Work Management App", "VICTIM_WITNESS", "", true)] });
  h.assertEqual(v.lines, ["ann@cps.gov.uk is in this witness or victim — RCMS."]);
});

h.test("says something sensible when only the name is known", function () {
  h.assertEqual(CCPView.build({ members: [{ userEmail: "ann@cps.gov.uk" }] }).lines, ["ann@cps.gov.uk is on this case."]);
});

h.test("leaves the reader out by default", function () {
  var v = CCPView.build({ members: [rec("me@cps.gov.uk", "CMS Modern", "CASE", "")], viewerEmail: "ME@cps.gov.uk" });
  h.assertEqual(v.count, 0);
  h.assertEqual(v.lines, []);
});

h.test("countSelf keeps the reader in, marked, and drops 'other'", function () {
  var v = CCPView.build({ members: [rec("me@cps.gov.uk", "CMS Modern", "CASE", "")], viewerEmail: "me@cps.gov.uk", countSelf: true });
  h.assertEqual(v.includesSelf, true);
  h.assertEqual(v.lines, ["me@cps.gov.uk (current user) is in the case — CMS Modern."]);
  h.assertEqual(v.summary, "1 person is working on this case");
});

h.test("an unknown reader filters nobody", function () {
  var v = CCPView.build({ members: [rec("me@cps.gov.uk", "CMS Modern", "CASE", "")], viewerEmail: "" });
  h.assertEqual(v.count, 1);
  h.assertEqual(v.includesSelf, false);
});

h.describe("CCPView.build: names");

h.test("shows the name an address spells, and still tells people apart by address", function () {
  var v = CCPView.build({
    members: [rec("jane.doe2@cps.gov.uk", "CMS Classic", "CASE", ""), rec("JANE.DOE2@cps.gov.uk", "CMS Modern", "CASE", "")]
  });
  h.assertEqual(v.lines, ["Jane Doe is in the case — CMS Classic, CMS Modern."]);
  h.assertEqual(v.count, 1);
});

h.test("marks the reader by name", function () {
  var v = CCPView.build({ members: [rec("me.self@cps.gov.uk", "CMS Modern", "CASE", "")], viewerEmail: "me.self@cps.gov.uk", countSelf: true });
  h.assertEqual(v.lines, ["Me Self (current user) is in the case — CMS Modern."]);
});

h.test("shows an address that is not a name as it is", function () {
  var v = CCPView.build({ members: [rec("a.jdoe@cpsgovuk.onmicrosoft.com", "CMS Classic", "CASE", "")] });
  h.assertEqual(v.lines, ["a.jdoe@cpsgovuk.onmicrosoft.com is in the case — CMS Classic."]);
});

h.describe("CCPView.build: the lock (web components only)");

var LOCK = { firstNames: "Jane", surname: "Doe", application: "CMS Classic", since: "x" };
var noon = function (t) { return t ? "noon" : ""; };

h.test("folds the lock into its holder's line, which leads", function () {
  var v = CCPView.build({
    members: [rec("ann.other@cps.gov.uk", "CMS Modern", "CASE", ""), rec("jane.doe@cps.gov.uk", "Work Management App", "CASE_REVIEW", "y")],
    lock: LOCK,
    formatTime: noon
  });
  h.assertEqual(v.lines, [
    "Jane Doe has this case locked in CMS Classic since noon, and is in the case review — RCMS since noon.",
    "Ann Other is in the case — CMS Modern."
  ]);
  h.assertEqual(v.summary, "This case is locked, and 2 other people are currently working on this case");
});

h.test("matches CMS's first names however they are spelt", function () {
  var lock = { firstNames: "Mary Jane", surname: "O'Brien" };
  var v = CCPView.build({ members: [rec("mary-jane.obrien@cps.gov.uk", "", "", "")], lock: lock });
  h.assertEqual(v.lines, ["Mary-Jane Obrien has this case locked."]);
});

h.test("gives the lock a line of its own when its holder is not present", function () {
  var v = CCPView.build({ members: [rec("ann.other@cps.gov.uk", "CMS Modern", "CASE", "")], lock: LOCK, formatTime: noon });
  h.assertEqual(v.lines, ["Jane Doe has this case locked in CMS Classic since noon.", "Ann Other is in the case — CMS Modern."]);
});

h.test("still says the lock with nobody present at all", function () {
  var v = CCPView.build({ members: [], lock: { firstNames: "", surname: "" } });
  h.assertEqual(v.count, 0);
  h.assertEqual(v.summary, "This case is locked");
  h.assertEqual(v.lines, ["Someone has this case locked."]);
});

h.test("will not guess between namesakes", function () {
  var v = CCPView.build({
    members: [rec("jane.doe@cps.gov.uk", "CMS Modern", "CASE", ""), rec("jane.doe2@cps.gov.uk", "CMS Classic", "CASE", "")],
    lock: { firstNames: "Jane", surname: "Doe" }
  });
  h.assertEqual(v.lines, ["Jane Doe has this case locked.", "Jane Doe is in the case — CMS Modern.", "Jane Doe is in the case — CMS Classic."]);
});

h.test("ties the lock to nobody whose address uses another name", function () {
  var v = CCPView.build({ members: [rec("chris.doe@cps.gov.uk", "CMS Modern", "CASE", "")], lock: { firstNames: "Christopher", surname: "Doe" } });
  h.assertEqual(v.lines, ["Christopher Doe has this case locked.", "Chris Doe is in the case — CMS Modern."]);
});

h.describe("CCPView.build: the reader's own lock");

h.test("says 'You have this case locked', leading, when the reader holds it", function () {
  var v = CCPView.build({
    members: [rec("ann.other@cps.gov.uk", "CMS Modern", "CASE", "")],
    viewerEmail: "jane.doe@cps.gov.uk",
    lock: LOCK,
    formatTime: noon
  });
  h.assertEqual(v.lines, ["You have this case locked in CMS Classic since noon.", "Ann Other is in the case — CMS Modern."]);
  h.assertEqual(v.summary, "You have this case locked, and 1 other person is currently working on this case");
  h.assertEqual(v.lockedByReader, true);
});

h.test("says it with nobody else present", function () {
  var v = CCPView.build({ members: [rec("jane.doe@cps.gov.uk", "CMS Modern", "CASE", "")], viewerEmail: "jane.doe@cps.gov.uk", lock: LOCK, formatTime: noon });
  h.assertEqual(v.lines, ["You have this case locked in CMS Classic since noon."]);
  h.assertEqual(v.summary, "You have this case locked");
});

h.test("keeps 'You' on its own line when the reader is counted in", function () {
  var v = CCPView.build({
    members: [rec("jane.doe@cps.gov.uk", "CMS Modern", "CASE", "")],
    viewerEmail: "jane.doe@cps.gov.uk",
    countSelf: true,
    lock: LOCK,
    formatTime: noon
  });
  h.assertEqual(v.lines, ["You have this case locked in CMS Classic since noon.", "Jane Doe (current user) is in the case — CMS Modern."]);
});

h.test("assumes nobody when a colleague present could equally be the holder", function () {
  var v = CCPView.build({ members: [rec("jane.doe2@cps.gov.uk", "CMS Modern", "CASE", "")], viewerEmail: "jane.doe@cps.gov.uk", lock: LOCK, formatTime: noon });
  h.assertEqual(v.lines, ["Jane Doe has this case locked in CMS Classic since noon.", "Jane Doe is in the case — CMS Modern."]);
  h.assertEqual(v.summary, "This case is locked, and 1 other person is currently working on this case");
  h.assertEqual(v.lockedByReader, false);
});

h.test("an unknown reader is never the holder", function () {
  var v = CCPView.build({ members: [], viewerEmail: "", lock: LOCK, formatTime: noon });
  h.assertEqual(v.lines, ["Jane Doe has this case locked in CMS Classic since noon."]);
});

// THE LEGACY CLIENTS' CASE: no lock to give, so nothing about locking is said.
h.test("says nothing of locks when none is given", function () {
  var v = CCPView.build({ members: [rec("jane.doe@cps.gov.uk", "CMS Modern", "CASE", "")] });
  h.assertEqual(v.lines, ["Jane Doe is in the case — CMS Modern."]);
  h.assertEqual(v.summary, "1 other person is working on this case");
});

h.test("takes the caller's time formatter", function () {
  var v = CCPView.build({ members: [rec("ann@cps.gov.uk", "CMS Classic", "CASE", "x")], formatTime: function () { return "noon"; } });
  h.assertEqual(v.lines, ["ann@cps.gov.uk is in the case — CMS Classic since noon."]);
});
