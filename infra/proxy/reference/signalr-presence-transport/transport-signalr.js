/* modern/transport-signalr.js — the OTHER transport, loaded on demand. MODERN/DCF ONLY.
 *
 * WHY THIS IS A LOADER AND NOT THE TRANSPORT ITSELF
 * SignalR needs ~127KB of vendor code (the library, plus a Promise polyfill this
 * engine has no other source for). That is four times the entire shipping client,
 * and it would be paid by every user on every page load in order to support a
 * transport we are only evaluating. So the vendor code and the transport that uses
 * it live in a SEPARATE artefact — cms-presence-signalr.js — fetched only when
 * someone selects this transport, from the same directory this script came from.
 *
 * A <script src> is also the one cross-domain fetch the IE-mode estate permits
 * without a dialog, which is the same reason the JSONP transport works at all.
 *
 * THE SEAM
 * The shipping bundle is an IIFE, so the lazily-loaded file cannot see inside it.
 * It therefore publishes a factory at window.CCPSignalRFactory, which we call with
 * everything it needs — including the hub URL, because CCPOrigin lives in here.
 *
 * WHAT WE ARE ACTUALLY TESTING
 * Negotiate is ON by default. It has to be: negotiate is what places a client in
 * Azure SignalR Service's delivery path, and skipping it yields a connection that
 * invokes hub methods perfectly while never receiving a single push. But negotiate
 * is an XHR, and in the unproxied estate the host page is on a different origin
 * from the hub, where Windows zone setting 1406 ("Access data sources across
 * domains" = Prompt, machine-locked) answers a cross-domain XHR with a security
 * dialog. Whether that dialog appears is the open question this transport exists
 * to settle — see SIGNALR-CROSS-DOMAIN.md.
 */

var CCPTransportSignalr = {};

// Our own filename, used to locate our <script> tag. Must match what the nginx
// conf injects.
CCPTransportSignalr.MARKER = "cms-presence-client.js";

// The lazily-loaded artefact, deployed next to this one by deploy.local.sh.
CCPTransportSignalr.BUNDLE = "cms-presence-signalr.js";

CCPTransportSignalr.HUB_PATH = "/global-components/case-locking/api/hubs/notifications";

// A cross-domain fetch of ~127KB over a corporate link. Generous, because the
// cost of being wrong is a transport that never starts.
CCPTransportSignalr.LOAD_TIMEOUT_MS = 20000;

/**
 * @param {{appName: string, keepAliveMs: number, log: function(...*): void,
 *          verbose: function(): boolean, skipNegotiation: function(): boolean,
 *          onNotifications: function(Array): void, onReset: function(): void}} options
 * @returns {{name: string, start: function(string): void, stop: function(): void, stats: function(): Object}}
 */
CCPTransportSignalr.create = function (options) {
  var log = options.log;
  var inner = null; // the real transport, once the bundle has arrived
  var wanted = ""; // the section we should be on, whether or not we can be yet
  var loading = false;
  var failed = "";
  var loadStartedAt = null;
  var loadedAt = null;

  function bundleUrl() {
    return CCPOrigin.sibling(CCPTransportSignalr.MARKER, CCPTransportSignalr.BUNDLE);
  }

  function hubUrl() {
    // The app name goes to the server TWICE, deliberately:
    //   1. as the second argument to the Connect hub method — the real contract;
    //   2. as ?appName= here, which exists only so the proxy can lift it into the
    //      X-Watchdog-App-Name header the API also wants. The hub argument travels
    //      inside WebSocket frames, which the proxy cannot read.
    // See watchdogAppName in global-components.case-locking.ts.
    return CCPOrigin.resolve(CCPTransportSignalr.MARKER, CCPTransportSignalr.HUB_PATH) +
      "?appName=" + encodeURIComponent(options.appName);
  }

  // Build the real transport from the factory the loaded bundle published, and
  // put it on whatever section we are meant to be holding by now.
  function activate() {
    try {
      inner = window.CCPSignalRFactory({
        hubUrl: hubUrl(),
        appName: options.appName,
        keepAliveMs: options.keepAliveMs,
        skipNegotiation: options.skipNegotiation,
        verbose: options.verbose,
        log: log,
        onNotifications: options.onNotifications,
        onReset: options.onReset
      });
    } catch (e) {
      failed = "factory threw: " + (e && e.message ? e.message : e);
      log("signalr transport unavailable —", failed);
      return;
    }
    if (wanted) {
      inner.start(wanted);
    }
  }

  function load() {
    if (loading) {
      return;
    }
    loading = true;
    loadStartedAt = new Date().toISOString();

    var url = bundleUrl();
    var settled = false;
    var script = document.createElement("script");
    var timer = null;

    function settle(problem) {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      if (problem) {
        failed = problem;
        log("signalr bundle FAILED", url, problem);
        return;
      }
      if (!window.CCPSignalRFactory) {
        failed = "bundle loaded but published no factory";
        log("signalr bundle FAILED", url, failed);
        return;
      }
      loadedAt = new Date().toISOString();
      log("signalr bundle loaded", url);
      activate();
    }

    script.type = "text/javascript";
    script.src = url;
    // onload is IE9+; onreadystatechange is what actually fires for older
    // document modes. Registering both and de-duplicating in settle() is the
    // portable answer.
    script.onload = function () {
      settle("");
    };
    script.onreadystatechange = function () {
      if (script.readyState === "loaded" || script.readyState === "complete") {
        settle("");
      }
    };
    script.onerror = function () {
      settle("script error (blocked, 404, or unreachable)");
    };

    timer = window.setTimeout(function () {
      settle("timed out after " + CCPTransportSignalr.LOAD_TIMEOUT_MS + "ms");
    }, CCPTransportSignalr.LOAD_TIMEOUT_MS);

    log("fetching signalr bundle", url);
    var head = document.getElementsByTagName("head")[0] || document.documentElement;
    head.appendChild(script);
  }

  function start(sectionId) {
    wanted = sectionId;
    if (failed) {
      return; // a load that failed once will fail again; do not thrash the network
    }
    if (inner) {
      inner.start(sectionId);
      return;
    }
    // The factory may already be present from an earlier selection in this page.
    if (window.CCPSignalRFactory) {
      loading = true;
      loadedAt = loadedAt || new Date().toISOString();
      activate();
      return;
    }
    load(); // start() is re-applied in activate() once the bundle arrives
  }

  function stop() {
    wanted = "";
    if (inner) {
      inner.stop();
      return;
    }
    options.onReset();
  }

  return {
    name: "signalr",
    start: start,
    stop: stop,
    stats: function () {
      var base = {
        bundle: bundleUrl(),
        loadStartedAt: loadStartedAt,
        loadedAt: loadedAt,
        loadFailed: failed || null,
        skipNegotiation: options.skipNegotiation(),
        hubUrl: hubUrl(),
        sectionId: wanted
      };
      if (inner) {
        var innerStats = inner.stats();
        for (var key in innerStats) {
          if (Object.prototype.hasOwnProperty.call(innerStats, key)) {
            base[key] = innerStats[key];
          }
        }
      }
      return base;
    }
  };
};
