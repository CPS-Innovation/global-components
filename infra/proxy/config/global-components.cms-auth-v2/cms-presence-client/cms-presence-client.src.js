/* cms-presence-client.src.js — POC presence client for CMS Modern and DCF.
 *
 * This is the HAND-WRITTEN part of the bundle. build.sh concatenates:
 *     vendor/es6-promise-4.2.8.auto.min.js   (IE11 has no native Promise)
 *   + vendor/signalr-3.1.31.min.js           (last SignalR line that supports IE11)
 *   + this file
 * into ../cms-presence-client.js, which is the single script the app maintainers
 * inject. Never edit the built file — edit this and re-run build.sh.
 *
 * !! DOCUMENT MODE 11 (Edge IE mode). The whole CMS estate is site-listed into
 * IE mode: /viewer/landing sends X-UA-Compatible IE=edge and /dcf/ sends
 * IE=EmulateIE11, both of which resolve to Trident document mode 11. Confirmed
 * empirically (document.documentMode === 11 in both apps).
 *
 * So: NO arrow functions, NO class, NO template literals, NO spread, NO
 * async/await, NO fetch, NO Object.assign, NO native Promise (the polyfill
 * above provides it). Mode 11 DOES give us JSON, addEventListener,
 * querySelector and Array.prototype.forEach — this is a much softer constraint
 * than cms-auth-v2-client.js, which runs in document mode 5.
 *
 * WHAT IT DOES (POC scope — observe only, no UI):
 *   1. Works out which app it is in and which case is on screen, from the URL.
 *   2. Opens a SignalR connection to the case-locking hub and invokes
 *      Connect(sectionKey, appName) with sectionKey "<caseId>:CASE".
 *   3. Logs every Notify payload (the users present in that section).
 *   4. Re-reconciles when the case changes — CMS Modern is hash-routed, so a
 *      case change never reloads the page.
 *
 * Everything is also recorded on window.__ccPresence so you can inspect state
 * from the console even if the host app has stubbed console out.
 */
(function () {
  "use strict";

  // ---- configuration ------------------------------------------------------

  // Same-origin: both apps are served through the Polaris proxy, which fronts
  // the hub at this path. No CORS, no JSONP.
  var HUB_PATH = "/global-components/case-locking/api/hubs/notifications";

  // Top-level "russian doll" section: I am simply on this case.
  var SECTION_KIND = "CASE";

  // Reported to the hub as the joining application. "Work Management App" is
  // factually wrong for CMS Modern/DCF, but it is a value the server already
  // accepts, so the POC uses it rather than blocking on a server-side change.
  // Swap to context.app (below) once the API accepts these two app names.
  var APP_NAME = "Work Management App";

  // Dev bearer accepted by the API's Bearer-Test scheme. Same token the
  // global-components presence service uses (case-locking-presence.ts). Not a
  // real credential — the signature is not validated.
  var DEV_BEARER = "__DEV_BEARER__";

  // How often to re-read the URL. Cheap, and simpler than hooking every router.
  var POLL_MS = 2000;

  // ---- logging ------------------------------------------------------------

  var messages = [];

  function log() {
    var args = Array.prototype.slice.call(arguments);
    messages.push({ at: new Date().toISOString(), args: args });
    if (messages.length > 200) {
      messages.shift();
    }
    try {
      if (window.console && window.console.log) {
        window.console.log.apply(window.console, ["[cc-presence]"].concat(args));
      }
    } catch (e) {
      // a host app with a hostile console must never break presence
    }
  }

  // ---- where are we? ------------------------------------------------------

  // DCF:    /dcf/review/<caseId>/<userGuid>?wid=MASTER
  // Modern: /viewer/landing#/case-summary/<caseId>
  //         /viewer/landing#/disclosure/<caseId>
  // The Modern caseId lives in the hash, which never reaches the server — the
  // only way to see it is client-side, right here.
  function readContext() {
    var path = String(window.location.pathname || "");
    var hash = String(window.location.hash || "");
    var match;

    match = /^\/dcf\/([^/]+)\/(\d+)/.exec(path);
    if (match) {
      return { app: "CMS DCF", screen: match[1], caseId: match[2] };
    }

    if (path.indexOf("/viewer/") === 0) {
      match = /^#\/([^/?]+)\/(\d+)/.exec(hash);
      if (match) {
        return { app: "CMS Modern", screen: match[1], caseId: match[2] };
      }
      return { app: "CMS Modern", screen: hash.replace(/^#\//, "") || "landing", caseId: null };
    }

    return { app: null, screen: null, caseId: null };
  }

  function sectionKeyFor(caseId) {
    return caseId + ":" + SECTION_KIND;
  }

  // ---- connection lifecycle ----------------------------------------------

  var connection = null;
  var connectedKey = null;
  var busy = false;

  function buildConnection() {
    return new window.signalR.HubConnectionBuilder()
      .withUrl(HUB_PATH, {
        accessTokenFactory: function () {
          return DEV_BEARER;
        }
      })
      .withAutomaticReconnect()
      .configureLogging(window.signalR.LogLevel.Information)
      .build();
  }

  function stopConnection() {
    if (!connection) {
      return window.Promise.resolve();
    }
    var stopping = connection;
    var key = connectedKey;
    connection = null;
    connectedKey = null;
    log("stopping connection", key);
    return stopping.stop().then(
      function () {
        log("stopped", key);
      },
      function (err) {
        log("stop failed", key, err);
      }
    );
  }

  function startConnection(key, context) {
    var candidate = buildConnection();

    candidate.on("Notify", function (users) {
      log("Notify", key, users);
    });

    candidate.onreconnected(function () {
      log("reconnected — re-invoking Connect", key);
      candidate.invoke("Connect", key, APP_NAME).then(null, function (err) {
        log("re-invoke failed", key, err);
      });
    });

    candidate.onclose(function (err) {
      log("connection closed", key, err || "(clean)");
    });

    log("starting connection", key, "host=" + context.app, "screen=" + context.screen, "reportedAs=" + APP_NAME);
    return candidate
      .start()
      .then(function () {
        log("connected — invoking Connect", key, "as", APP_NAME);
        return candidate.invoke("Connect", key, APP_NAME);
      })
      .then(function () {
        connection = candidate;
        connectedKey = key;
        log("Connect acknowledged", key);
      })
      .then(null, function (err) {
        log("start/invoke FAILED", key, err);
        candidate.stop().then(null, function () {});
      });
  }

  function reconcile() {
    if (busy) {
      return;
    }
    var context = readContext();
    var wanted = context.caseId ? sectionKeyFor(context.caseId) : null;
    if (wanted === connectedKey) {
      return;
    }

    busy = true;
    stopConnection()
      .then(function () {
        if (!wanted) {
          return null;
        }
        return startConnection(wanted, context);
      })
      .then(
        function () {
          busy = false;
        },
        function (err) {
          log("reconcile failed", err);
          busy = false;
        }
      );
  }

  // ---- boot ---------------------------------------------------------------

  window.__ccPresence = {
    messages: messages,
    context: readContext,
    status: function () {
      return { connectedKey: connectedKey, busy: busy, context: readContext() };
    },
    reconcile: reconcile,
    stop: stopConnection
  };

  if (!window.signalR) {
    log("FATAL: signalR global missing — was the bundle built with build.sh?");
    return;
  }

  log("client loaded", window.location.href);
  reconcile();
  window.setInterval(reconcile, POLL_MS);

  // Belt and braces for Modern's hash router; the poll would catch it anyway.
  if (window.addEventListener) {
    window.addEventListener("hashchange", reconcile, false);
  }
})();
