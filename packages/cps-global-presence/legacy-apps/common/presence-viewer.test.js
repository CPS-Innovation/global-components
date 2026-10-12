/* Unit tests for legacy-apps/common/presence-viewer.js — who is reading this page.
 *
 * The viewer is a cache around one JSONP op, so the tests are about what it does
 * with each shape of answer: an identity, a token with none, a server error, and
 * the timeout — which the transport signals as a null payload and which is the
 * only evidence the 8s watchdog ever fired.
 *
 * cmsEnv is carried but not acted on. These tests pin that it survives the round
 * trip and reaches the log, so the day something does depend on it the contract
 * is already described here.
 */
var h = require("../../test-harness");

function rig() {
  var logged = [];
  var pending = [];

  var m = h.load(["legacy-apps/common/presence-viewer.js"], ["CCPViewer"]);

  var viewer = m.CCPViewer.createViewer({
    call: function (op, params, onData) {
      pending.push({ op: op, reply: onData });
    },
    log: function () {
      logged.push(Array.prototype.slice.call(arguments).join(" "));
    }
  });

  return {
    viewer: viewer,
    logged: logged,
    calls: function () {
      return pending;
    },
    reply: function (data) {
      pending.pop().reply(data);
    }
  };
}

var IDENTITY = {
  userEmail: "someone@cps.gov.uk",
  oid: "00000000-1111-2222-3333-444444444444",
  cmsEnv: "CIN3"
};

h.describe("asking");

h.test("asks once on creation, and the op is whoami", function () {
  var r = rig();
  h.assertEqual(r.calls().length, 1);
  h.assertEqual(r.calls()[0].op, "whoami");
});

h.test("refresh() while a call is in flight does not ask again", function () {
  var r = rig();
  r.viewer.refresh();
  h.assertEqual(r.calls().length, 1);
});

h.test("refresh() after an identity is known is a no-op", function () {
  var r = rig();
  r.reply(IDENTITY);
  r.viewer.refresh();
  h.assertEqual(r.calls().length, 0);
});

h.test("refresh() after a failure asks again", function () {
  var r = rig();
  r.reply({ jsonpError: "401" });
  r.viewer.refresh();
  h.assertEqual(r.calls().length, 1);
});

h.describe("what it keeps");

h.test("an identity is kept and reported known", function () {
  var r = rig();
  r.reply(IDENTITY);
  h.assertEqual(r.viewer.email(), "someone@cps.gov.uk");
  h.assertEqual(r.viewer.oid(), "00000000-1111-2222-3333-444444444444");
  h.assertTrue(r.viewer.known());
});

h.test("a token with no identity leaves the viewer unknown", function () {
  var r = rig();
  r.reply({ userEmail: "", oid: "", cmsEnv: "CIN3" });
  h.assertEqual(r.viewer.email(), "");
  h.assertEqual(r.viewer.known(), false);
});

h.describe("cmsEnv");

h.test("is kept when the adapter supplies one", function () {
  var r = rig();
  r.reply(IDENTITY);
  h.assertEqual(r.viewer.cmsEnv(), "CIN3");
});

h.test("is empty when the hint cookie was missing, never guessed", function () {
  var r = rig();
  r.reply({ userEmail: "someone@cps.gov.uk", oid: "", cmsEnv: "" });
  h.assertEqual(r.viewer.cmsEnv(), "");
});

h.test("an environment is kept even when the token carried no identity", function () {
  // The two answers are independent: a missing identity must not suppress the
  // one fact we are collecting the logs for.
  var r = rig();
  r.reply({ userEmail: "", oid: "", cmsEnv: "CIN5" });
  h.assertEqual(r.viewer.cmsEnv(), "CIN5");
});

h.describe("what it logs");

h.test("a success names the environment and the elapsed time", function () {
  var r = rig();
  r.reply(IDENTITY);
  h.assertEqual(r.logged.length, 1);
  h.assertTrue(r.logged[0].indexOf("cmsEnv=CIN3") !== -1, r.logged[0]);
  h.assertTrue(r.logged[0].indexOf("identified") !== -1, r.logged[0]);
  h.assertTrue(/\+\d+ms/.test(r.logged[0]), r.logged[0]);
});

h.test("a missing environment says so rather than printing nothing", function () {
  var r = rig();
  r.reply({ userEmail: "someone@cps.gov.uk", oid: "", cmsEnv: "" });
  h.assertTrue(r.logged[0].indexOf("no session hint cookie") !== -1, r.logged[0]);
});

h.test("a timeout is logged as a timeout, not as a failure", function () {
  var r = rig();
  r.reply(null);
  h.assertEqual(r.logged.length, 1);
  h.assertTrue(r.logged[0].indexOf("timed out") !== -1, r.logged[0]);
  h.assertTrue(/\+\d+ms/.test(r.logged[0]), r.logged[0]);
});

h.test("a server error is logged with its reason", function () {
  var r = rig();
  r.reply({ jsonpError: "401 Unauthorized" });
  h.assertTrue(r.logged[0].indexOf("401 Unauthorized") !== -1, r.logged[0]);
  h.assertTrue(r.logged[0].indexOf("timed out") === -1, r.logged[0]);
});

h.summarise();
