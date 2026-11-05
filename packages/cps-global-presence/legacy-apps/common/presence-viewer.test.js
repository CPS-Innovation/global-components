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

// The token's remaining life, carried for whoever is watching whether the auth
// replay works. It drives nothing in here, so these are about it surviving the
// trip intact — including from an adapter that predates it.
h.describe("the presence token's remaining life");

h.test("is carried through and logged", function () {
  var r = rig();
  r.reply({ userEmail: "someone@cps.gov.uk", cmsEnv: "CIN3", cmsEnvWhy: "hint", tokenExpiresIn: 2400 });
  h.assertEqual(r.viewer.tokenExpiresIn(), 2400);
  h.assertTrue(r.logged[0].indexOf("tokenExpiresIn=2400") !== -1, r.logged[0]);
});

// An older adapter blob than this client omits the field entirely. 0 is the same
// answer as "expired", which is what the reader should act on either way — and it
// keeps "NaN" out of the log line, where it would read as a fault rather than an
// absence.
h.test("an adapter that does not report it reads as 0, not NaN", function () {
  var r = rig();
  r.reply(IDENTITY);
  h.assertEqual(r.viewer.tokenExpiresIn(), 0);
  h.assertTrue(r.logged[0].indexOf("tokenExpiresIn=0") !== -1, r.logged[0]);
});

h.test("a junk value reads as 0", function () {
  var r = rig();
  r.reply({ userEmail: "someone@cps.gov.uk", cmsEnv: "CIN3", tokenExpiresIn: "soon" });
  h.assertEqual(r.viewer.tokenExpiresIn(), 0);
});

// WHY A FORCED REFRESH EXISTS AT ALL. Identity and environment do not change for
// the life of a tab, so refresh() stops asking once it has both — which would have
// frozen tokenExpiresIn at its boot value and made it useless for watching a
// replay. force skips that check; it does not get a retry loop of its own, because
// a diagnostic is not worth a whoami every three seconds in every tab.
h.test("a plain refresh once settled still asks nothing", function () {
  var r = rig();
  r.reply({ userEmail: "someone@cps.gov.uk", cmsEnv: "CIN3", tokenExpiresIn: 120 });
  r.viewer.refresh();
  h.assertEqual(r.calls().length, 0, "settled means settled");
});

h.test("a forced refresh asks again, and the newer answer wins", function () {
  var r = rig();
  r.reply({ userEmail: "someone@cps.gov.uk", cmsEnv: "CIN3", tokenExpiresIn: 120 });
  r.viewer.refresh(true);
  h.assertEqual(r.calls().length, 1, "forced past settled()");
  r.reply({ userEmail: "someone@cps.gov.uk", cmsEnv: "CIN3", tokenExpiresIn: 3600 });
  h.assertEqual(r.viewer.tokenExpiresIn(), 3600, "a refreshed token reads higher");
});

// inFlight is still honoured: two answers racing into the same fields buys nothing.
h.test("a forced refresh while a call is out does not ask twice", function () {
  var r = rig();
  r.viewer.refresh(true);
  h.assertEqual(r.calls().length, 1);
});

// The age, which is the field that actually answers "did the replay work". The
// expiry cannot: AAD's token lifetime varies, so a successful replay can report
// less time remaining than the token it replaced. Age only resets when a new token
// is written, so these are about 0 surviving the trip as the value it is.
h.describe("the presence token's age");

h.test("is carried through and logged", function () {
  var r = rig();
  r.reply({ userEmail: "someone@cps.gov.uk", cmsEnv: "CIN3", tokenAge: 42 });
  h.assertEqual(r.viewer.tokenAge(), 42);
  h.assertTrue(r.logged[0].indexOf("tokenAge=42") !== -1, r.logged[0]);
});

// THE CASE THE OBVIOUS GUARD GETS WRONG. 0 is a token minted this second — the
// best possible answer and the whole point of the field — so a truthiness check
// would discard precisely the reading we are watching for.
h.test("an age of 0 is kept, not mistaken for absent", function () {
  var r = rig();
  r.reply({ userEmail: "someone@cps.gov.uk", cmsEnv: "CIN3", tokenAge: 0 });
  h.assertEqual(r.viewer.tokenAge(), 0, "0 means brand new, not missing");
  h.assertTrue(r.logged[0].indexOf("tokenAge=0") !== -1, r.logged[0]);
});

// -1, not 0, because 0 already means something good. An adapter blob older than
// this client omits the field.
h.test("an adapter that does not report it reads as -1", function () {
  var r = rig();
  r.reply(IDENTITY);
  h.assertEqual(r.viewer.tokenAge(), -1, "unknown, not brand new");
});

h.test("a junk value reads as -1", function () {
  var r = rig();
  r.reply({ userEmail: "someone@cps.gov.uk", cmsEnv: "CIN3", tokenAge: "ages" });
  h.assertEqual(r.viewer.tokenAge(), -1);
});

// The replay, as it looks from here: an old token, then a fresh one. Note the
// expiry going DOWN across a successful replay — the exact ambiguity that made the
// age necessary, pinned so nobody "fixes" the diagnostic back to the expiry.
h.test("a replay shows as the age dropping, even when the expiry falls too", function () {
  var r = rig();
  r.reply({ userEmail: "someone@cps.gov.uk", cmsEnv: "CIN3", tokenAge: 1200, tokenExpiresIn: 4991 });
  r.viewer.refresh(true);
  r.reply({ userEmail: "someone@cps.gov.uk", cmsEnv: "CIN3", tokenAge: 3, tokenExpiresIn: 3728 });
  h.assertEqual(r.viewer.tokenAge(), 3, "a new token is younger");
  h.assertEqual(r.viewer.tokenExpiresIn(), 3728, "and may have LESS life left");
});

h.describe("the presence token's claim names");

h.test("are carried through and logged", function () {
  var r = rig();
  r.reply({
    userEmail: "someone@cps.gov.uk",
    cmsEnv: "CIN3",
    claimKeys: "aud,iss,iat,exp,oid,email,scp"
  });
  h.assertEqual(r.viewer.claimKeys(), "aud,iss,iat,exp,oid,email,scp");
  h.assertTrue(r.logged[0].indexOf("claims=aud,iss,iat,exp,oid,email,scp") !== -1, r.logged[0]);
});

// An adapter blob older than this client omits the field; so does a session with
// no readable token. Both mean "cannot be told" and neither needs telling apart.
h.test("an adapter that does not report them reads as empty", function () {
  var r = rig();
  r.reply(IDENTITY);
  h.assertEqual(r.viewer.claimKeys(), "");
});

// "(none)" rather than an empty tail, so a log line cannot be misread as a token
// that carries no claims at all.
h.test("are logged as (none) when there are none", function () {
  var r = rig();
  r.reply(IDENTITY);
  h.assertTrue(r.logged[0].indexOf("claims=(none)") !== -1, r.logged[0]);
});

// THE QUESTION THIS FIELD WAS ADDED FOR. A `groups` claim would let the legacy UI
// gate features on Entra group membership, which needs no cookie and so is immune
// to the Edge/IE jar split. These two pin how the answer reads either way, because
// the difference is one name in a list and easy to skim past.
h.test("a groups claim is visible when the app registration emits one", function () {
  var r = rig();
  r.reply({
    userEmail: "someone@cps.gov.uk",
    cmsEnv: "CIN3",
    claimKeys: "aud,iss,iat,exp,oid,email,groups,scp"
  });
  h.assertTrue(r.viewer.claimKeys().split(",").indexOf("groups") !== -1, "groups is emitted");
});

h.test("and its absence is equally visible", function () {
  var r = rig();
  r.reply({
    userEmail: "someone@cps.gov.uk",
    cmsEnv: "CIN3",
    claimKeys: "aud,iss,iat,exp,oid,email,scp"
  });
  h.assertTrue(r.viewer.claimKeys().split(",").indexOf("groups") === -1, "groups is not emitted");
});

h.summarise();
