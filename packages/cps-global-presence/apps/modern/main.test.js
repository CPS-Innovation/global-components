/* Composition tests for the Modern/DCF client: the whole bundle, driven the way
 * the page drives it — URL changes, JSONP replies, timer ticks, unload.
 *
 * Asserts on what the banner shows (a minimal DOM below), and on the ops sent.
 */
var h = require("../../test-harness");

var CASE_A = "2121407";
var CASE_B = "2131508";
var CMS_ENV = "CIN3";
var ORIGIN = "https://polaris-qa-notprod.cps.gov.uk";

var wire = function (kind) {
  return kind + "_" + CMS_ENV;
};

var viewerUrl = function (caseId) {
  return ORIGIN + "/viewer/landing#/case-summary/" + caseId + "/u-1";
};

var dcfUrl = function (caseId) {
  return ORIGIN + "/dcf/review/" + caseId + "/u-1?wid=MASTER";
};

// ---- just enough DOM for the banner and the JSONP transport -------------------

var fakeDom = function () {
  var doc = h.fakeDocument();
  var all = [];
  var root = { parentNode: null };
  var el = function (tag) {
    var e = {
      tagName: tag, id: "", type: "", src: "", style: {}, childNodes: [], parentNode: null,
      offsetHeight: 40, attrs: {},
      appendChild: function (c) { c.parentNode = e; e.childNodes.push(c); return c; },
      removeChild: function (c) { e.childNodes.splice(e.childNodes.indexOf(c), 1); c.parentNode = null; return c; },
      setAttribute: function (k, v) { e.attrs[k] = v; }
    };
    Object.defineProperty(e, "innerHTML", { set: function () { e.childNodes = []; } });
    all.push(e);
    return e;
  };
  var attached = function (e) {
    for (; e; e = e.parentNode) {
      if (e === root) {
        return true;
      }
    }
    return false;
  };
  doc.body = el("body");
  doc.body.parentNode = root;
  doc.createElement = el;
  doc.createTextNode = function (text) { return { text: text }; };
  doc.getElementById = function (id) {
    return all.filter(function (e) { return e.id === id && attached(e); })[0] || null;
  };
  return doc;
};

var text = function (node) {
  return node.text !== undefined ? node.text : (node.childNodes || []).map(text).join("");
};

// ---- the page ------------------------------------------------------------------

var page = function (url) {
  var win = h.fakeWindow();
  var handlers = {};
  var printed = [];
  win.console = { log: function (line) { printed.push(String(line)); } };
  win.__printed = printed;
  win.addEventListener = function (name, fn) { handlers[name] = fn; };
  win.__fire = function (name) { handlers[name](); };
  win.go = function (next) {
    var m = /^https?:\/\/[^/]+([^#]*)(#.*)?$/.exec(next);
    win.location.href = next;
    win.location.pathname = m[1].split("?")[0];
    win.location.hash = m[2] || "";
    win.__fire("hashchange");
  };
  win.location = { href: url, pathname: "", hash: "" };
  win.__doc = fakeDom();
  h.load(h.bundle("modern"), [], { window: win, document: win.__doc });
  return win;
};

var sent = function (win, op) {
  return win.__doc.__appended
    .map(function (s) { return s.src || ""; })
    .filter(function (src) { return src.indexOf("op=" + op + "&") !== -1; });
};

var replyLast = function (win, op, payload) {
  var calls = sent(win, op);
  win[/[?&]callback=([^&]+)/.exec(calls[calls.length - 1])[1]](payload);
};

var me = { userEmail: "me@cps.gov.uk", oid: "oid-1", cmsEnv: CMS_ENV, cmsEnvWhy: "hint" };

var member = function (email) {
  return { userEmail: email, sourceApplication: "CMS Classic", joinedAt: "2026-11-04T09:30:00.000+00:00" };
};

var poll = function (caseId, kind, members, version) {
  return [{ payload: { snapshots: [{ section: { caseId: caseId, kind: wire(kind) }, version: version || 1, members: members }] } }];
};

var banner = function (win) {
  var doc = win.__doc;
  if (!doc.getElementById("ccPresenceBanner")) {
    return null;
  }
  return {
    title: text(doc.getElementById("ccPresenceBannerTitle")),
    lines: doc.getElementById("ccPresenceBannerContent").childNodes.map(text)
  };
};

// Registered on case A in the viewer, the poll answered with these members.
var onCase = function (members) {
  var win = page(viewerUrl(CASE_A));
  replyLast(win, "whoami", me);
  win.__tick();
  replyLast(win, "create", { sessionId: "S-1" });
  replyLast(win, "poll", poll(CASE_A, "CASE", members));
  return win;
};

h.describe("registering");

h.test("registers nothing before whoami has answered", function () {
  var win = page(viewerUrl(CASE_A));
  win.__tick();
  h.assertEqual(sent(win, "create").length, 0);
  h.assertEqual(sent(win, "whoami").length > 0, true);
});

h.test("the viewer registers the case, with the instance suffix", function () {
  var win = page(viewerUrl(CASE_A));
  replyLast(win, "whoami", me);
  win.__tick();
  var creates = sent(win, "create");
  h.assertEqual(creates.length, 1);
  h.assertTrue(creates[0].indexOf("sectionId=" + encodeURIComponent(CASE_A + ":" + wire("CASE"))) !== -1, creates[0]);
  h.assertTrue(creates[0].indexOf("appName=CMS%20Modern") !== -1, creates[0]);
});

h.test("DCF registers the case review", function () {
  var win = page(dcfUrl(CASE_A));
  replyLast(win, "whoami", me);
  win.__tick();
  h.assertTrue(sent(win, "create")[0].indexOf(encodeURIComponent(CASE_A + ":" + wire("CASE_REVIEW"))) !== -1);
});

h.describe("the banner");

h.test("shows who else is on the case", function () {
  var win = onCase([member("ann@cps.gov.uk")]);
  h.assertEqual(banner(win), {
    title: "1 other person is working on this case",
    lines: ["ann@cps.gov.uk is in the case — CMS Classic since 9.30am on 4 November 2026."]
  });
});

h.test("leaves the reader out unless asked to count them", function () {
  var win = onCase([member("me@cps.gov.uk")]);
  h.assertEqual(banner(win), null);
  win.__ccPresence.setCountSelf(true);
  h.assertEqual(banner(win).title, "1 person is working on this case");
  h.assertTrue(banner(win).lines[0].indexOf("me@cps.gov.uk (current user)") === 0, banner(win).lines[0]);
});

h.test("goes when the section empties", function () {
  var win = onCase([member("ann@cps.gov.uk")]);
  win.__tick();
  replyLast(win, "poll", poll(CASE_A, "CASE", [], 2));
  h.assertEqual(banner(win), null);
});

h.test("stays up through a failed call", function () {
  var win = onCase([member("ann@cps.gov.uk")]);
  win.__tick();
  replyLast(win, "heartbeat", null);
  h.assertTrue(banner(win) !== null);
});

h.describe("navigating within the SPA");

h.test("moving to another case leaves the old one and takes the banner down", function () {
  var win = onCase([member("ann@cps.gov.uk")]);
  win.go(viewerUrl(CASE_B));
  h.assertEqual(sent(win, "remove").length, 1);
  h.assertEqual(banner(win), null);
});

// The hub also sends the sections a session CONFLICTS with — here, someone in
// case A's review while we are on case A. Leaving case A forgets only the section
// we held, so the review's roster stays, and draw() does not filter by case.
h.knownBug("moving to another case does not keep showing the old case's conflicts", function () {
  var win = onCase([]);
  win.__tick();
  replyLast(win, "poll", [{ payload: { snapshots: [
    { section: { caseId: CASE_A, kind: wire("CASE") }, version: 2, members: [] },
    { section: { caseId: CASE_A, kind: wire("CASE_REVIEW") }, version: 1, members: [member("ann@cps.gov.uk")] }
  ] } }]);
  h.assertTrue(banner(win) !== null, "precondition: ann shown on case A");
  win.go(viewerUrl(CASE_B));
  h.assertEqual(banner(win), null);
});

h.describe("diagnostics and lifecycle");

h.test("a refused credential re-asks whoami", function () {
  var win = onCase([member("ann@cps.gov.uk")]);
  var before = sent(win, "whoami").length;
  win.__tick();
  replyLast(win, "poll", { jsonpError: "upstream 401" });
  h.assertEqual(sent(win, "whoami").length, before + 1);
});

h.test("the history masks addresses", function () {
  var win = onCase([member("ann@cps.gov.uk")]);
  var dump = win.__ccPresence.dump();
  h.assertTrue(dump.indexOf("UI SHOW 1 person") !== -1, dump);
  h.assertTrue(dump.indexOf("ann@cps.gov.uk") === -1, dump);
});

h.test("unload leaves", function () {
  var win = onCase([member("ann@cps.gov.uk")]);
  win.__fire("unload");
  h.assertEqual(sent(win, "remove").length, 1);
});
