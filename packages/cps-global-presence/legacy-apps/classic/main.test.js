/* Unit tests for classic/main.js — WHEN the stripe is redrawn.
 *
 * Classic's presence UI has exactly two inputs: a poll response (onNotifications)
 * and an observation pass over the frames (tick). Everything the reader sees comes
 * out of which of those is allowed to redraw, and nothing pinned that until now.
 *
 * WHAT CHANGED on 2026-11-04. updateStripeSection watched the primary section on
 * every pass but acted in one direction only — its comment said so, "but only to
 * take it DOWN" — so a change from one section to a DIFFERENT one recorded the new
 * id and redrew nothing. It now defers to drawStripe either way.
 *
 * That was NOT the cause of the bug being chased at the time, and the tests below
 * are written knowing it: leaving a section already redrew by another route, since
 * sessions.setDesired drops it, which fires onSectionDropped -> roster.forget ->
 * drawStripe. Both routes are exercised here. What the change buys is that the
 * redraw no longer DEPENDS on that route: roster.forget only reports a change when
 * it held an entry under the same key the detector produced, and a section nobody
 * else is in — or one the server echoed under a key we do not hold — has no entry
 * to forget. The real cause was presence-sessions.js's use of
 * Date.prototype.toISOString; see its own tests.
 *
 * These assert on presenceStripeSnapshot() — what the stripe has been ASKED to
 * show. Not the DOM: the fake frames below have no action-bar footer, so nothing is
 * ever inserted, and a fake document would only prove the fake works (same
 * reasoning as stripe.test.js and modern/bar.test.js). The rendering is exercised
 * in CMS, where the document mode is the thing under test.
 *
 * This loads the WHOLE Classic presence bundle, in build.sh's order, because the
 * subject is the composition — sessions and roster included — rather than any one
 * function. main.js starts its loop on load, which is why the window below has
 * timers and attachEvent on it.
 */
var h = require("../../test-harness");

var CASE_A = "2121407";
var CASE_B = "2131508";
var BASE = "https://polaris-qa-notprod.cps.gov.uk/CMS.24.0.01/";

var CCPEnvironment = h.load(["common/presence-environment.js"], ["CCPEnvironment"]).CCPEnvironment;

// The CIN suffix is applied to the section ID in CCPLocator.section — and to the
// WIRE kind the roster keeps — but not to the detector's section.kind, which stays
// the plain kind the detectors are written in. Read it from the module rather than
// writing "CIN3" out: it is a deploy-time property of the CMS instance we front.
// Same reasoning as sections.test.js.
function wire(kind) {
  return CCPEnvironment.suffixKind(kind);
}

// ---- the CMS shell, as the frame readers find it -----------------------------
// Same shape as sections.test.js's helpers; the URLs are real, from HAR captures.

function frame(href, globals, fields) {
  var win = globals || {};
  win.location = { href: href };
  win.frames = [];
  win.document = {
    getElementById: function (id) {
      return fields && fields.hasOwnProperty(id) ? { value: fields[id] } : null;
    },
    all: {}
  };
  return win;
}

function caseDetails(caseId) {
  return frame(BASE + "Case/uacdCaseDetails.aspx?intCaseID=" + caseId);
}

function defendantPanel(caseId) {
  return frame(
    BASE + "Case/uadcDefsCharges.aspx?intCaseID=" + caseId,
    { sMode: "editDefendant", iScreenCaseID: caseId },
    { hidInEditMode: "Y", hidPartyID: "88112" }
  );
}

// The persistent frameset shell: the window the client is injected into. It is
// kept for the whole of one test and NAVIGATED by swapping frameMain, which is
// what CMS does to it — the shell itself never reloads, which is the reason state
// in this client can outlive the screen it was about.
function shell() {
  var top = h.fakeWindow({ pathname: "/CMS.24.0.01/uaglCMS.aspx", hash: "" });
  var logged = [];
  top.console = {
    log: function (line) {
      logged.push(String(line));
    }
  };
  top.__logged = logged;
  top.attachEvent = function () { };
  top.document = frame(BASE + "uaglCMS.aspx").document;
  top.navigate = function (main, nested) {
    main.frames = nested || [];
    top.frameMain = main;
    top.frames = [main];
  };
  top.navigate(caseDetails(CASE_A));
  return top;
}

// build.sh's CLASSIC bundle: the kill switch, then common/, then classic/.
var BUNDLE = [
  "legacy-apps/classic/kill-switch.js",
  "common/presence-environment.js",
  "common/presence-apps.js",
  "common/presence-section-names.js",
  "common/presence-joined.js",
  "common/presence-people.js",
  "legacy-apps/common/presence-viewer.js",
  "legacy-apps/common/presence-sections.js",
  "legacy-apps/common/presence-origin.js",
  "legacy-apps/common/presence-roster.js",
  "legacy-apps/common/presence-locator.js",
  "legacy-apps/common/presence-jsonp.js",
  "legacy-apps/common/presence-sessions.js",
  "legacy-apps/classic/dom.js",
  "legacy-apps/classic/sections.js",
  "legacy-apps/classic/stripe.js",
  "legacy-apps/classic/event-sink.js",
  "legacy-apps/classic/main.js"
];

function client(top) {
  return h.load(
    BUNDLE,
    ["tick", "onNotifications", "activeSections", "activeSectionIds", "presenceStripeSnapshot"],
    { window: top, document: h.fakeDocument() }
  );
}

// One poll response, in the shape presence-roster.js documents:
//   notifications[] -> { payload: { snapshots: [ { section, version, members } ] } }
// The server echoes the WIRE kind, so the roster is keyed by the suffixed one.
// `version` matters: a snapshot at the same version or older is discarded as
// out-of-order, so a test that changes a roster has to move it on.
function poll(caseId, kind, members, version) {
  return [
    {
      payload: {
        snapshots: [
          {
            section: { caseId: caseId, kind: wire(kind) },
            version: version ? version : 1,
            members: members
          }
        ]
      }
    }
  ];
}

function member(email) {
  return { userEmail: email, sourceApplication: "CMS Classic", joinedAt: "2026-11-04T09:30:00.000+00:00" };
}

// What the stripe has been asked to show, as one string. "" means nothing.
function shown(m) {
  var snap = m.presenceStripeSnapshot();
  return snap.state ? snap.state.text : "";
}

// On the case, with one other person there and the stripe up.
function onCaseWithCompany() {
  var top = shell();
  var m = client(top);
  m.tick();
  m.onNotifications(poll(CASE_A, "CASE", [member("ann@cps.gov.uk")]));
  return { top: top, m: m };
}

h.describe("a roster for the case you are on");

h.test("puts the stripe up, naming the people", function () {
  var r = onCaseWithCompany();
  h.assertTrue(shown(r.m).indexOf("ann@cps.gov.uk") !== -1, shown(r.m));
});

h.test("counts them for the collapsed summary", function () {
  var top = shell();
  var m = client(top);
  m.tick();
  m.onNotifications(poll(CASE_A, "CASE", [member("ann@cps.gov.uk"), member("bob@cps.gov.uk")]));
  h.assertEqual(m.presenceStripeSnapshot().state.count, 2);
});

h.test("a section emptying takes it down", function () {
  var r = onCaseWithCompany();
  r.m.onNotifications(poll(CASE_A, "CASE", [], 2));
  h.assertEqual(shown(r.m), "");
});

h.describe("navigating");

// No poll answers in between, so the ROSTER does not change: only the observation
// pass can notice, and showing case A's people in front of case B would be worse
// than showing nothing.
h.test("moving to another case does not leave the previous case's stripe up", function () {
  var r = onCaseWithCompany();
  h.assertTrue(shown(r.m) !== "", "precondition: the stripe is up for case A");

  r.top.navigate(caseDetails(CASE_B));
  r.m.tick();
  h.assertEqual(shown(r.m), "", "case A's roster must not be shown on case B");
});

h.test("moving off every section takes it down", function () {
  var r = onCaseWithCompany();
  r.top.navigate(frame(BASE + "Tasks/uatlTaskList.aspx"));
  r.m.tick();
  h.assertEqual(r.m.activeSectionIds(), [], "precondition: no sections on the task list");
  h.assertEqual(shown(r.m), "");
});

// The stripe is about the CASE, not the section, so a finer section opening within
// the same case is not news — and must not blank it. This is the other half of
// redrawing on every section change: it is only correct because drawStripe
// re-filters the roster BY CASE rather than by section id.
h.test("opening a panel within the same case keeps the stripe up", function () {
  var r = onCaseWithCompany();
  r.top.navigate(caseDetails(CASE_A), [defendantPanel(CASE_A)]);
  r.m.tick();
  h.assertEqual(
    r.m.activeSections()[0].id,
    CASE_A + ":" + wire("DEFENDANT") + ":88112",
    "precondition: the panel is the primary section"
  );
  h.assertTrue(shown(r.m).indexOf("ann@cps.gov.uk") !== -1, shown(r.m));
});

// The roster is NOT a cache that outlives the section. Leaving drops the session,
// and presence-sessions reports that as onSectionDropped, whose whole point is that
// the roster it stood for is no longer evidence of anything. So coming back shows
// nothing until the next poll answers — deliberately, and the alternative would be
// re-asserting a roster we have stopped being told about.
h.test("coming back to the case waits for a poll rather than reusing the old roster", function () {
  var r = onCaseWithCompany();
  r.top.navigate(caseDetails(CASE_B));
  r.m.tick();
  h.assertEqual(shown(r.m), "", "precondition: down on case B");

  r.top.navigate(caseDetails(CASE_A));
  r.m.tick();
  h.assertEqual(shown(r.m), "");

  r.m.onNotifications(poll(CASE_A, "CASE", [member("ann@cps.gov.uk")]));
  h.assertTrue(shown(r.m).indexOf("ann@cps.gov.uk") !== -1, shown(r.m));
});

h.describe("saying so when there is nowhere to put it");

// The frames in this file have no action-bar footer, so every render fails to place
// the stripe. That state — presence working, a roster held, the page showing
// nothing — was entirely silent, and finding it meant reading the live frameset by
// hand through a pasted console probe.
h.test("complains ONCE, and only after the condition outlives a navigation", function () {
  var r = onCaseWithCompany();
  var i;
  for (i = 0; i < 10; i++) {
    r.m.tick();
  }
  var lines = r.top.__logged;
  h.assertEqual(lines.length, 1, lines.join(" | "));
  h.assertTrue(lines[0].indexOf("could not be placed") !== -1, lines[0]);
});

h.test("stays quiet while there is nothing to show", function () {
  var top = shell();
  var m = client(top);
  var i;
  for (i = 0; i < 10; i++) {
    m.tick();
  }
  h.assertEqual(top.__logged, []);
});

h.test("names the reason, and does not claim to be on the page", function () {
  var r = onCaseWithCompany();
  var snap = r.m.presenceStripeSnapshot();
  h.assertTrue(snap.reason !== "", "a failed placement must say which lookup failed");
  h.assertEqual(snap.inDom, false);
});

h.summarise();
