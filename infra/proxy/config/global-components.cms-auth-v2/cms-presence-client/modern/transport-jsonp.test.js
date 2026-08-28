/* Unit tests for modern/transport-jsonp.js — the session lifecycle.
 *
 * The transport talks to the server only by appending <script> tags and waiting
 * for a global callback, so a fake document plus the callback names it puts on
 * window is a complete stand-in for the network: every response below is fired
 * exactly the way the real JSONP reply would fire it.
 *
 * The behaviour that earns its tests is the failure handling, because it is the
 * part nobody sees until the day it matters: a 410 has to rebuild the session, a
 * timeout has to be survivable, and a reply belonging to a session we have since
 * left must not resurrect it.
 */
var h = require("../test-harness");

var BASE = "https://polaris-uat-notprod.cps.gov.uk/global-components/presence-jsonp";
var SECTION = "2148456:CASE";

function rig() {
  var win = h.fakeWindow();
  var doc = h.fakeDocument([]);
  var logged = [];
  var resets = 0;
  var notifications = [];

  var m = h.load(
    ["common/presence-sections.js", "common/presence-origin.js", "common/presence-jsonp.js", "modern/transport-jsonp.js"],
    ["CCPTransportJsonp"],
    { window: win, document: doc }
  );

  var transport = m.CCPTransportJsonp.create({
    base: BASE,
    appName: "CMS Modern",
    timeoutMs: 8000,
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
    onReset: function () {
      resets = resets + 1;
    }
  });

  // Every request the transport has made, newest last, as {op, url, reply}.
  function calls() {
    var out = [];
    for (var i = 0; i < doc.__appended.length; i++) {
      var url = doc.__appended[i].src;
      out.push({
        url: url,
        op: /[?&]op=([^&]*)/.exec(url)[1],
        // Fire the response the server would have sent.
        reply: (function (name) {
          return function (data) {
            win[name](data);
          };
        })(/[?&]callback=([^&]*)/.exec(url)[1])
      });
    }
    return out;
  }

  function lastOf(op) {
    var all = calls();
    for (var i = all.length - 1; i >= 0; i--) {
      if (all[i].op === op) {
        return all[i];
      }
    }
    return null;
  }

  return {
    transport: transport,
    calls: calls,
    lastOf: lastOf,
    ops: function () {
      var all = calls();
      var out = [];
      for (var i = 0; i < all.length; i++) {
        out.push(all[i].op);
      }
      return out;
    },
    notifications: notifications,
    logged: logged,
    resets: function () {
      return resets;
    },
    // start, then answer the create with a session — the state everything else
    // in these tests begins from.
    connect: function (sectionId) {
      transport.start(sectionId || SECTION);
      lastOf("create").reply({ sessionId: "S1" });
    }
  };
}

var NOTIFICATIONS = [
  { payload: { snapshots: [{ section: { caseId: "2148456", kind: "CASE" }, version: 4, members: [{ userEmail: "a@cps.gov.uk", sourceApplication: "CMS Modern" }] }] } }
];

h.describe("creating a session");

h.test("asks for the section we were given, as the app we are", function () {
  var r = rig();
  r.transport.start(SECTION);
  var create = r.lastOf("create");
  h.assertTrue(create.url.indexOf(BASE + "?op=create") === 0);
  h.assertTrue(create.url.indexOf("sectionId=2148456%3ACASE") !== -1);
  h.assertTrue(create.url.indexOf("appName=CMS%20Modern") !== -1);
});

h.test("starts beating immediately rather than waiting out the first interval", function () {
  var r = rig();
  r.connect();
  h.assertEqual(r.ops(), ["create", "heartbeat", "poll"]);
});

h.test("a create that fails leaves us quiet — no session, so nothing to beat", function () {
  var r = rig();
  r.transport.start(SECTION);
  r.lastOf("create").reply({ jsonpError: "500 upstream" });
  h.assertEqual(r.ops(), ["create"]);
});

h.test("a create that times out is the same", function () {
  var r = rig();
  r.transport.start(SECTION);
  r.lastOf("create").reply(null);
  h.assertEqual(r.ops(), ["create"]);
});

h.describe("polling");

h.test("hands the response to the shell untouched — the roster does the interpreting", function () {
  var r = rig();
  r.connect();
  r.lastOf("poll").reply(NOTIFICATIONS);
  h.assertEqual(r.notifications.length, 1);
  h.assertEqual(r.notifications[0], NOTIFICATIONS);
});

h.test("a timed-out poll changes nothing — the rosters we hold stand until contradicted", function () {
  var r = rig();
  r.connect();
  r.lastOf("poll").reply(null);
  h.assertEqual(r.notifications.length, 0);
  h.assertEqual(r.resets(), 0);
});

h.describe("a session the Watchdog has forgotten (410)");

h.test("is rebuilt on the same section", function () {
  var r = rig();
  r.connect();
  r.lastOf("heartbeat").reply({ jsonpError: "410 Gone" });
  var create = r.lastOf("create");
  h.assertTrue(create.url.indexOf("sectionId=2148456%3ACASE") !== -1);
  h.assertEqual(r.ops(), ["create", "heartbeat", "poll", "remove", "create"]);
});

h.test("drops the roster on the way — it described a session that no longer exists", function () {
  var r = rig();
  r.connect();
  r.lastOf("heartbeat").reply({ jsonpError: "410 Gone" });
  h.assertEqual(r.resets(), 1);
});

h.test("any OTHER heartbeat error keeps the session — we differ from Classic here deliberately", function () {
  var r = rig();
  r.connect();
  r.lastOf("heartbeat").reply({ jsonpError: "502 Bad Gateway" });
  h.assertEqual(r.ops(), ["create", "heartbeat", "poll"]);
});

h.describe("leaving");

h.test("tells the server rather than making it wait out the TTL", function () {
  var r = rig();
  r.connect();
  r.transport.stop();
  h.assertTrue(r.lastOf("remove").url.indexOf("sid=S1") !== -1);
  h.assertEqual(r.resets(), 1);
});

h.test("with no session there is nothing to remove", function () {
  var r = rig();
  r.transport.stop();
  h.assertEqual(r.ops(), []);
});

h.describe("replies that arrive after we have moved on");

h.test("a create for a section we have left does not start a session on it", function () {
  var r = rig();
  r.transport.start(SECTION);
  var stale = r.lastOf("create");
  r.transport.stop();
  stale.reply({ sessionId: "S-STALE" });
  h.assertEqual(r.ops(), ["create"]); // no heartbeat, no poll
});

h.test("a poll belonging to a superseded session is ignored", function () {
  var r = rig();
  r.connect();
  var stalePoll = r.lastOf("poll");
  r.lastOf("heartbeat").reply({ jsonpError: "410 Gone" }); // new session from here on
  r.lastOf("create").reply({ sessionId: "S2" });
  stalePoll.reply(NOTIFICATIONS);
  h.assertEqual(r.notifications.length, 0);
});

h.summarise();
