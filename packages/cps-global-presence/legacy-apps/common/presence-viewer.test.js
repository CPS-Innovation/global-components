/* Unit tests for legacy-apps/common/presence-viewer.js — who is reading this page.
 *
 * The viewer is a cache around one JSONP op, so the tests are about what it does
 * with each shape of answer: an identity, a token with none, a server error, and
 * the timeout — which the transport signals as a null payload and which is the
 * only evidence the 8s watchdog ever fired.
 *
 * cmsEnv IS NOW ACTED ON — it is where the CIN suffix comes from, and no section
 * is registered until it has arrived — so the tests about it are no longer only
 * about the log. The one that matters most is the bounded retry: the identity was
 * always allowed to turn up late, and the environment needs the same grace
 * without turning an absent session hint into a whoami every three seconds for
 * the life of the tab.
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
    ENV_ATTEMPTS: m.CCPViewer.ENV_ATTEMPTS,
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
  cmsEnv: "CIN3",
  cmsEnvWhy: "hint"
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

h.test("refresh() once BOTH facts are known is a no-op", function () {
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

// The whole reason cmsEnv gets a retry of its own: an identity is enough for
// self-filtering, but presence does not register at all without an environment,
// so an answer that carries one and not the other is not an answer yet.
h.test("an identity without an environment is not settled — it asks again", function () {
  var r = rig();
  r.reply({ userEmail: "someone@cps.gov.uk", oid: "", cmsEnv: "" });
  r.viewer.refresh();
  h.assertEqual(r.calls().length, 1);
});

h.test("a late environment is picked up by a later pass", function () {
  var r = rig();
  r.reply({ userEmail: "someone@cps.gov.uk", oid: "", cmsEnv: "" });
  r.viewer.refresh();
  r.reply(IDENTITY);
  h.assertEqual(r.viewer.cmsEnv(), "CIN3");
  r.viewer.refresh();
  h.assertEqual(r.calls().length, 0, "and then it stops");
});

// Unbounded would mean a call every observation pass, for as long as the tab is
// open, to be told the same thing — see CCPViewer.ENV_ATTEMPTS.
h.test("gives up on the environment after ENV_ATTEMPTS, and stops asking", function () {
  var r = rig();
  var blank = { userEmail: "someone@cps.gov.uk", oid: "", cmsEnv: "", cmsEnvWhy: "no-hint" };
  var i;
  for (i = 0; i < r.ENV_ATTEMPTS; i++) {
    h.assertEqual(r.calls().length, 1, "attempt " + (i + 1) + " should be in flight");
    r.reply(blank);
    r.viewer.refresh();
  }
  h.assertEqual(r.calls().length, 0, "the next pass asks nothing");
  h.assertTrue(
    r.logged[r.logged.length - 1].indexOf("will not register") !== -1,
    r.logged[r.logged.length - 1]
  );
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
  // fact presence is waiting on.
  var r = rig();
  r.reply({ userEmail: "", oid: "", cmsEnv: "CIN5" });
  h.assertEqual(r.viewer.cmsEnv(), "CIN5");
});

// An empty cmsEnv arrives for four different reasons and they want four
// different people — nobody wrote the hint, it is corrupt, the writer could not
// fill it, or it carried no CMS domain. Passed straight through: this module does
// not interpret it, it carries it to a console.
h.test("cmsEnvWhy is carried through as the adapter sent it", function () {
  var r = rig();
  r.reply({ userEmail: "", oid: "", cmsEnv: "", cmsEnvWhy: "bad-hint" });
  h.assertEqual(r.viewer.cmsEnvWhy(), "bad-hint");
});

h.test("an adapter that reports no reason leaves it empty, never invented", function () {
  var r = rig();
  r.reply({ userEmail: "", oid: "", cmsEnv: "" });
  h.assertEqual(r.viewer.cmsEnvWhy(), "");
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

h.test("a missing environment says so, and says which kind of missing", function () {
  var r = rig();
  r.reply({ userEmail: "someone@cps.gov.uk", oid: "", cmsEnv: "", cmsEnvWhy: "no-hint" });
  h.assertTrue(r.logged[0].indexOf("cmsEnv=(none)") !== -1, r.logged[0]);
  h.assertTrue(r.logged[0].indexOf("why=no-hint") !== -1, r.logged[0]);
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
