/* Unit tests for common/presence-jsonp.js
 *
 * The transport is testable because it only ever touches window and document
 * through a handful of calls — the harness supplies fakes for those, and the
 * assertions here are on the URL it builds and the callback lifecycle.
 */
var h = require("../test-harness");

function build() {
  var win = h.fakeWindow();
  var doc = h.fakeDocument();
  var mod = h.load(["common/presence-jsonp.js"], ["CCPJsonp"], { window: win, document: doc });
  var call = mod.CCPJsonp.createJsonp({ base: "https://proxy.example/global-components/presence-jsonp", appName: "CMS Modern", timeoutMs: 8000 });
  return { win: win, doc: doc, call: call };
}

function lastUrl(doc) {
  return doc.__appended[doc.__appended.length - 1].src;
}

// The callback name the adapter is told to reflect back.
function callbackName(url) {
  return /[?&]callback=([^&]+)/.exec(url)[1];
}

h.describe("CCPJsonp — the request it builds");

h.test("carries the op, the params and the base", function () {
  var t = build();
  t.call("create", { sectionId: "124253:CASE" }, function () {});
  var url = lastUrl(t.doc);
  h.assertTrue(url.indexOf("https://proxy.example/global-components/presence-jsonp?op=create") === 0, "base and op lead the URL");
  h.assertTrue(url.indexOf("&sectionId=124253%3ACASE") !== -1, "params are encoded, not raw: " + url);
});

h.test("always sends appName — the adapter defaults a missing one to CMS Classic", function () {
  var t = build();
  t.call("poll", { sid: "abc" }, function () {});
  h.assertTrue(lastUrl(t.doc).indexOf("&appName=CMS%20Modern") !== -1, lastUrl(t.doc));
});

h.test("cache-busts every call", function () {
  var t = build();
  t.call("poll", { sid: "abc" }, function () {});
  var first = lastUrl(t.doc);
  t.call("poll", { sid: "abc" }, function () {});
  var second = lastUrl(t.doc);
  h.assertTrue(first !== second, "two identical polls must not share a URL");
});

h.test("appends a script tag, which is what dodges the IE cross-origin XHR zone", function () {
  var t = build();
  t.call("heartbeat", { sid: "abc" }, function () {});
  h.assertEqual(t.doc.__appended.length, 1);
  h.assertEqual(t.doc.__appended[0].type, "text/javascript");
});

h.describe("CCPJsonp — the callback lifecycle");

h.test("the response reaches onData", function () {
  var t = build();
  var got = null;
  t.call("create", {}, function (data) { got = data; });
  t.win[callbackName(lastUrl(t.doc))]({ sessionId: "s-1" });
  h.assertEqual(got, { sessionId: "s-1" });
});

h.test("a timeout delivers null rather than hanging — JSONP has no error event", function () {
  var t = build();
  var got = "untouched";
  t.call("poll", {}, function (data) { got = data; });
  h.assertEqual(t.win.__timers[0].ms, 8000, "the watchdog is armed");
  t.win.__fire(0);
  h.assertEqual(got, null);
});

h.test("a straggler after a timeout is ignored, not delivered twice", function () {
  var t = build();
  var calls = [];
  var name = null;
  t.call("poll", {}, function (data) { calls.push(data); });
  name = callbackName(lastUrl(t.doc));
  t.win.__fire(0);
  t.win[name]({ late: true });
  h.assertEqual(calls, [null], "the late response must not reach onData");
});

h.test("callback names are recycled — mode 5 can neither delete nor clear a window expando", function () {
  var t = build();
  var first, second;
  t.call("poll", {}, function () {});
  first = callbackName(lastUrl(t.doc));
  t.win[first]({});
  t.call("poll", {}, function () {});
  second = callbackName(lastUrl(t.doc));
  h.assertEqual(second, first, "a settled call returns its name to the pool");
});

h.test("concurrent calls get distinct names", function () {
  var t = build();
  var a, b;
  t.call("heartbeat", {}, function () {});
  a = callbackName(lastUrl(t.doc));
  t.call("poll", {}, function () {});
  b = callbackName(lastUrl(t.doc));
  h.assertTrue(a !== b, "in-flight calls must not share a callback");
});

h.summarise();
