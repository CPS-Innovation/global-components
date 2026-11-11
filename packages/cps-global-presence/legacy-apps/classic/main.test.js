/* Unit tests for classic/main.js — WHEN anything is registered, and WHEN the
 * stripe is redrawn.
 *
 * Classic's presence UI has exactly two inputs: a poll response (onNotifications)
 * and an observation pass over the frames (tick). Everything the reader sees comes
 * out of which of those is allowed to redraw, and nothing pinned that until now.
 *
 * REGISTRATION NOW WAITS for the CMS instance to be known — it comes back with
 * whoami, which is why every test here answers one before it ticks, and why
 * Classic has a viewer at all. See "waiting to be told where we are".
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
 * This loads the WHOLE Classic presence bundle, from bundles.json, because the
 * subject is the composition — sessions and roster included — rather than any one
 * function. main.js starts its loop on load, which is why the window below has
 * timers and attachEvent on it.
 */
var h = require("../../test-harness");

var CASE_A = "2121407";
var CASE_B = "2131508";
var BASE = "https://polaris-qa-notprod.cps.gov.uk/CMS.24.0.01/";

// WHICH CMS INSTANCE THESE TESTS ARE ON. Written out rather than read from the
// module, which no longer has an answer of its own: the suffix is discovered from
// whoami now, so the environment is something each test ESTABLISHES (see
// answerWhoami) and this is the value it establishes.
var CMS_ENV = "CIN3";

// The CIN suffix is applied to the section ID in CCPLocator.section — and to the
// WIRE kind the roster keeps — but not to the detector's section.kind, which stays
// the plain kind the detectors are written in.
function wire(kind) {
  return kind + "_" + CMS_ENV;
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

// The CLASSIC bundle from bundles.json: the kill switch, then common/, then classic/.
var BUNDLE = h.bundle("classic");

function client(top) {
  // The document is kept on the window so the JSONP helpers below can read the
  // script tags the transport appended — that is the only record of what this
  // client actually sent.
  top.__doc = h.fakeDocument();
  return h.load(
    BUNDLE,
    ["tick", "onNotifications", "activeSections", "activeSectionIds", "presenceStripeSnapshot"],
    { window: top, document: top.__doc }
  );
}

// ---- the JSONP wire, as the fake document records it --------------------------
//
// Every call is a <script src> with its op and its callback name in the query, and
// the callback is a real global on the window (see presence-jsonp.js). So the ops
// sent are readable, and a reply can be delivered by calling the global — which is
// exactly what the browser does when the response body executes.

function ops(top) {
  var out = [];
  var appended = top.__doc.__appended;
  var i, m;
  for (i = 0; i < appended.length; i++) {
    m = /[?&]op=([^&]+)/.exec(appended[i].src || "");
    if (m) {
      out.push(m[1]);
    }
  }
  return out;
}

function sent(top, op) {
  var out = [];
  var appended = top.__doc.__appended;
  var i, src;
  for (i = 0; i < appended.length; i++) {
    src = appended[i].src || "";
    if (src.indexOf("op=" + op) !== -1) {
      out.push(src);
    }
  }
  return out;
}

// Answer the whoami the viewer sent on construction. Without this the client
// knows nothing about its environment and registers NOTHING, which is the point
// of the two tests under "waiting to be told where we are".
function answerWhoami(top, payload) {
  var calls = sent(top, "whoami");
  var src = calls[calls.length - 1];
  var name = /[?&]callback=([^&]+)/.exec(src)[1];
  top[name](payload);
}

function whoamiReply(env, why) {
  return {
    userEmail: "me@cps.gov.uk",
    oid: "00000000-1111-2222-3333-444444444444",
    cmsEnv: env,
    cmsEnvWhy: why ? why : "hint"
  };
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

// On the case, with one other person there and the stripe up. The whoami is
// answered first, because nothing registers before the environment is known.
function onCaseWithCompany() {
  var top = shell();
  var m = client(top);
  answerWhoami(top, whoamiReply(CMS_ENV));
  m.tick();
  m.onNotifications(poll(CASE_A, "CASE", [member("ann@cps.gov.uk")]));
  return { top: top, m: m };
}

h.describe("waiting to be told where we are");

// THE FAILURE THIS PREVENTS IS SILENT. The CIN suffix separates CIN2, CIN3 and
// CIN5 on the Watchdog they share, and it arrives with whoami — so a pass that
// registered before the answer came back would name "2121407:CASE" against an
// instance speaking "2121407:CASE_CIN3" and sit in an empty room for the life of
// the page, with no error and nothing on screen to suggest a cause.
//
// The two calls allowed here are the two one-shot QUESTIONS the client asks about
// itself on boot — whoami, and the preview read on the state route. Neither
// registers anything and neither gates the other. What must NOT appear is a
// create, so that is what this asserts; pinning the exact list instead would
// fail again the next time the client learns to ask something, which says nothing
// about the invariant.
h.test("registers nothing before whoami has answered", function () {
  var top = shell();
  var m = client(top);
  m.tick();
  m.tick();
  h.assertEqual(sent(top, "create").length, 0, "nothing registered: " + ops(top).join(","));
  h.assertTrue(ops(top).indexOf("whoami") !== -1, "but it did ask: " + ops(top).join(","));
});

// Boot asks exactly twice, and not once per tick. The preview read is cached the
// same way whoami is — a flag cannot change without the ?set= navigation, which
// reloads the page — so a client that re-asked every pass would be making two
// requests every three seconds, for the life of every tab, to be told the same
// thing.
h.test("neither boot question is re-asked on later ticks", function () {
  var top = shell();
  var m = client(top);
  m.tick();
  m.tick();
  m.tick();
  var all = ops(top);
  var whoamis = 0;
  var previews = 0;
  var i;
  for (i = 0; i < all.length; i++) {
    if (all[i] === "whoami") {
      whoamis = whoamis + 1;
    }
    if (all[i] === "preview") {
      previews = previews + 1;
    }
  }
  // whoami is still unanswered here, so it is allowed to retry — the environment
  // is what presence waits on. The preview read is NOT waiting on anything, and
  // its answer arrived, so it must be done.
  h.assertEqual(previews, 1, "preview asked once: " + all.join(","));
  h.assertTrue(whoamis >= 1, "whoami asked: " + all.join(","));
});

h.test("registers as soon as it knows, with the instance on the section id", function () {
  var top = shell();
  var m = client(top);
  m.tick();
  answerWhoami(top, whoamiReply(CMS_ENV));
  m.tick();

  var creates = sent(top, "create");
  h.assertEqual(creates.length, 1, ops(top).join(","));
  h.assertTrue(
    creates[0].indexOf("sectionId=" + encodeURIComponent(CASE_A + ":" + wire("CASE"))) !== -1,
    creates[0]
  );
});

// Production is a Watchdog of its own, so it takes no suffix — and "no suffix"
// has to be a thing we can be TOLD, distinct from not knowing yet. Pinned here
// rather than only in presence-environment.test.js because this is the path that
// has to carry the distinction: the same empty string means "wait" in one place
// and "register plainly" in the other.
h.test("an environment that takes no suffix still registers, plainly", function () {
  var top = shell();
  var m = client(top);
  m.tick();
  answerWhoami(top, whoamiReply("CMS"));
  m.tick();

  var creates = sent(top, "create");
  h.assertEqual(creates.length, 1, ops(top).join(","));
  h.assertTrue(
    creates[0].indexOf("sectionId=" + encodeURIComponent(CASE_A + ":CASE")) !== -1,
    creates[0]
  );
});

// presenceLog is a no-op in Classic, so __ccPresence.whoami() is the only place
// the reason an empty cmsEnv is empty can be read — and it is the question asked
// of a client that registered nothing.
h.test("says why, when there is no environment to be had", function () {
  var top = shell();
  var m = client(top);
  answerWhoami(top, { userEmail: "me@cps.gov.uk", oid: "", cmsEnv: "", cmsEnvWhy: "no-hint" });
  m.tick();

  var who = top.__ccPresence.whoami();
  h.assertEqual(who.cmsEnv, "");
  h.assertEqual(who.cmsEnvWhy, "no-hint");
  h.assertEqual(who.cin, null, "nothing adopted means nothing registered");
  h.assertEqual(sent(top, "create").length, 0, ops(top).join(","));
});

h.describe("a roster for the case you are on");

h.test("puts the stripe up, naming the people", function () {
  var r = onCaseWithCompany();
  h.assertTrue(shown(r.m).indexOf("ann@cps.gov.uk") !== -1, shown(r.m));
});

h.test("counts them for the collapsed summary", function () {
  var top = shell();
  var m = client(top);
  answerWhoami(top, whoamiReply(CMS_ENV));
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

// Same rule for sections the hub sent only because they CONFLICT with ours (here
// case A's review): leaving case A must forget them too. Today only the section
// we held is forgotten, so the review's roster is shown again on coming back.
h.knownBug("coming back to the case does not reuse an old conflict roster", function () {
  var r = onCaseWithCompany();
  r.m.onNotifications(poll(CASE_A, "CASE_REVIEW", [member("bob@cps.gov.uk")]));
  r.top.navigate(caseDetails(CASE_B));
  r.m.tick();
  r.top.navigate(caseDetails(CASE_A));
  r.m.tick();
  h.assertEqual(shown(r.m), "");
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
  answerWhoami(top, whoamiReply(CMS_ENV));
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

h.describe("coming back after a call fails");

// Deliver a reply to the most recent call of one op, through the global callback
// the transport registered, as the response body would when it executed. null is
// what the transport hands over on a timeout.
function replyLast(top, op, payload) {
  var calls = sent(top, op);
  var name = /[?&]callback=([^&]+)/.exec(calls[calls.length - 1])[1];
  top[name](payload);
}

// On the case, registered through the real sessions layer this time rather than
// with onNotifications called by hand, because recovery is the sessions layer
// telling main.js that a section is answering again.
function registeredWithCompany() {
  var top = shell();
  var m = client(top);
  answerWhoami(top, whoamiReply(CMS_ENV));
  m.tick();
  replyLast(top, "create", { sessionId: "S-1" });
  replyLast(top, "poll", poll(CASE_A, "CASE", [member("ann@cps.gov.uk")]));
  replyLast(top, "heartbeat", {});
  return { top: top, m: m };
}

h.test("a timed-out call takes the stripe down", function () {
  var r = registeredWithCompany();
  h.assertTrue(shown(r.m).indexOf("ann@cps.gov.uk") !== -1, "precondition: up");
  r.top.__tick();
  replyLast(r.top, "heartbeat", null);
  h.assertEqual(shown(r.m), "");
});

// THE BUG. Polls return deltas, so the poll after an outage on a quiet case says
// nothing new and the roster does not change. The stripe used to wait for a
// roster change to come back, which on a quiet case could be never.
h.test("the next good answer puts it back, though the roster has not changed", function () {
  var r = registeredWithCompany();
  r.top.__tick();
  replyLast(r.top, "heartbeat", null);
  h.assertEqual(shown(r.m), "", "precondition: down");

  r.top.__tick();
  replyLast(r.top, "heartbeat", {});
  h.assertTrue(shown(r.m).indexOf("ann@cps.gov.uk") !== -1, shown(r.m));
});

h.test("stays down while another held section is still failing", function () {
  var r = registeredWithCompany();
  r.top.navigate(caseDetails(CASE_A), [defendantPanel(CASE_A)]);
  r.m.tick();
  replyLast(r.top, "create", { sessionId: "S-2" });
  var defendantPoll = sent(r.top, "poll");
  r.top.__tick();
  // Fail BOTH heartbeats of this pass, then let only one section recover.
  var beats = sent(r.top, "heartbeat");
  var i, name;
  for (i = beats.length - 2; i < beats.length; i++) {
    name = /[?&]callback=([^&]+)/.exec(beats[i])[1];
    r.top[name](null);
  }
  h.assertEqual(shown(r.m), "", "precondition: down");

  r.top.__tick();
  beats = sent(r.top, "heartbeat");
  name = /[?&]callback=([^&]+)/.exec(beats[beats.length - 1])[1];
  r.top[name]({});
  h.assertEqual(shown(r.m), "", "one section still troubled");
  h.assertTrue(defendantPoll.length > 0);
});

h.describe("the history it keeps");

h.test("records why the stripe went and came back, without touching the console", function () {
  var r = registeredWithCompany();
  r.top.__tick();
  replyLast(r.top, "heartbeat", null);
  r.top.__tick();
  replyLast(r.top, "heartbeat", {});
  var dump = r.top.__ccPresence.dump();
  h.assertTrue(dump.indexOf("UI SHOW 1 person reason=roster changed") !== -1, dump);
  h.assertTrue(dump.indexOf("UI HIDE reason=trouble heartbeat") !== -1, dump);
  h.assertTrue(dump.indexOf("trouble START heartbeat") !== -1, dump);
  h.assertTrue(dump.indexOf("recovered") !== -1, dump);
  h.assertTrue(dump.indexOf("UI SHOW 1 person reason=calls answering again") !== -1, dump);
  h.assertTrue(dump.indexOf("ann@cps.gov.uk") === -1, "addresses are masked in the history");
  // Nothing from the buffer reaches the console unasked. The console lines that
  // remain are the two deliberate one-off notices: the first failure, and (in
  // these fake frames, which have no footer) the unplaceable stripe.
  var printed = r.top.__logged.join(" | ");
  h.assertTrue(printed.indexOf("[cc-presence]") === -1, printed);
  h.assertTrue(printed.indexOf("There was an error connecting") !== -1, printed);
});

h.test("setConsole(true) echoes new lines", function () {
  var r = registeredWithCompany();
  r.top.__ccPresence.setConsole(true);
  r.top.navigate(frame(BASE + "Tasks/uatlTaskList.aspx"));
  r.m.tick();
  var printed = r.top.__logged.join("\n");
  h.assertTrue(printed.indexOf("[cc-presence] sections (none)") !== -1, printed);
});

h.test("a refused credential asks how old the token is", function () {
  var r = registeredWithCompany();
  var before = sent(r.top, "whoami").length;
  r.top.__tick();
  replyLast(r.top, "poll", { jsonpError: "upstream 401" });
  h.assertEqual(sent(r.top, "whoami").length, before + 1);
});

h.summarise();
