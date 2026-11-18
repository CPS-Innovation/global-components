/* Unit tests for platform/launcher.js — the rules every feature shares.
 *
 * The platform is faked, because the subject is when features run, not who the
 * reader is. The composition with the real platform is covered by each host's
 * main.test.js.
 */
var h = require("../test-harness");

// A launcher on a fake platform. `state.rollout` is what inRollout() answers.
function boot(factories, switchedOff) {
  var win = h.fakeWindow();
  var state = { rollout: true, refreshes: 0, created: 0, lines: [] };
  win.__state = state;
  var prelude =
    "var LEGACY_CLIENT_AUGMENTATION_ENABLED = " + (switchedOff ? "false" : "true") + ";" +
    "var CCPPlatform = { createPlatform: function (o) { return window.__fake(o); } };";
  win.__fake = function (o) {
    state.created = state.created + 1;
    return {
      appName: o.appName,
      base: "/base",
      log: function () {
        state.lines.push([].slice.call(arguments).join(" "));
      },
      logBuffer: { dump: function () { return state.lines.join("\n"); } },
      inRollout: function () { return state.rollout; },
      refresh: function () { state.refreshes = state.refreshes + 1; },
      whoami: function () { return {}; }
    };
  };
  var m = h.load(["platform/launcher.js"], ["CCPLauncher"], { window: win, prelude: prelude });
  return { win: win, state: state, client: m.CCPLauncher.launch({ appName: "Test", features: factories }) };
}

// A feature that records its lifecycle, with a gate the test controls.
function recorder(name, open) {
  var f = {
    name: name,
    open: open,
    calls: [],
    gate: function () { return f.open; },
    observe: function () { f.calls.push("observe"); },
    start: function () { f.calls.push("start"); },
    pass: function () { f.calls.push("pass"); },
    stop: function () { f.calls.push("stop"); }
  };
  return f;
}

function lifecycle(f) {
  return f.calls.filter(function (c) { return c !== "observe"; });
}

function factory(f) {
  return function () { return f; };
}

h.describe("the kill switch");

h.test("off: nothing is created, scheduled or exposed", function () {
  var made = 0;
  var r = boot([function () { made = made + 1; return recorder("a", true); }], true);
  h.assertEqual(r.client, null);
  h.assertEqual(made, 0, "no feature code ran");
  h.assertEqual(r.state.created, 0, "no platform");
  h.assertEqual(r.win.__ccPlatform, undefined, "no handle");
});

h.describe("gates");

h.test("an open gate starts the feature once, then passes", function () {
  var f = recorder("a", true);
  var r = boot([factory(f)]);
  r.client.reconcile();
  r.client.reconcile();
  h.assertEqual(lifecycle(f), ["start", "pass", "pass"]);
});

h.test("a closed gate never starts it, but observe still runs", function () {
  var f = recorder("a", false);
  var r = boot([factory(f)]);
  r.client.reconcile();
  h.assertEqual(f.calls, ["observe"]);
});

h.test("a gate that opens late starts it, and one that closes stops it", function () {
  var f = recorder("a", false);
  var r = boot([factory(f)]);
  r.client.reconcile();
  f.open = true;
  r.client.reconcile();
  f.open = false;
  r.client.reconcile();
  f.open = true;
  r.client.reconcile();
  h.assertEqual(lifecycle(f), ["start", "pass", "stop", "start", "pass"]);
});

h.test("only an explicit true opens a gate", function () {
  [1, "true", {}, null, undefined].forEach(function (answer) {
    var f = recorder("a", answer);
    boot([factory(f)]).client.reconcile();
    h.assertEqual(lifecycle(f), [], String(answer));
  });
});

h.test("features are gated independently", function () {
  var a = recorder("a", true);
  var b = recorder("b", false);
  boot([factory(a), factory(b)]).client.reconcile();
  h.assertEqual(lifecycle(a), ["start", "pass"]);
  h.assertEqual(lifecycle(b), []);
});

h.describe("the Entra rollout");

h.test("outside it, an open gate does not start anything", function () {
  var f = recorder("a", true);
  var r = boot([factory(f)]);
  r.state.rollout = false;
  r.client.reconcile();
  h.assertEqual(lifecycle(f), []);
});

h.test("leaving it stops every running feature", function () {
  var a = recorder("a", true);
  var b = recorder("b", true);
  var r = boot([factory(a), factory(b)]);
  r.client.reconcile();
  r.state.rollout = false;
  r.client.reconcile();
  h.assertEqual(lifecycle(a), ["start", "pass", "stop"]);
  h.assertEqual(lifecycle(b), ["start", "pass", "stop"]);
});

h.describe("one feature cannot take another down");

h.test("a gate that throws counts as closed", function () {
  var bad = recorder("bad", true);
  bad.gate = function () { throw new Error("boom"); };
  var good = recorder("good", true);
  boot([factory(bad), factory(good)]).client.reconcile();
  h.assertEqual(lifecycle(bad), []);
  h.assertEqual(lifecycle(good), ["start", "pass"]);
});

h.test("a start that throws is cleaned up and never retried", function () {
  var bad = recorder("bad", true);
  var starts = 0;
  bad.start = function () { starts = starts + 1; throw new Error("boom"); };
  var good = recorder("good", true);
  var r = boot([factory(bad), factory(good)]);
  r.client.reconcile();
  r.client.reconcile();
  h.assertEqual(starts, 1);
  h.assertEqual(lifecycle(bad), ["stop"]);
  h.assertEqual(lifecycle(good), ["start", "pass", "pass"]);
  h.assertEqual(r.win.__ccPlatform.features()[0], { name: "bad", running: false, broken: true });
});

h.test("a pass that throws leaves the feature running and the others passing", function () {
  var bad = recorder("bad", true);
  bad.pass = function () { throw new Error("boom"); };
  var good = recorder("good", true);
  var r = boot([factory(bad), factory(good)]);
  r.client.reconcile();
  r.client.reconcile();
  h.assertEqual(lifecycle(bad), ["start"]);
  h.assertEqual(lifecycle(good), ["start", "pass", "pass"]);
});

h.test("the hooks other than gate are optional", function () {
  var r = boot([factory({ name: "bare", gate: function () { return true; } })]);
  r.client.reconcile();
  h.assertEqual(r.win.__ccPlatform.features()[0].running, true);
});

h.describe("the loop");

h.test("every pass asks who the reader is, before any feature", function () {
  var seen = -1;
  var f = recorder("a", true);
  var r;
  f.observe = function () { seen = r.state.refreshes; };
  r = boot([factory(f)]);
  r.client.reconcile();
  h.assertEqual(seen, 1);
});

h.test("start runs a pass at once and schedules one timer, however often it is called", function () {
  var f = recorder("a", true);
  var r = boot([factory(f)]);
  r.client.start();
  r.client.start();
  h.assertEqual(lifecycle(f), ["start", "pass"]);
  h.assertEqual(r.win.__intervals.length, 1);
  h.assertEqual(r.win.__intervals[0].ms, 2000);
});

h.test("stop ends the timer and stops running features only; start picks up again", function () {
  var on = recorder("on", true);
  var off = recorder("off", false);
  var r = boot([factory(on), factory(off)]);
  r.client.start();
  r.client.stop();
  h.assertEqual(lifecycle(on), ["start", "pass", "stop"]);
  h.assertEqual(lifecycle(off), []);
  r.win.__tick();
  h.assertEqual(lifecycle(on), ["start", "pass", "stop"], "the timer is gone");
  r.client.start();
  h.assertEqual(lifecycle(on), ["start", "pass", "stop", "start", "pass"]);
});

h.describe("the console");

h.test("__ccPlatform lists the features; feature() finds one by name", function () {
  var a = recorder("a", true);
  var b = recorder("b", false);
  var r = boot([factory(a), factory(b)]);
  r.client.reconcile();
  h.assertEqual(r.win.__ccPlatform.features(), [
    { name: "a", running: true, broken: false },
    { name: "b", running: false, broken: false }
  ]);
  h.assertTrue(r.client.feature("b") === b);
  h.assertEqual(r.client.feature("nope"), null);
});

h.summarise();
