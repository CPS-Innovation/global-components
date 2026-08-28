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
var h = require("../test-harness");

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
    ["common/presence-sections.js", "common/presence-jsonp.js", "common/presence-sessions.js"],
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

h.summarise();
