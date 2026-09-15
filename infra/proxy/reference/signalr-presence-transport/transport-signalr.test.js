/* Unit tests for modern/transport-signalr.js — the LOADER, not the transport.
 *
 * What matters here is everything that happens before SignalR exists: that we
 * fetch the right URL from the right host, that a section requested while the
 * bundle is still in flight is not lost, and that a failed load degrades quietly
 * instead of retrying forever on a page we are only a guest on. The transport
 * itself (signalr/plugin.js) needs a real socket and is exercised on the estate.
 */
var h = require("../test-harness");

var OUR_SRC = "https://polaris-uat-notprod.cps.gov.uk/global-components/uat/cms-presence-client.js";
var SECTION = "2148456:CASE";

// A rig with the shim built over fake window/document, plus recorders for
// everything it is supposed to tell the shell about.
function rig(scriptTags) {
  var win = h.fakeWindow();
  var doc = h.fakeDocument(scriptTags === undefined ? [{ src: OUR_SRC }] : scriptTags);
  var logged = [];
  var resets = 0;
  var notifications = [];

  var m = h.load(
    ["common/presence-sections.js", "common/presence-origin.js", "modern/transport-signalr.js"],
    ["CCPTransportSignalr"],
    { window: win, document: doc }
  );

  var transport = m.CCPTransportSignalr.create({
    appName: "CMS Modern",
    keepAliveMs: 5000,
    log: function () {
      logged.push(Array.prototype.slice.call(arguments).join(" "));
    },
    verbose: function () {
      return false;
    },
    skipNegotiation: function () {
      return false;
    },
    onNotifications: function (list) {
      notifications.push(list);
    },
    onReset: function () {
      resets = resets + 1;
    }
  });

  return {
    transport: transport,
    window: win,
    document: doc,
    logged: logged,
    notifications: notifications,
    resets: function () {
      return resets;
    },
    // The <script> tags the shim has injected (the fake head and documentElement
    // share one list).
    injected: function () {
      return doc.__appended;
    },
    // Stand in for the bundle arriving: publish a factory that records how it was
    // called, then fire the tag's onload exactly as the browser would.
    arrive: function (calls) {
      win.CCPSignalRFactory = function (api) {
        calls.push(api);
        return {
          name: "signalr",
          start: function (id) {
            calls.push({ started: id });
          },
          stop: function () {
            calls.push({ stopped: true });
          },
          stats: function () {
            return { state: "Connected", notifications: 3 };
          }
        };
      };
      doc.__appended[0].onload();
    }
  };
}

h.describe("fetching the bundle");

h.test("takes the URL from our own script tag, not the host page", function () {
  var r = rig();
  r.transport.start(SECTION);
  h.assertEqual(r.injected().length, 1);
  h.assertEqual(r.injected()[0].src, "https://polaris-uat-notprod.cps.gov.uk/global-components/uat/cms-presence-signalr.js");
});

h.test("fetches once, however many sections go by while it is in flight", function () {
  var r = rig();
  r.transport.start(SECTION);
  r.transport.start("999:CASE");
  r.transport.start("1000:CASE_REVIEW");
  h.assertEqual(r.injected().length, 1);
});

h.describe("the section requested before the bundle arrived");

h.test("is applied when it lands — the whole point of the deferral", function () {
  var r = rig();
  var calls = [];
  r.transport.start(SECTION);
  r.arrive(calls);
  h.assertEqual(calls[1], { started: SECTION });
});

h.test("is the LATEST one, not the one that triggered the fetch", function () {
  var r = rig();
  var calls = [];
  r.transport.start(SECTION);
  r.transport.start("999:CASE");
  r.arrive(calls);
  h.assertEqual(calls[1], { started: "999:CASE" });
});

h.test("is not started at all if we left before it landed", function () {
  var r = rig();
  var calls = [];
  r.transport.start(SECTION);
  r.transport.stop();
  r.arrive(calls);
  h.assertEqual(calls.length, 1); // the factory ran; nothing was started
});

h.test("stop() before the bundle lands still clears the roster", function () {
  var r = rig();
  r.transport.start(SECTION);
  r.transport.stop();
  h.assertEqual(r.resets(), 1);
});

h.describe("what the factory is handed");

h.test("an absolute hub URL on the host that served us — cross-domain, a relative one would hit the CMS box", function () {
  var r = rig();
  var calls = [];
  r.transport.start(SECTION);
  r.arrive(calls);
  h.assertEqual(
    calls[0].hubUrl,
    "https://polaris-uat-notprod.cps.gov.uk/global-components/case-locking/api/hubs/notifications?appName=CMS%20Modern"
  );
});

h.test("appName in the query as well as for the Connect argument — the proxy cannot read WebSocket frames", function () {
  var r = rig();
  var calls = [];
  r.transport.start(SECTION);
  r.arrive(calls);
  h.assertTrue(calls[0].hubUrl.indexOf("appName=CMS%20Modern") !== -1);
  h.assertEqual(calls[0].appName, "CMS Modern");
});

h.describe("a load that fails");

h.test("does not retry — a guest script must not hammer the host page's network", function () {
  var r = rig();
  r.transport.start(SECTION);
  r.injected()[0].onerror();
  r.transport.start("999:CASE");
  h.assertEqual(r.injected().length, 1);
});

h.test("says so in status, so a silent transport is distinguishable from a broken one", function () {
  var r = rig();
  r.transport.start(SECTION);
  r.injected()[0].onerror();
  h.assertEqual(r.transport.stats().loadFailed, "script error (blocked, 404, or unreachable)");
});

h.test("a timeout is reported the same way", function () {
  var r = rig();
  r.transport.start(SECTION);
  r.window.__fire(0); // the load watchdog
  h.assertEqual(r.transport.stats().loadFailed, "timed out after 20000ms");
});

h.test("a bundle that loads but publishes nothing is a failure, not a silent success", function () {
  var r = rig();
  r.transport.start(SECTION);
  r.injected()[0].onload();
  h.assertEqual(r.transport.stats().loadFailed, "bundle loaded but published no factory");
});

h.describe("status");

h.test("reports the loader's own state before the transport exists", function () {
  var r = rig();
  var before = r.transport.stats();
  h.assertEqual(before.loadedAt, null);
  h.assertEqual(before.loadFailed, null);
  h.assertEqual(before.skipNegotiation, false);
  h.assertEqual(before.state, undefined);
});

h.test("merges the transport's state in once there is one", function () {
  var r = rig();
  var calls = [];
  r.transport.start(SECTION);
  r.arrive(calls);
  var after = r.transport.stats();
  h.assertEqual(after.state, "Connected");
  h.assertEqual(after.notifications, 3);
  h.assertTrue(after.loadedAt !== null);
});

h.summarise();
