/* Unit tests for core/view.js — what a caseworker reads, in all three UIs. */
var h = require("../test-harness");

var CCPView = h.load(
  ["core/apps.js", "core/section-names.js", "core/joined.js", "core/people.js", "core/content.js", "core/view.js"],
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

h.test("passes the lock through to the summary", function () {
  var v = CCPView.build({ members: [], locked: true });
  h.assertEqual(v.count, 0);
  h.assertEqual(v.summary, "This case is locked");
});

h.test("takes the caller's time formatter", function () {
  var v = CCPView.build({ members: [rec("ann@cps.gov.uk", "CMS Classic", "CASE", "x")], formatTime: function () { return "noon"; } });
  h.assertEqual(v.lines, ["ann@cps.gov.uk is in the case — CMS Classic since noon."]);
});
