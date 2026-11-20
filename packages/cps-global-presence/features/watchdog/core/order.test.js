/* Unit tests for features/watchdog/core/order.js — the one place a roster's order is decided. */
var h = require("../../../test-harness");

var CCPOrder = h.load(["features/watchdog/core/order.js"], ["CCPOrder"]).CCPOrder;

function person(username, times) {
  var apps = [];
  var i;
  for (i = 0; i < times.length; i++) {
    apps.push({ appDisplayName: "App " + i, timeEntered: times[i] });
  }
  return { username: username, apps: apps };
}

function names(people) {
  var out = [];
  var i;
  for (i = 0; i < people.length; i++) {
    out.push(people[i].username);
  }
  return out;
}

h.describe("CCPOrder.people: by arrival");

h.test("earliest arrival first", function () {
  var ordered = CCPOrder.people([person("c", ["2026-11-20T10:00:00Z"]), person("a", ["2026-11-20T09:00:00Z"]), person("b", ["2026-11-20T09:30:00Z"])]);
  h.assertEqual(names(ordered), ["a", "b", "c"]);
});

h.test("a person's arrival is their earliest in any application", function () {
  var ordered = CCPOrder.people([person("a", ["2026-11-20T10:00:00Z"]), person("b", ["2026-11-20T11:00:00Z", "2026-11-20T08:00:00Z"])]);
  h.assertEqual(names(ordered), ["b", "a"]);
});

// The whole point: one newcomer must not move anyone else.
h.test("a newcomer goes to the bottom and nobody else moves", function () {
  var before = [person("x", ["2026-11-20T09:00:00Z"]), person("y", ["2026-11-20T09:05:00Z"])];
  var after = [person("new", ["2026-11-20T09:10:00Z"]), person("y", ["2026-11-20T09:05:00Z"]), person("x", ["2026-11-20T09:00:00Z"])];
  h.assertEqual(names(CCPOrder.people(before)), ["x", "y"]);
  h.assertEqual(names(CCPOrder.people(after)), ["x", "y", "new"]);
});

h.test("the untimed follow the timed, alphabetically, and ties go by address", function () {
  var ordered = CCPOrder.people([person("zed", []), person("bob", ["2026-11-20T09:00:00Z"]), person("amy", []), person("Abe", ["2026-11-20T09:00:00Z"])]);
  h.assertEqual(names(ordered), ["Abe", "bob", "amy", "zed"]);
});

h.describe("CCPOrder.apps: by arrival in each");

h.test("earliest first, the untimed last, ties by name", function () {
  var ordered = CCPOrder.apps([
    { appDisplayName: "RCMS", timeEntered: undefined },
    { appDisplayName: "CMS Modern", timeEntered: "2026-11-20T10:00:00Z" },
    { appDisplayName: "CMS Classic", timeEntered: "2026-11-20T10:00:00Z" },
    { appDisplayName: "Casework", timeEntered: "2026-11-20T09:00:00Z" }
  ]);
  var out = [];
  var i;
  for (i = 0; i < ordered.length; i++) {
    out.push(ordered[i].appDisplayName);
  }
  h.assertEqual(out, ["Casework", "CMS Classic", "CMS Modern", "RCMS"]);
});

h.describe("CCPOrder.sectionKinds: a fixed reading order");

h.test("broadest first, whatever order they came in, case-insensitively", function () {
  h.assertEqual(CCPOrder.sectionKinds(["VICTIM_WITNESS", "defendant", "CASE_REVIEW", "CASE"]), ["CASE", "CASE_REVIEW", "defendant", "VICTIM_WITNESS"]);
});

h.test("kinds it does not know follow, alphabetically", function () {
  h.assertEqual(CCPOrder.sectionKinds(["ZEBRA", "CASE", "APPLE"]), ["CASE", "APPLE", "ZEBRA"]);
});
