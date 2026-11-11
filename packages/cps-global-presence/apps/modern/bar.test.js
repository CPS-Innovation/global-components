/* Unit tests for modern/bar.js — the wording rules.
 *
 * ccLines_ is the part worth pinning: it decides what a caseworker reads. The DOM
 * plumbing around it is exercised in the browser, not here — a fake document would
 * only prove the fake works.
 *
 * The shared tables load first, because the wording is assembled from them and not
 * written here. That is the point of the skin split: three presentations, one set
 * of words, so a design choice cannot quietly become a content change.
 */
var h = require("../../test-harness");

var ccLines_ = h.load(
  [
    "core/apps.js",
    "core/section-names.js",
    "core/joined.js",
    "core/people.js",
    "core/content.js",
    "apps/modern/bar.js"
  ],
  ["ccLines_"]
).ccLines_;

function person(username, sections, apps, isCurrentUser) {
  return { username: username, sections: sections || [], apps: apps || [], isCurrentUser: !!isCurrentUser };
}

function app(appDisplayName, timeEntered) {
  return { appDisplayName: appDisplayName, timeEntered: timeEntered };
}

function todayAt(hh, mi) {
  var now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mi).toISOString();
}

h.describe("modern ccLines_");

h.test("one line per person, naming where they are and which application", function () {
  var lines = ccLines_([person("ann@cps.gov.uk", [{ kind: "CASE" }], [app("RCMS", todayAt(15, 38))])]);
  h.assertEqual(lines.length, 1);
  h.assertEqual(lines[0], "ann@cps.gov.uk is in the case — RCMS since 3.38pm.");
});

// The same sentence the web components' banner renders — now because the SENTENCE
// is shared (CCPContent.personLine), not just the tables underneath it.
//
// THE TRAILING FULL STOP IS NEW HERE, and it is the drift this test was supposed to
// catch and could not: sharing the naming tables kept the words in step but left
// each client assembling them, and Modern had quietly stopped ending the sentence.
h.test("matches the web components' wording for several applications", function () {
  var lines = ccLines_([person("ann@cps.gov.uk", [{ kind: "CASE_REVIEW" }, { kind: "CASE" }], [app("RCMS", todayAt(9, 5)), app("CMS Classic")])]);
  h.assertEqual(lines[0], "ann@cps.gov.uk is in the case review and the case — RCMS since 9.05am, CMS Classic.");
});

h.test("marks the reader", function () {
  var lines = ccLines_([person("me@cps.gov.uk", [{ kind: "CASE" }], [app("CMS Modern")], true)]);
  h.assertEqual(lines[0], "me@cps.gov.uk (current user) is in the case — CMS Modern.");
});

h.test("uses the definite form for the reader's own section", function () {
  var lines = ccLines_([person("ann@cps.gov.uk", [{ kind: "VICTIM_WITNESS", isCurrent: true }], [app("RCMS")])]);
  h.assertEqual(lines[0], "ann@cps.gov.uk is in this witness or victim — RCMS.");
});

h.test("says something sensible when we know nothing but the name", function () {
  h.assertEqual(ccLines_([person("ann@cps.gov.uk", [], [])])[0], "ann@cps.gov.uk is on this case.");
});

h.test("no people is no lines", function () {
  h.assertEqual(ccLines_([]).length, 0);
});
