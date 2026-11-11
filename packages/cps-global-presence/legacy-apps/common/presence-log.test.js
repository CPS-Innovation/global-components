/* Unit tests for common/presence-log.js — the ring buffer both legacy clients
 * keep, and the UI line that explains a stripe or banner coming and going.
 */
var h = require("../../test-harness");

function rig(echo, limit) {
  var win = h.fakeWindow();
  var printed = [];
  win.console = {
    log: function (line) {
      printed.push(line);
    }
  };
  var m = h.load(["legacy-apps/common/presence-log.js"], ["CCPLog"], { window: win });
  var log = m.CCPLog.createLog({ prefix: "[cc-presence]", echo: echo, limit: limit });
  return { CCPLog: m.CCPLog, log: log, printed: printed };
}

function lines(log) {
  var out = [];
  var i;
  for (i = 0; i < log.messages.length; i++) {
    // Drop the "+123ms " uptime prefix: it is real time and cannot be pinned.
    out.push(log.messages[i].line.replace(/^\+\d+ms /, ""));
  }
  return out;
}

h.describe("recording");

h.test("records every line, oldest first, as one string", function () {
  var r = rig(false);
  r.log.log("one", 2, true);
  r.log.log("two");
  h.assertEqual(lines(r.log), ["one 2 true", "two"]);
});

h.test("keeps only the most recent lines", function () {
  var r = rig(false, 3);
  r.log.log("a");
  r.log.log("b");
  r.log.log("c");
  r.log.log("d");
  h.assertEqual(lines(r.log), ["b", "c", "d"]);
});

h.test("dump() is one line per entry, each with its timestamp", function () {
  var r = rig(false);
  r.log.log("hello");
  var dump = r.log.dump();
  h.assertTrue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z  \+\d+ms hello\n$/.test(dump), dump);
});

h.describe("the console");

// Classic's position: nothing on the console unless someone asks.
h.test("echo off writes nothing to the console", function () {
  var r = rig(false);
  r.log.log("quiet");
  h.assertEqual(r.printed, []);
});

h.test("echo on writes one prefixed string per line", function () {
  var r = rig(true);
  r.log.log("loud", 1);
  h.assertEqual(r.printed, ["[cc-presence] loud 1"]);
});

h.test("echo can be turned on later, and the earlier lines are still in the buffer", function () {
  var r = rig(false);
  r.log.log("before");
  r.log.setEcho(true);
  r.log.log("after");
  h.assertEqual(r.printed, ["[cc-presence] console on", "[cc-presence] after"]);
  h.assertEqual(lines(r.log)[0], "before");
});

h.describe("what the reader can see");

h.test("logs a show and a hide with their reasons", function () {
  var r = rig(false);
  r.log.ui(true, 2, "roster changed");
  r.log.ui(false, 0, "trouble poll timeout");
  h.assertEqual(lines(r.log), ["UI SHOW 2 people reason=roster changed", "UI HIDE reason=trouble poll timeout"]);
});

h.test("says nothing when nothing visible changed", function () {
  var r = rig(false);
  r.log.ui(false, 0, "boot");
  r.log.ui(true, 1, "roster changed");
  r.log.ui(true, 1, "preview flags arrived");
  r.log.ui(false, 0, "gone");
  r.log.ui(false, 0, "still gone");
  h.assertEqual(lines(r.log), ["UI SHOW 1 person reason=roster changed", "UI HIDE reason=gone"]);
});

h.test("a different number of people is news", function () {
  var r = rig(false);
  r.log.ui(true, 1, "a");
  r.log.ui(true, 3, "b");
  h.assertEqual(lines(r.log), ["UI SHOW 1 person reason=a", "UI SHOW 3 people reason=b"]);
});

h.describe("addresses");

h.test("masks the local part and keeps the domain", function () {
  var r = rig(false);
  h.assertEqual(r.CCPLog.mask("ann.smith@cps.gov.uk"), "an***@cps.gov.uk");
  h.assertEqual(r.CCPLog.mask("a@cps.gov.uk"), "a***@cps.gov.uk");
  h.assertEqual(r.CCPLog.mask(""), "");
});

h.test("describes arrivals and departures in one phrase", function () {
  var r = rig(false);
  h.assertEqual(
    r.CCPLog.describeChanges({ joined: ["ann@cps.gov.uk"], left: ["bob@cps.gov.uk", "cy@cps.gov.uk"] }),
    // "cy" keeps one letter, not two: two would be the whole local part.
    "+an***@cps.gov.uk -bo***@cps.gov.uk,c***@cps.gov.uk"
  );
  h.assertEqual(r.CCPLog.describeChanges({ joined: [], left: [] }), "");
});

h.describe("at document mode 5");

h.test("stamps milliseconds without Date.prototype.toISOString", function () {
  var r = rig(false);
  var d = new Date(Date.UTC(2026, 10, 11, 9, 5, 7, 42));
  h.assertEqual(r.CCPLog.stamp(d), "2026-11-11T09:05:07.042Z");
});

h.summarise();
