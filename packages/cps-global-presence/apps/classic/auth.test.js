/* Unit tests for classic/auth.js — WHEN the auth iframe is spawned.
 *
 * This file had no tests until 2026-11-05, when the single-shot spawn became a
 * recurring replay. The whole subject is timing, and timing is exactly what will
 * not be noticed going wrong in production: a replay that never fires looks
 * identical to one that fires and fails, which looks identical to working presence
 * on a quiet case. So the schedule is pinned here rather than trusted.
 *
 * WHAT IS ASSERTED is appended iframes, read off the fake document — that is the
 * file's entire output. It builds one node, points it at a path and attaches it;
 * everything else (the AD round trip, the cookie) is server-side and belongs to the
 * njs suites. Nothing here asserts success, because auth.js cannot observe success:
 * see its header on why the answer comes back via whoami instead.
 *
 * THE CLOCK IS STUBBED, globally, for the duration. auth.js reads time through
 * `new Date().getTime()` (Date.now does not exist at document mode 5), and the
 * intervals under test are tens of minutes, so the alternative is a test that takes
 * 45 minutes to fail. Only auth.js and kill-switch.js are loaded, so nothing else in
 * the package sees the stub.
 */
var fs = require("fs");
var path = require("path");
var h = require("../../test-harness");

var MINUTE = 60 * 1000;
var REPLAY_INTERVAL = 45 * MINUTE; // must match auth.js
var APP = "https://cms.example/CMS.24.0.01/uagvCase.aspx";
var LOGIN = "https://cms.example/CMS.24.0.01/uaulLogin.aspx";

// ---- a stubbed clock --------------------------------------------------------
// Replaces the global Date for the files under test. getTime() is the only method
// auth.js uses; anything else would throw loudly rather than quietly return a real
// time, which is the failure we would want.

var RealDate = Date;
var clock = 0;

function installClock() {
  clock = 1762300000000;
  global.Date = function () {
    return {
      getTime: function () {
        return clock;
      }
    };
  };
}

function advance(ms) {
  clock = clock + ms;
}

function restoreClock() {
  global.Date = RealDate;
}

// ---- the CMS shell, as auth.js reads it -------------------------------------
// window.frames, indexed BOTH ways: numerically for listFrames and by name for
// mainFrameHref, which is how the real frameset presents itself.

function shell(mainHref) {
  var main = { name: "frameMain", location: { href: mainHref } };
  var frames = [main];
  frames.frameMain = main;
  return frames;
}

// A frameMain whose location THROWS, the "can't read it this tick" case. Real: the
// frame is mid-navigation, or briefly cross-origin.
function unreadableShell() {
  var main = { name: "frameMain" };
  Object.defineProperty(main, "location", {
    get: function () {
      throw new Error("Access is denied.");
    }
  });
  var frames = [main];
  frames.frameMain = main;
  return frames;
}

/**
 * Load kill-switch.js + auth.js into one scope, as build.sh concatenates them, and
 * hand back the handles the tests need.
 *
 * @param {string} mainHref the initial frameMain URL
 */
function boot(mainHref) {
  installClock();
  var w = h.fakeWindow();
  var doc = h.fakeDocument();
  w.frames = shell(mainHref);
  h.load(
    ["apps/classic/kill-switch.js", "apps/classic/auth.js"],
    ["CMS_WATCHDOG_ENABLED"],
    { window: w, document: doc }
  );
  return {
    window: w,
    document: doc,
    api: w.__ccAuthHandover,
    // Each spawn appends exactly one iframe, so this is the spawn count.
    spawns: function () {
      return doc.__appended.length;
    },
    // Run the 1s poll n times. The clock does NOT move on its own: callers advance
    // it deliberately, so every test says which elapsed time it is testing.
    tick: function (n) {
      var i;
      for (i = 0; i < (n || 1); i++) {
        w.__tick();
      }
    },
    // Walk frameMain from the login page to the app — the edge auth.js fires on.
    logIn: function () {
      w.frames.frameMain.location.href = LOGIN;
      w.__tick();
      w.frames.frameMain.location.href = APP;
      w.__tick();
    }
  };
}

// =============================================================================
h.describe("the login edge");

h.test("nothing is spawned merely by loading", function () {
  var s = boot(APP);
  s.tick(5);
  h.assertEqual(s.spawns(), 0, "the shell boots before login completes");
  restoreClock();
});

h.test("leaving the login page spawns the auth iframe", function () {
  var s = boot(APP);
  s.logIn();
  h.assertEqual(s.spawns(), 1);
  restoreClock();
});

h.test("sitting on the login page does not spawn", function () {
  var s = boot(LOGIN);
  s.tick(10);
  h.assertEqual(s.spawns(), 0, "the edge is leaving login, not being on it");
  restoreClock();
});

h.test("the iframe points at the auth entry and is hidden", function () {
  var s = boot(APP);
  s.logIn();
  var f = s.document.__appended[0];
  h.assertEqual(f.src, "/polaris?terminal=iframe", "RELATIVE: the capture needs same-origin");
  h.assertEqual(f.style.display, "none");
  restoreClock();
});

// =============================================================================
h.describe("re-authenticating in the same shell");

// The old code cleared the poll on the first spawn, so this was silently
// impossible: log out, log back in, and nothing was captured for the new session.
h.test("a second login edge spawns again", function () {
  var s = boot(APP);
  s.logIn();
  s.logIn();
  h.assertEqual(s.spawns(), 2, "the poll must outlive the first spawn");
  restoreClock();
});

h.test("the poll keeps running long after the first spawn", function () {
  var s = boot(APP);
  s.logIn();
  s.tick(30);
  h.assertEqual(s.window.__intervals[0] !== null, true, "interval still live");
  restoreClock();
});

// =============================================================================
h.describe("the replay");

h.test("does not fire before the interval is up", function () {
  var s = boot(APP);
  s.logIn();
  advance(REPLAY_INTERVAL - 1000);
  s.tick();
  h.assertEqual(s.spawns(), 1, "one short of the interval is still too early");
  restoreClock();
});

h.test("fires once the interval is up", function () {
  var s = boot(APP);
  s.logIn();
  advance(REPLAY_INTERVAL);
  s.tick();
  h.assertEqual(s.spawns(), 2);
  restoreClock();
});

// The clock is read, not the tick count, so a tab that was throttled or asleep
// replays once on waking rather than once per interval it slept through.
h.test("a long gap replays once, not once per interval missed", function () {
  var s = boot(APP);
  s.logIn();
  advance(5 * REPLAY_INTERVAL);
  s.tick();
  h.assertEqual(s.spawns(), 2, "one catch-up, not five");
  restoreClock();
});

h.test("keeps replaying for as long as the shell lives", function () {
  var s = boot(APP);
  s.logIn();
  var i;
  for (i = 0; i < 4; i++) {
    advance(REPLAY_INTERVAL);
    s.tick();
  }
  h.assertEqual(s.spawns(), 5, "the login spawn plus four replays");
  restoreClock();
});

// Nothing to refresh before the first login: a shell sitting on the login page for
// an hour must not start a round trip per interval against no session.
h.test("does not start before anything has ever spawned", function () {
  var s = boot(LOGIN);
  advance(10 * REPLAY_INTERVAL);
  s.tick(5);
  h.assertEqual(s.spawns(), 0);
  restoreClock();
});

// The replay clock is reset by ANY spawn, so a login resets it too — otherwise a
// login at minute 44 would be followed by a redundant replay a minute later.
h.test("a login edge pushes the next replay out", function () {
  var s = boot(APP);
  s.logIn();
  advance(REPLAY_INTERVAL - 5 * MINUTE);
  s.logIn(); // spawn 2, and the clock restarts here
  advance(10 * MINUTE);
  s.tick();
  h.assertEqual(s.spawns(), 2, "10 minutes after the last spawn is not due");
  advance(REPLAY_INTERVAL - 10 * MINUTE);
  s.tick();
  h.assertEqual(s.spawns(), 3);
  restoreClock();
});

// The token expires whether or not the shell is readable, so the replay must not be
// hostage to the frame read that the login edge needs.
h.test("fires even when frameMain cannot be read", function () {
  var s = boot(APP);
  s.logIn();
  s.window.frames = unreadableShell();
  advance(REPLAY_INTERVAL);
  s.tick();
  h.assertEqual(s.spawns(), 2);
  restoreClock();
});

// =============================================================================
h.describe("the console handles");

h.test("runNow forces a spawn", function () {
  var s = boot(APP);
  s.api.runNow();
  h.assertEqual(s.spawns(), 1);
  restoreClock();
});

// runNow stamps the clock like any other spawn, so a manual probe does not leave
// the replay firing on the very next tick.
h.test("runNow starts the replay clock", function () {
  var s = boot(LOGIN);
  s.api.runNow();
  s.tick();
  h.assertEqual(s.spawns(), 1, "not due yet");
  advance(REPLAY_INTERVAL);
  s.tick();
  h.assertEqual(s.spawns(), 2);
  restoreClock();
});

h.test("debug reports the replay state", function () {
  var s = boot(APP);
  s.logIn();
  advance(5 * MINUTE);
  var d = s.api.debug();
  h.assertEqual(d.spawns, 1);
  h.assertEqual(d.replayIntervalMs, REPLAY_INTERVAL);
  h.assertEqual(d.replayInMs, REPLAY_INTERVAL - 5 * MINUTE);
  restoreClock();
});

h.test("debug says the replay clock has not started yet", function () {
  var s = boot(LOGIN);
  s.tick();
  h.assertEqual(s.api.debug().replayInMs, -1, "-1, not a stale interval");
  h.assertEqual(s.api.debug().spawns, 0);
  restoreClock();
});

// =============================================================================
h.describe("the kill switch");

// Built by hand rather than through the harness: the point is a FALSE
// CMS_WATCHDOG_ENABLED, and the only kill-switch.js on disk says true. This is the
// operator's sole emergency control over a guest script in someone else's
// application, so it is worth pinning that auth.js honours it.
h.test("off means no handle, no timer and no iframe", function () {
  installClock();
  var w = h.fakeWindow();
  var doc = h.fakeDocument();
  w.frames = shell(APP);
  var src = fs.readFileSync(
    path.join(__dirname, "auth.js"),
    "utf8"
  );
  new Function("window", "document", "var CMS_WATCHDOG_ENABLED = false;\n" + src)(w, doc);
  h.assertEqual(w.__ccAuthHandover, undefined, "no console handle");
  h.assertEqual(w.__intervals.length, 0, "no poll started");
  h.assertEqual(doc.__appended.length, 0, "nothing appended");
  restoreClock();
});

h.summarise();
