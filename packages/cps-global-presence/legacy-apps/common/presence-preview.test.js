/* Unit tests for legacy-apps/common/presence-preview.js — which preview flags are set.
 *
 * Like the viewer, this is a cache around one JSONP call, so the tests are about
 * what it does with each shape of answer. The shapes matter more here than usual
 * because TWO of them are the same value: the route answers `cb(null)` when no
 * preview is set, and the transport also signals a TIMEOUT as null. Both have to
 * land on "no preview", which is the shipped behaviour — the alternative, a flag
 * switching something ON because a call failed, is the one direction that must
 * not be possible.
 */
var h = require("../../test-harness");

function rig(onChange) {
  var logged = [];
  var pending = [];

  var m = h.load(["legacy-apps/common/presence-preview.js"], ["CCPPreview"]);

  var preview = m.CCPPreview.createPreview({
    call: function (op, params, onData) {
      pending.push({ op: op, reply: onData });
    },
    log: function () {
      logged.push(Array.prototype.slice.call(arguments).join(" "));
    },
    onChange: onChange
  });

  return {
    preview: preview,
    logged: logged,
    calls: function () {
      return pending;
    },
    reply: function (data) {
      pending.pop().reply(data);
    }
  };
}

var FLAGS = { caseSearch: true, caseMarkers: "b" };

h.describe("asking");

h.test("asks once on creation", function () {
  var r = rig();
  h.assertEqual(r.calls().length, 1, "one call");
});

h.test("a second call is not made while one is in flight", function () {
  var r = rig();
  r.preview.refresh();
  h.assertEqual(r.calls().length, 1, "still one");
});

// Preview flags cannot change without the ?set= navigation, which reloads the
// page — so once known there is nothing left to ask for.
h.test("refresh() once known is a no-op", function () {
  var r = rig();
  r.reply(FLAGS);
  r.preview.refresh();
  h.assertEqual(r.calls().length, 0, "nothing pending");
});

h.test("a forced refresh asks again anyway", function () {
  var r = rig();
  r.reply(FLAGS);
  r.preview.refresh(true);
  h.assertEqual(r.calls().length, 1, "asked again");
});

h.describe("what it keeps");

h.test("carries the flags through and logs their names", function () {
  var r = rig();
  r.reply(FLAGS);
  h.assertEqual(r.preview.flags().caseSearch, true, "boolean flag");
  h.assertEqual(r.preview.flags().caseMarkers, "b", "enum flag");
  h.assertTrue(r.preview.known(), "known");
  h.assertTrue(r.logged[0].indexOf("caseSearch") !== -1, r.logged[0]);
  h.assertTrue(r.logged[0].indexOf("caseMarkers") !== -1, r.logged[0]);
});

h.test("an empty object is a real answer, not an absence", function () {
  var r = rig();
  r.reply({});
  h.assertTrue(r.preview.known(), "known");
  h.assertTrue(r.logged[0].indexOf("(empty)") !== -1, r.logged[0]);
});

h.describe("the two kinds of nothing");

// THE POINT OF THIS MODULE'S CAUTION. `cb(null)` is the route's honest "no
// preview is set", and null is ALSO how the transport reports a timeout. They are
// indistinguishable here and must stay that way: both mean everything stays off.
h.test("null settles as no flags, whether it is the answer or a timeout", function () {
  var r = rig();
  r.reply(null);
  h.assertEqual(Object.keys(r.preview.flags()).length, 0, "no flags");
  h.assertTrue(r.preview.known(), "settled, so it stops asking");
  h.assertTrue(r.logged[0].indexOf("preview none") !== -1, r.logged[0]);
});

// A server-side error is different: it is NOT an answer, so the flags stay
// unknown and the next refresh tries again.
h.test("a server error leaves it unknown so it can be retried", function () {
  var r = rig();
  r.reply({ jsonpError: "bad callback" });
  h.assertTrue(!r.preview.known(), "not settled");
  r.preview.refresh();
  h.assertEqual(r.calls().length, 1, "asks again");
});

h.test("a failure is logged with its reason", function () {
  var r = rig();
  r.reply({ jsonpError: "bad callback" });
  h.assertTrue(r.logged[0].indexOf("bad callback") !== -1, r.logged[0]);
});

// Nothing may read as ON by accident. This is the invariant the module exists to
// protect, so it is pinned against every failure shape at once.
h.test("no failure shape can turn a flag on", function () {
  var shapes = [null, {}, { jsonpError: "x" }];
  var i;
  for (i = 0; i < shapes.length; i++) {
    var r = rig();
    r.reply(shapes[i]);
    h.assertTrue(
      !r.preview.flags().caseSearch,
      "shape " + i + " must not enable anything: " + JSON.stringify(r.preview.flags())
    );
  }
});

h.describe("recovery");

h.test("a retry after a failure keeps the flags it then gets", function () {
  var r = rig();
  r.reply({ jsonpError: "transient" });
  r.preview.refresh();
  r.reply(FLAGS);
  h.assertEqual(r.preview.flags().caseSearch, true, "picked up on the retry");
  h.assertTrue(r.preview.known(), "now settled");
});


h.describe("counting the reader");

// The web components' rule (shouldCountSelfInCaseLocking): only an explicit true.
h.test("counts the reader only when the flag is explicitly on", function () {
  var r = rig();
  r.reply({ caseLockingCountSelf: true });
  h.assertEqual(r.preview.countSelf(), true);
});

// Off is the production behaviour, and what keeps the stripe away from a QA user
// working alone — so every way of not knowing has to land there too.
h.test("does not count the reader when the flag is off, unset, unknown or failed", function () {
  var answers = [{ caseLockingCountSelf: false }, {}, FLAGS, null, { jsonpError: "x" }];
  var i, r;
  for (i = 0; i < answers.length; i++) {
    r = rig();
    r.reply(answers[i]);
    h.assertEqual(r.preview.countSelf(), false);
  }
});

h.test("does not count the reader before any answer", function () {
  h.assertEqual(rig().preview.countSelf(), false);
});

// A truthy non-boolean is not "on": the flag is a checkbox, and anything else in
// that slot is a malformed cookie, not a request.
h.test("does not treat a truthy non-boolean as on", function () {
  var r = rig();
  r.reply({ caseLockingCountSelf: "true" });
  h.assertEqual(r.preview.countSelf(), false);
});

h.describe("telling the client to redraw");

h.test("calls onChange when an answer settles, flags and all", function () {
  var seen = [];
  var r = rig(function () {
    seen.push(r.preview.countSelf());
  });
  r.reply({ caseLockingCountSelf: true });
  h.assertEqual(seen.length, 1);
  h.assertEqual(seen[0], true);
});

h.test("calls onChange when the answer is that nothing is set", function () {
  var calls = 0;
  var r = rig(function () {
    calls++;
  });
  r.reply(null);
  h.assertEqual(calls, 1);
});

// A failed call settles nothing — the flags are still unknown and a retry follows —
// so there is nothing new to draw.
h.test("does not call onChange on a failed call", function () {
  var calls = 0;
  var r = rig(function () {
    calls++;
  });
  r.reply({ jsonpError: "x" });
  h.assertEqual(calls, 0);
});

h.test("a throwing onChange is logged, and the flags still land", function () {
  var r = rig(function () {
    throw new Error("boom");
  });
  r.reply({ caseLockingCountSelf: true });
  h.assertEqual(r.preview.countSelf(), true);
  h.assertEqual(r.preview.known(), true);
  h.assertEqual(r.logged.join("\n").indexOf("preview onChange threw Error: boom") !== -1, true);
});

h.test("works without an onChange at all", function () {
  var r = rig();
  r.reply({ caseLockingCountSelf: true });
  h.assertEqual(r.preview.known(), true);
});

h.summarise();
