/* Unit tests for common/presence-sessions.js — the session set.
 *
 * These talk to the real JSONP layer, because the two are only meaningful
 * together: a fake document collects the <script> tags, and each response is
 * fired through the global callback exactly as a real JSONP reply would fire it.
 *
 * The behaviour worth testing is the diffing and the failure handling — a section
 * that arrives, one that goes, one the server forgets — because none of it is
 * visible until the day it matters.
 */
var h = require("../../test-harness");

var BASE = "https://polaris-uat-notprod.cps.gov.uk/global-components/presence-jsonp";
var A = "2148456:CASE";
var B = "2148456:VICTIM_WITNESS:98765";

function rig(overrides) {
  var win = h.fakeWindow();
  var doc = h.fakeDocument([]);
  var dropped = [];
  var notifications = [];
  var logged = [];

  var m = h.load(
    ["legacy-apps/common/presence-sections.js", "legacy-apps/common/presence-jsonp.js", "legacy-apps/common/presence-sessions.js"],
    ["CCPSessions", "CCPJsonp"],
    { window: win, document: doc }
  );

  var options = {
    call: m.CCPJsonp.createJsonp({ base: BASE, appName: "CMS Modern", timeoutMs: 8000, log: function () {} }),
    appName: "CMS Modern",
    tickMs: 3000,
    log: function () {
      logged.push(Array.prototype.slice.call(arguments).join(" "));
    },
    verbose: function () {
      return false;
    },
    onNotifications: function (list) {
      notifications.push(list);
    },
    onSectionDropped: function (id) {
      dropped.push(id);
    }
  };
  for (var key in overrides || {}) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      options[key] = overrides[key];
    }
  }

  var sessions = m.CCPSessions.createSessions(options);

  // Every request made so far, as {op, section-or-sid, reply}.
  function calls() {
    var out = [];
    for (var i = 0; i < doc.__appended.length; i++) {
      var url = doc.__appended[i].src;
      out.push({
        url: url,
        op: /[?&]op=([^&]*)/.exec(url)[1],
        arg: decodeURIComponent((/[?&](?:sectionId|sid)=([^&]*)/.exec(url) || [, ""])[1]),
        reply: (function (name) {
          return function (data) {
            win[name](data);
          };
        })(/[?&]callback=([^&]*)/.exec(url)[1])
      });
    }
    return out;
  }

  function opsFor(arg) {
    var all = calls();
    var out = [];
    for (var i = 0; i < all.length; i++) {
      // create carries a sectionId; heartbeat/poll/remove carry the session id,
      // which this rig always builds as "S-<sectionId>".
      var section = all[i].arg.indexOf("S-") === 0 ? all[i].arg.substring(2) : all[i].arg;
      if (section === arg) {
        out.push(all[i].op);
      }
    }
    return out;
  }

  function last(op, arg) {
    var all = calls();
    for (var i = all.length - 1; i >= 0; i--) {
      if (all[i].op === op && (arg === undefined || all[i].arg === arg)) {
        return all[i];
      }
    }
    return null;
  }

  return {
    sessions: sessions,
    window: win,
    calls: calls,
    opsFor: opsFor,
    last: last,
    dropped: dropped,
    notifications: notifications,
    logged: logged,
    ops: function () {
      var all = calls();
      var out = [];
      for (var i = 0; i < all.length; i++) {
        out.push(all[i].op + ":" + all[i].arg);
      }
      return out;
    },
    // Desire these sections and answer every outstanding create with a session id.
    join: function (ids) {
      sessions.setDesired(ids);
      for (var i = 0; i < ids.length; i++) {
        var create = last("create", ids[i]);
        if (create) {
          create.reply({ sessionId: "S-" + ids[i] });
        }
      }
    }
  };
}

var NOTIFICATIONS = [{ payload: { snapshots: [{ section: { caseId: "2148456", kind: "CASE" }, version: 1, members: [] } ] } }];

h.describe("holding the desired set");

h.test("a new section is created at once, not on the next interval", function () {
  var r = rig();
  r.sessions.setDesired([A]);
  h.assertEqual(r.opsFor(A), ["create"]);
});

h.test("a session starts beating as soon as it exists", function () {
  var r = rig();
  r.join([A]);
  h.assertEqual(r.opsFor(A), ["create", "heartbeat", "poll"]);
});

h.test("several sections are held at once — the point of the exercise", function () {
  var r = rig();
  r.join([A, B]);
  h.assertEqual(r.opsFor(A), ["create", "heartbeat", "poll"]);
  h.assertEqual(r.opsFor(B), ["create", "heartbeat", "poll"]);
  h.assertEqual(r.sessions.ids(), [A, B]);
});

h.test("re-asserting the same set touches nothing — no churn from the reconcile loop", function () {
  var r = rig();
  r.join([A]);
  var before = r.ops().length;
  r.sessions.setDesired([A]);
  r.sessions.setDesired([A]);
  h.assertEqual(r.ops().length, before);
});

h.test("adding a section leaves the existing one's session alone", function () {
  var r = rig();
  r.join([A]);
  r.sessions.setDesired([A, B]);
  h.assertEqual(r.opsFor(A), ["create", "heartbeat", "poll"]); // no second create
  h.assertEqual(r.opsFor(B), ["create"]);
});

h.test("a section that goes away is removed server-side and forgotten locally", function () {
  var r = rig();
  r.join([A, B]);
  r.sessions.setDesired([A]);
  h.assertEqual(r.last("remove").arg, "S-" + B);
  h.assertEqual(r.dropped, [B]);
  h.assertEqual(r.sessions.ids(), [A]);
});

h.describe("the recurring pass");

h.test("beats every held section", function () {
  var r = rig();
  r.join([A, B]);
  r.window.__tick();
  h.assertEqual(r.opsFor(A), ["create", "heartbeat", "poll", "heartbeat", "poll"]);
  h.assertEqual(r.opsFor(B), ["create", "heartbeat", "poll", "heartbeat", "poll"]);
});

h.test("retries a create that failed, rather than leaving the section unregistered", function () {
  var r = rig();
  r.sessions.setDesired([A]);
  r.last("create", A).reply({ jsonpError: "500 upstream" });
  r.window.__tick();
  h.assertEqual(r.opsFor(A), ["create", "create"]);
});

h.test("stops ticking once nothing is desired", function () {
  var r = rig();
  r.join([A]);
  r.sessions.setDesired([]);
  var before = r.ops().length;
  r.window.__tick();
  h.assertEqual(r.ops().length, before);
});

h.describe("a session the Watchdog has forgotten (410)");

h.test("drops that section's roster — it is no longer evidence of anything", function () {
  var r = rig();
  r.join([A, B]);
  r.last("heartbeat", "S-" + A).reply({ jsonpError: "410 Gone" });
  h.assertEqual(r.dropped, [A]);
});

h.test("is recreated on the next pass, and only that section", function () {
  var r = rig();
  r.join([A, B]);
  r.last("heartbeat", "S-" + A).reply({ jsonpError: "410 Gone" });
  r.window.__tick();
  h.assertEqual(r.opsFor(A), ["create", "heartbeat", "poll", "create"]);
  h.assertEqual(r.opsFor(B), ["create", "heartbeat", "poll", "heartbeat", "poll"]);
});

h.test("any other heartbeat error keeps the session by default", function () {
  var r = rig();
  r.join([A]);
  r.last("heartbeat").reply({ jsonpError: "502 Bad Gateway" });
  h.assertEqual(r.dropped, []);
  h.assertEqual(r.sessions.ids(), [A]);
});

h.test("...unless dropSectionOnError is set — Classic's original behaviour", function () {
  var r = rig({ dropSectionOnError: true });
  r.join([A]);
  r.last("heartbeat").reply({ jsonpError: "502 Bad Gateway" });
  h.assertEqual(r.dropped, [A]);
  h.assertEqual(r.sessions.ids(), []);
});

h.describe("polling");

h.test("hands the response on untouched — the roster does the interpreting", function () {
  var r = rig();
  r.join([A]);
  r.last("poll").reply(NOTIFICATIONS);
  h.assertEqual(r.notifications, [NOTIFICATIONS]);
});

h.test("a timed-out poll changes nothing", function () {
  var r = rig();
  r.join([A]);
  r.last("poll").reply(null);
  h.assertEqual(r.notifications.length, 0);
  h.assertEqual(r.dropped, []);
});

h.describe("replies that arrive after we have moved on");

h.test("a create for a section we have left does not start a session", function () {
  var r = rig();
  r.sessions.setDesired([A]);
  var stale = r.last("create", A);
  r.sessions.setDesired([]);
  stale.reply({ sessionId: "S-STALE" });
  h.assertEqual(r.opsFor(A), ["create"]);
  h.assertEqual(r.ops(), ["create:" + A]); // no heartbeat, no poll, nothing
});

h.test("a poll belonging to a superseded session is ignored", function () {
  var r = rig();
  r.join([A]);
  var stalePoll = r.last("poll");
  r.last("heartbeat").reply({ jsonpError: "410 Gone" }); // sessionId cleared
  stalePoll.reply(NOTIFICATIONS);
  h.assertEqual(r.notifications.length, 0);
});

h.describe("leaving");

h.test("stop() removes every session", function () {
  var r = rig();
  r.join([A, B]);
  r.sessions.stop();
  var removes = [];
  var all = r.calls();
  for (var i = 0; i < all.length; i++) {
    if (all[i].op === "remove") {
      removes.push(all[i].arg);
    }
  }
  h.assertEqual(removes.length, 2);
  h.assertEqual(r.sessions.ids(), []);
  h.assertEqual(r.dropped.length, 2);
});

h.describe("telling the client something did not answer");

// onTrouble is opt-in and says nothing about retrying — the retry happens either
// way. Classic takes its footer stripe down on it, because a stale roster beside
// CMS's own controls reads as fact; Modern passes no handler and keeps its banner.
function troubleRig() {
  var trouble = [];
  var r = rig({
    onTrouble: function (sectionId, reason) {
      trouble.push(sectionId + " " + reason);
    }
  });
  r.trouble = trouble;
  return r;
}

h.test("a create that failed is reported, with the reason", function () {
  var r = troubleRig();
  r.sessions.setDesired([A]);
  r.last("create", A).reply({ jsonpError: "500 Internal Server Error" });
  h.assertEqual(r.trouble, [A + " 500 Internal Server Error"]);
});

h.test("a timeout is reported even though it is otherwise shrugged off", function () {
  var r = troubleRig();
  r.join([A]);
  r.last("heartbeat").reply(null);
  h.assertEqual(r.trouble, [A + " no response (timeout)"]);
});

h.test("a poll that failed is reported", function () {
  var r = troubleRig();
  r.join([A]);
  r.last("poll").reply({ jsonpError: "401 Unauthorized" });
  h.assertEqual(r.trouble, [A + " 401 Unauthorized"]);
});

// A 410 is ordinary churn, not a fault: the session is dropped and recreated, and
// the roster follows from the drop. Reporting it would put an error in front of a
// user for something that fixed itself on the next pass.
h.test("an expired session is NOT reported as trouble", function () {
  var r = troubleRig();
  r.join([A]);
  r.last("heartbeat").reply({ jsonpError: "410 Gone" });
  h.assertEqual(r.trouble, []);
  h.assertEqual(r.dropped, [A]);
});

h.test("a client that passes no handler is unaffected by any of it", function () {
  var r = rig();
  r.join([A]);
  r.last("heartbeat").reply(null);
  r.last("poll").reply({ jsonpError: "500 Internal Server Error" });
  h.assertEqual(r.dropped, []); // still held, still retried
  h.assertEqual(r.sessions.ids(), [A]);
});

h.describe("a troubled run, start to finish");

// The log has to survive an outage: a line per failed call would push the start
// of it out of the ring buffer within minutes. So a run is one START and one
// "recovered", with the calls in between counted.
function withRecovery() {
  var recovered = [];
  var trouble = [];
  var r = rig({
    onTrouble: function (sectionId, reason, op) {
      trouble.push(op + " " + sectionId + " " + reason);
    },
    onRecovered: function (sectionId, ms) {
      recovered.push(sectionId + " " + (typeof ms));
    }
  });
  r.recovered = recovered;
  r.trouble = trouble;
  return r;
}

function count(list, fragment) {
  var n = 0;
  for (var i = 0; i < list.length; i++) {
    if (list[i].indexOf(fragment) !== -1) {
      n = n + 1;
    }
  }
  return n;
}

h.test("onTrouble is told which call failed", function () {
  var r = withRecovery();
  r.join([A]);
  r.last("heartbeat").reply(null);
  h.assertEqual(r.trouble, ["heartbeat " + A + " no response (timeout)"]);
});

h.test("a run of failures is logged once, and its end once", function () {
  var r = withRecovery();
  r.join([A]);
  r.last("heartbeat").reply(null);
  r.last("poll").reply(null);
  r.window.__tick();
  r.last("heartbeat").reply(null);
  r.last("poll").reply(null);
  h.assertEqual(count(r.logged, "trouble START"), 1, r.logged.join("\n"));
  h.assertEqual(r.sessions.anyTroubled(), true);

  r.window.__tick();
  r.last("heartbeat").reply({});
  h.assertEqual(count(r.logged, "recovered " + A), 1, r.logged.join("\n"));
  h.assertTrue(r.logged.join("\n").indexOf("4 failed call(s)") !== -1, r.logged.join("\n"));
  h.assertEqual(r.recovered, [A + " number"]);
  h.assertEqual(r.sessions.anyTroubled(), false);
});

h.test("a change of reason mid-run is logged", function () {
  var r = withRecovery();
  r.join([A]);
  r.last("heartbeat").reply(null);
  r.last("poll").reply({ jsonpError: "upstream 401" });
  h.assertEqual(count(r.logged, "trouble START"), 1);
  h.assertEqual(count(r.logged, "upstream 401"), 1, r.logged.join("\n"));
});

h.test("a healthy section never reports a recovery", function () {
  var r = withRecovery();
  r.join([A]);
  r.last("heartbeat").reply({});
  r.last("poll").reply([]);
  h.assertEqual(r.recovered, []);
});

h.test("stats name the troubled section and count the timeouts", function () {
  var r = withRecovery();
  r.join([A, B]);
  r.last("heartbeat", "S-" + A).reply(null);
  var stats = r.sessions.stats();
  h.assertEqual(stats.timeouts, 1);
  h.assertEqual(stats.troubled.length, 1);
  h.assertTrue(stats.troubled[0].indexOf(A) === 0, stats.troubled[0]);
  h.assertEqual(stats.lastTrouble.op, "heartbeat");
});

h.test("the 410 line says how long the section had gone unheard", function () {
  var r = withRecovery();
  r.join([A]);
  r.last("heartbeat").reply({ jsonpError: "upstream 410" });
  h.assertTrue(r.logged.join("\n").indexOf("good heartbeat(s)") !== -1, r.logged.join("\n"));
});

h.describe("what the client asked to hold");

h.test("logs each change to the desired set, and not a repeat", function () {
  var r = rig();
  r.sessions.setDesired([A]);
  r.sessions.setDesired([A]);
  r.sessions.setDesired([B]);
  h.assertEqual(count(r.logged, "desired"), 2, r.logged.join("\n"));
  h.assertTrue(r.logged.join("\n").indexOf("+" + B) !== -1);
  h.assertTrue(r.logged.join("\n").indexOf("-" + A) !== -1);
});

h.describe("a pass the browser held back");

// The fake window's interval runs only when told, so a held-back timer is made by
// moving the clock between two passes.
h.test("is logged with how late it was, and counted", function () {
  var r = rig();
  r.join([A]);
  var realDate = Date;
  var base = new realDate().getTime();
  try {
    global.Date = function () {
      return new realDate(base + 60000);
    };
    global.Date.UTC = realDate.UTC;
    r.window.__tick();
  } finally {
    global.Date = realDate;
  }
  h.assertEqual(count(r.logged, "tick late by"), 1, r.logged.join("\n"));
  h.assertEqual(r.sessions.stats().lateTicks, 1);
});

h.test("an on-time pass says nothing", function () {
  var r = rig();
  r.join([A]);
  r.window.__tick();
  h.assertEqual(count(r.logged, "tick late by"), 0, r.logged.join("\n"));
});

h.describe("the pass, at document mode 5");

// WHY THIS IS HERE. stats.lastTickAt was stamped with Date.prototype.toISOString —
// an ES5 method document mode 5 does not have — as the FIRST statement of the pass,
// inside the try/catch that exists so a throw cannot kill the interval. In CMS
// Classic it threw on every pass and the catch hid it: createSession is called
// directly by setDesired so presence came up once and a roster could be read out of
// it, and then nothing ever beat, polled or recovered from a 410 again. Modern and
// DCF are mode 11, where the method exists, so only Classic was affected.
//
// Asserted by SIMULATING the missing method rather than by trusting a comment:
// check-syntax.js now bans the name, but a test is what proves the pass does not
// need it.
h.test("keeps beating when Date.prototype.toISOString does not exist", function () {
  var real = Date.prototype.toISOString;
  try {
    delete Date.prototype.toISOString;
    var r = rig();
    r.join([A]);
    var before = r.opsFor(A).length;
    r.window.__tick();
    h.assertTrue(r.opsFor(A).length > before, "the pass must still heartbeat and poll: " + r.opsFor(A).join(","));
    h.assertTrue(r.sessions.stats().lastTickAt !== null, "and must still stamp itself");
  } finally {
    Date.prototype.toISOString = real;
  }
});

h.test("stamps an ISO-8601 UTC time to the second", function () {
  var stamp = rig().sessions.stats().lastTickAt;
  h.assertEqual(stamp, null, "no pass has run yet");
  var r = rig();
  r.join([A]);
  r.window.__tick();
  stamp = r.sessions.stats().lastTickAt;
  h.assertTrue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(stamp), stamp);
  h.assertTrue(Math.abs(new Date().getTime() - new Date(stamp).getTime()) < 10000, stamp);
});

h.summarise();
