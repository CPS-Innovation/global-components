/* Unit tests for common/presence-joined.js
 *
 * Two things are worth pinning: the day boundaries, which decide the wording, and
 * the hand parse, which exists because document mode 5 cannot Date.parse an ISO
 * string and which must therefore agree with a browser that can.
 */
var h = require("../test-harness");

var CCPJoined = h.load(["common/presence-joined.js"], ["CCPJoined"]).CCPJoined;

// Local-time helper so these read as wall clock wherever they run.
function at(y, mo, d, hh, mi) {
  return new Date(y, mo - 1, d, hh, mi, 0);
}

// The same instant, expressed as the API expresses it, for a given LOCAL time.
function isoOfLocal(date) {
  var offset = -date.getTimezoneOffset();
  var sign = offset < 0 ? "-" : "+";
  var abs = Math.abs(offset);
  function two(n) { return n < 10 ? "0" + n : String(n); }
  return date.getFullYear() + "-" + two(date.getMonth() + 1) + "-" + two(date.getDate()) +
    "T" + two(date.getHours()) + ":" + two(date.getMinutes()) + ":00" +
    sign + two(Math.floor(abs / 60)) + ":" + two(abs % 60);
}

h.describe("CCPJoined.format");

h.test("today is just the time", function () {
  h.assertEqual(CCPJoined.format(isoOfLocal(at(2026, 9, 10, 15, 38)), at(2026, 9, 10, 17, 0)), "3.38pm");
});

h.test("yesterday says so", function () {
  h.assertEqual(CCPJoined.format(isoOfLocal(at(2026, 9, 9, 15, 38)), at(2026, 9, 10, 17, 0)), "3.38pm yesterday");
});

h.test("older than that gets the date, month spelled out", function () {
  h.assertEqual(CCPJoined.format(isoOfLocal(at(2026, 9, 6, 15, 38)), at(2026, 9, 10, 17, 0)), "3.38pm on 6 September 2026");
});

// Calendar days, not elapsed hours: two hours apart, but a reader calls it yesterday.
h.test("11pm to 1am is yesterday, not two hours ago", function () {
  h.assertEqual(CCPJoined.format(isoOfLocal(at(2026, 9, 9, 23, 0)), at(2026, 9, 10, 1, 0)), "11.00pm yesterday");
});

h.test("midnight and noon are 12, not 0", function () {
  h.assertEqual(CCPJoined.format(isoOfLocal(at(2026, 9, 10, 0, 5)), at(2026, 9, 10, 9, 0)), "12.05am");
  h.assertEqual(CCPJoined.format(isoOfLocal(at(2026, 9, 10, 12, 5)), at(2026, 9, 10, 15, 0)), "12.05pm");
});

// A future timestamp should not happen, but reads better as a date than "in -3 days".
h.test("a timestamp in the future falls back to the date", function () {
  h.assertEqual(CCPJoined.format(isoOfLocal(at(2026, 9, 12, 9, 0)), at(2026, 9, 10, 17, 0)), "9.00am on 12 September 2026");
});

h.test("nothing usable is an empty string, not a fallback", function () {
  h.assertEqual(CCPJoined.format(undefined), "");
  h.assertEqual(CCPJoined.format(""), "");
  h.assertEqual(CCPJoined.format("not a date"), "");
  h.assertEqual(CCPJoined.format("2026-13-45T99:99"), "");
  // Rollover must be rejected, not quietly turned into a plausible date.
  h.assertEqual(CCPJoined.format("2026-02-30T10:00:00Z"), "");
  h.assertEqual(CCPJoined.format("2026-08-21T25:00:00Z"), "");
  // ...but a real leap day is a real date.
  h.assertEqual(CCPJoined.parse("2028-02-29T10:00:00Z") === null, false);
});

h.describe("CCPJoined.parse — the hand parse mode 5 needs");

// The point of parsing by hand: agree with a browser that CAN parse ISO.
h.test("agrees with the engine's own Date on every offset form", function () {
  var forms = [
    "2026-08-21T08:11:53.226+00:00",
    "2026-08-21T08:11:53Z",
    "2026-08-21T08:11:53+01:00",
    "2026-08-21T08:11:53-05:30",
    "2026-08-21T08:11:53+0100",
    "2026-08-21T08:11"
  ];
  for (var i = 0; i < forms.length; i++) {
    var mine = CCPJoined.parse(forms[i]);
    var withOffset = forms[i].indexOf("Z") === -1 && !/[+-]\d{2}:?\d{2}$/.test(forms[i])
      ? forms[i] + "Z"                       // no offset: we document this as UTC
      : forms[i].replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
    var theirs = new Date(withOffset);
    h.assertEqual(mine.getTime(), theirs.getTime());
  }
});

// The bug this replaces: printing the wall-clock fields as sent showed a UTC
// timestamp as though it were local — an hour out for half the year.
h.test("applies the offset rather than printing the wall clock as sent", function () {
  var utcNoon = CCPJoined.parse("2026-08-21T12:00:00+00:00");
  var oneAhead = CCPJoined.parse("2026-08-21T13:00:00+01:00");
  h.assertEqual(utcNoon.getTime(), oneAhead.getTime());
});

h.test("a string that is not a timestamp is null", function () {
  h.assertEqual(CCPJoined.parse("21 Aug 2026"), null);
  h.assertEqual(CCPJoined.parse(undefined), null);
});
