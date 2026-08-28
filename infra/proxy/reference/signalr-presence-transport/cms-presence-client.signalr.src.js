/* cms-presence-client.signalr.src.js — SignalR presence client for Modern/DCF.
 *
 * NOT THE SHIPPING CLIENT. Kept as a working reference and as the fallback if the
 * REST/JSONP surface ever stops being first-class.
 *
 * It works, proxied: it connects, joins a section, keep-alives, survives eviction
 * and renders a roster. What killed it for production is the UNPROXIED estate:
 * SignalR's negotiate step is an XHR, cross-domain XHR raises the zone-1406
 * security dialog, and skipping negotiate removes the client from Azure SignalR
 * Service's delivery path — you can invoke but never receive. The only ways round
 * that were an iframe on our origin (a second document plus a message protocol) or
 * JSONP-then-WebSocket (a path nobody else runs).
 *
 * JSONP won instead, because Classic must be supported long-term and already uses
 * it: one transport for both legacy apps, ~10x smaller injected script (this file
 * needs 127KB of vendor — SignalR 3.1 plus a Promise polyfill — which also patches
 * a global Promise onto the host page), and no end-of-life dependency shipped into
 * production. The current apps stay pure SignalR; only the two legacy ones use JSONP.
 *
 * Build with: ./build.sh signalr
 *
 * ---------------------------------------------------------------------------
 * Original header follows.
 * ---------------------------------------------------------------------------
 *
 * cms-presence-client.src.js — presence client for CMS Modern and DCF.
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
 * async/await, NO fetch, NO Object.assign, NO Map/Set, NO native Promise (the
 * polyfill above provides it). Mode 11 DOES give us JSON, addEventListener,
 * Object.keys and Array.prototype.forEach — a much softer constraint than
 * cms-auth-v2-client.js, which runs in document mode 5.
 *
 * WHAT IT DOES (observe only — no UI yet):
 *   1. Works out which app it is in and which case is on screen, from the URL.
 *   2. Opens ONE SignalR connection and joins ONE section:
 *        CMS Modern -> "<caseId>:CASE"          (on the case)
 *        DCF        -> "<caseId>:CASE_REVIEW"   (reviewing the case)
 *   3. Holds the session alive with KeepAlive, and rejoins if evicted.
 *   4. Applies ReceiveNotification snapshots and logs the deduped roster.
 *   5. Re-reconciles when the case changes — CMS Modern is hash-routed, so a
 *      case change never reloads the page.
 *
 * ONE SESSION, deliberately. The presence API models a "region" as its own
 * session, and both Leave() and KeepAlive() take no arguments — they act on the
 * session, which implies one session per connection. These two apps each occupy
 * a single region, so one connection each is the whole story. The nested
 * ("russian doll") case — on a case AND editing a witness within it — is real
 * but belongs to the global-components refactor; if it turns out Connect ADDS a
 * section rather than replacing it, the roster layer below already copes,
 * because it is keyed by section rather than by connection.
 *
 * Everything is recorded on window.__ccPresence so you can inspect state from
 * the console even if the host app has stubbed console out.
 */
(function () {
  "use strict";

  // ---- configuration ------------------------------------------------------

  // Same-origin when proxied; cross-origin but same-site otherwise. Either way
  // the proxy injects Authorization from the presence cookie — this script
  // carries no credential. See presenceBearer in global-components.case-locking.ts.
  var HUB_PATH = "/global-components/case-locking/api/hubs/notifications";

  // Reported to the hub as the joining application. DCF and CMS Modern are one
  // app in users' minds, so the presence API models them as a single name.
  var APP_NAME = "CMS Modern";

  // The app name goes to the server TWICE, deliberately:
  //   1. as the second argument to the Connect hub method — the real contract;
  //   2. as ?appName= on the connect URL, which exists only so the proxy can lift
  //      it into the X-Watchdog-App-Name header the API also wants. The hub
  //      argument travels inside WebSocket frames, which the proxy cannot read.
  // See watchdogAppName in global-components.case-locking.ts.
  var HUB_URL = HUB_PATH + "?appName=" + encodeURIComponent(APP_NAME);

  // Server evicts an idle session after 10s, so beat at 5s: one missed tick is
  // survivable, two are not. Do not raise this without checking the server's
  // window — an evicted session stops appearing to everyone else on the case.
  var KEEPALIVE_MS = 5000;

  // The hub's error text when our session has been reaped. Not a failure to
  // retry blindly: the session is gone, so the cure is to Connect again.
  var SESSION_EVICTED_CODE = "SESSION_EVICTED";

  // ReceiveNotification carries a discriminator; 0 is the presence snapshot.
  var NOTIFICATION_TYPE_PRESENCE = 0;

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
  // Modern: /viewer/landing#/case-summary/<caseId>/<userGuid>
  //         /viewer/landing#/disclosure/<caseId>/...
  // The Modern caseId lives in the hash, which never reaches the server — the
  // only way to see it is client-side, right here.
  function readContext() {
    var path = String(window.location.pathname || "");
    var hash = String(window.location.hash || "");
    var match;

    match = /^\/dcf\/([^/]+)\/(\d+)/.exec(path);
    if (match) {
      return { app: "DCF", screen: match[1], caseId: match[2], kind: "CASE_REVIEW" };
    }

    if (path.indexOf("/viewer/") === 0) {
      match = /^#\/([^/?]+)\/(\d+)/.exec(hash);
      if (match) {
        return { app: "CMS Modern", screen: match[1], caseId: match[2], kind: "CASE" };
      }
      return { app: "CMS Modern", screen: hash.replace(/^#\//, "") || "landing", caseId: null, kind: null };
    }

    return { app: null, screen: null, caseId: null, kind: null };
  }

  function sectionIdFor(context) {
    return context.caseId ? context.caseId + ":" + context.kind : null;
  }

  // ---- roster: what the server has told us ---------------------------------

  // Keyed by section so a snapshot for one region can never clobber another.
  // Each entry keeps the server's version: snapshots can arrive out of order,
  // and an older one must not overwrite a newer.
  var latestBySection = {};

  function snapshotKey(section) {
    if (!section) {
      return "";
    }
    return String(section.caseId) + ":" + String(section.kind) + ":" + String(section.subjectId || "");
  }

  function clearRoster() {
    latestBySection = {};
    // Function declaration below — hoisted, so this is safe; a no-op when the
    // bar was never rendered.
    removeBar();
  }

  // Returns true if anything actually changed, so we only log real news.
  function applyNotification(payload) {
    if (!payload || !payload.snapshots || typeof payload.snapshots.length !== "number") {
      return false;
    }

    var changed = false;
    var i;
    for (i = 0; i < payload.snapshots.length; i++) {
      var snapshot = payload.snapshots[i];
      var key = snapshotKey(snapshot.section);
      var existing = latestBySection[key];

      if (existing && snapshot.version <= existing.version) {
        continue; // stale — a newer snapshot for this section already applied
      }

      var members = [];
      var raw = snapshot.members || [];
      var j;
      for (j = 0; j < raw.length; j++) {
        members.push({
          userEmail: raw[j].userEmail,
          sourceApplication: raw[j].sourceApplication || "",
          joinedAt: raw[j].joinedAt
        });
      }

      latestBySection[key] = {
        caseId: snapshot.section.caseId,
        kind: snapshot.section.kind,
        subjectId: snapshot.section.subjectId || null,
        version: snapshot.version,
        members: members
      };
      changed = true;
    }

    return changed;
  }

  // ONE PERSON, ONE ENTRY. Someone can be in several sections at once — on the
  // case and editing a witness within it — and a UI must say that once, listing
  // the regions, rather than showing them twice. This client has a single region
  // today, but the deduping belongs here rather than in whatever renders it.
  function buildRoster() {
    var byUser = {};
    var order = [];
    var keys = Object.keys(latestBySection);
    var i;

    for (i = 0; i < keys.length; i++) {
      var entry = latestBySection[keys[i]];
      var j;
      for (j = 0; j < entry.members.length; j++) {
        var member = entry.members[j];
        var id = String(member.userEmail || "").toLowerCase();
        if (!id) {
          continue;
        }
        if (!byUser[id]) {
          byUser[id] = { userEmail: member.userEmail, regions: [], apps: [] };
          order.push(id);
        }
        byUser[id].regions.push(entry.kind + (entry.subjectId ? ":" + entry.subjectId : ""));
        if (member.sourceApplication && byUser[id].apps.indexOf(member.sourceApplication) === -1) {
          byUser[id].apps.push(member.sourceApplication);
        }
      }
    }

    var people = [];
    for (i = 0; i < order.length; i++) {
      people.push(byUser[order[i]]);
    }
    return people;
  }

  function describeRoster() {
    var people = buildRoster();
    if (people.length === 0) {
      return "(nobody)";
    }
    var parts = [];
    var i;
    for (i = 0; i < people.length; i++) {
      parts.push(people[i].userEmail + " [" + people[i].regions.join(",") + "]" + (people[i].apps.length ? " via " + people[i].apps.join(",") : ""));
    }
    return parts.join(" | ");
  }

  // ---- UI: the presence bar ------------------------------------------------

  // GOV.UK Design System colours, copied rather than linked — the host apps have
  // their own stylesheets and we are a guest on their page. No external CSS, no
  // class names that could collide, one element, all styles inline.
  var GDS_DARK_BLUE = "#003078"; // govuk-colour("dark-blue")
  var GDS_WHITE = "#ffffff";
  var BAR_ID = "ccPresenceBar";

  // Most specific region wins the wording: someone reviewing a case is also on
  // the case, and "is reviewing" is the more useful of the two things to say.
  function describePerson(person) {
    var reviewing = false;
    var i;
    for (i = 0; i < person.regions.length; i++) {
      if (String(person.regions[i]).indexOf("CASE_REVIEW") === 0) {
        reviewing = true;
      }
    }
    if (reviewing) {
      return person.userEmail + " is reviewing this case";
    }
    var app = person.apps.length ? person.apps[0] : APP_NAME;
    return person.userEmail + " is also viewing this case in " + app;
  }

  function removeBar() {
    try {
      var existing = document.getElementById(BAR_ID);
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }
    } catch (e) {
      // never let presentation break the host page
    }
  }

  function renderBar() {
    try {
      var people = buildRoster();
      if (!people.length) {
        removeBar();
        return;
      }

      var bar = document.getElementById(BAR_ID);
      if (!bar) {
        bar = document.createElement("div");
        bar.id = BAR_ID;
        // Pinned bottom-right, half the viewport wide, above the host's chrome.
        bar.style.position = "fixed";
        bar.style.bottom = "0";
        bar.style.right = "0";
        bar.style.width = "50%";
        bar.style.zIndex = "2147483000";
        bar.style.boxSizing = "border-box";
        bar.style.padding = "10px 15px";
        bar.style.background = GDS_DARK_BLUE;
        bar.style.color = GDS_WHITE;
        bar.style.font = '16px/1.25 "GDS Transport", arial, sans-serif';
        bar.style.borderTop = "2px solid " + GDS_WHITE;
        document.body.appendChild(bar);
      }

      // textContent rather than innerHTML: these strings carry server-supplied
      // email addresses, and this page is not ours to inject markup into.
      var lines = [];
      var i;
      for (i = 0; i < people.length; i++) {
        lines.push(describePerson(people[i]));
      }
      bar.textContent = lines.join("  \u00b7  ");
    } catch (e) {
      // never let presentation break the host page
    }
  }

  // ---- the session --------------------------------------------------------

  var connection = null;
  var connectedSectionId = null;
  var keepAliveTimer = null;
  var busy = false;

  // A healthy keep-alive is deliberately SILENT: at one beat per 5s it would
  // flush every interesting line out of the 200-entry buffer within twenty
  // minutes. But silence and "not running" look identical from a console, so
  // count the beats instead — __ccPresence.status() reports them — and offer an
  // opt-in verbose mode for when you actually want to watch it tick.
  var keepAliveCount = 0;
  var keepAliveErrorCount = 0;
  var keepAliveLastAt = null;
  var verbose = false;

  // SignalR's own log, routed into our buffer rather than the console — this
  // environment's console is unreliable, and the library says useful things we
  // would otherwise never see. In particular, when the hub invokes a client
  // method we have not registered it logs "No client method with the name 'X'
  // found", which is the only way to discover the real event name from outside.
  //
  // Warnings and errors are always kept (they are rare and always interesting).
  // Everything else needs __ccPresence.setTrace(true), because Trace is a
  // torrent — it logs every frame, including each keep-alive.
  // Whether to skip SignalR's negotiate round-trip. DEFAULT FALSE — we negotiate.
  //
  // This one cost a day, so it is worth writing down properly.
  //
  // Negotiate is what redirects the client to Azure SignalR Service, and
  // server-to-client messages are dispatched THROUGH the Service. Skip it and
  // you get a connection that can invoke hub methods perfectly well — Connect
  // and KeepAlive both complete — while never receiving a single push. The
  // symptom looks exactly like "the server does not notify a lone user", and it
  // is not: it is the client being absent from the delivery path. Confirmed
  // empirically: flipping this to false made a roster appear immediately.
  //
  // The catch: negotiate is an XHR. Same-origin (proxied) that is fine. In the
  // UNPROXIED estate the host page is on a different origin from the hub, and
  // Windows zone setting 1406 answers a cross-domain XHR with a security dialog
  // — which is why skipping it looked attractive in the first place.
  //
  // Those two requirements cannot both be met by a script running directly in
  // an unproxied host page. The way out is to run this client inside a hidden
  // iframe served from OUR origin, where negotiate is same-origin again, and
  // postMessage the roster to the host page. Until that exists, this client
  // works proxied and needs the iframe for anything else.
  var skipNegotiation = false;

  var trace = false;
  var signalrLogged = 0;
  var lastProbe = null;

  function isSessionEvicted(error) {
    var message = error && error.message ? String(error.message) : String(error || "");
    return message.indexOf(SESSION_EVICTED_CODE) !== -1;
  }

  function stopKeepAlive() {
    if (keepAliveTimer) {
      window.clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
  }

  function startKeepAlive() {
    stopKeepAlive();
    var inFlight = false;

    keepAliveTimer = window.setInterval(function () {
      if (inFlight || !connection || connection.state !== "Connected" || !connectedSectionId) {
        return; // a slow tick must not stack up behind itself
      }
      inFlight = true;
      connection
        .invoke("KeepAlive")
        .then(function () {
          keepAliveCount = keepAliveCount + 1;
          keepAliveLastAt = new Date().toISOString();
          if (verbose) {
            log("KeepAlive ok", connectedSectionId, "#" + keepAliveCount);
          }
        })
        .then(null, function (error) {
          keepAliveErrorCount = keepAliveErrorCount + 1;
          if (!isSessionEvicted(error)) {
            log("KeepAlive failed", error && error.message ? error.message : error);
            return null;
          }
          // Our session was reaped. Everything we hold is now fiction, so drop
          // it and rejoin rather than carrying on with a dead session.
          log("session evicted — rejoining", connectedSectionId);
          clearRoster();
          return connection.invoke("Connect", connectedSectionId, APP_NAME).then(
            function () {
              log("rejoined", connectedSectionId);
            },
            function (rejoinError) {
              log("rejoin FAILED — will retry next tick", rejoinError && rejoinError.message ? rejoinError.message : rejoinError);
            }
          );
        })
        .then(function () {
          inFlight = false;
        }, function () {
          inFlight = false;
        });
    }, KEEPALIVE_MS);
  }

  function buildConnection() {
    return new window.signalR.HubConnectionBuilder()
      .withUrl(HUB_URL, {
        // NO accessTokenFactory. This script ships no credential at all: the auth
        // callback puts the token in an HttpOnly cookie scoped to this path, and
        // the proxy lifts it into an Authorization header on the way upstream
        // (presenceBearer, in global-components.case-locking.ts). The token never
        // reaches page JS and never appears in a URL.
        //
        // skipNegotiation + WebSockets is not an optimisation, it is REQUIRED.
        // In the unproxied estate the host page is on a different origin from the
        // hub, and SignalR's negotiate step is an XHR — which Windows zone setting
        // 1406 ("Access data sources across domains" = Prompt, machine-locked)
        // answers with a security dialog. WebSocket is not covered by 1406;
        // confirmed empirically at document mode 11 (clean 1000 close, no dialog).
        //
        // COST: no transport fallback. Long-polling and SSE both need XHR, so if
        // the WebSocket cannot be established there is no second chance — presence
        // simply does not run for that user.
        skipNegotiation: skipNegotiation,
        transport: window.signalR.HttpTransportType.WebSockets
      })
      .withAutomaticReconnect()
      .configureLogging({
        // A custom ILogger receives every level; the filtering is ours to do.
        log: function (logLevel, message) {
          var isProblem = logLevel >= window.signalR.LogLevel.Warning;
          if (!trace && !isProblem) {
            return;
          }
          signalrLogged = signalrLogged + 1;
          log("signalr", String(message));
        }
      })
      .build();
  }

  function leaveAndStop() {
    if (!connection) {
      return window.Promise.resolve();
    }
    var stopping = connection;
    var was = connectedSectionId;
    connection = null;
    connectedSectionId = null;
    stopKeepAlive();
    clearRoster();
    log("leaving", was);

    // Leave first so the server drops us immediately rather than waiting for the
    // 10s eviction; then close the socket. Both are best-effort — a killed tab
    // does neither, which is exactly why the server has a timeout at all.
    var finished = stopping.state === "Connected" ? stopping.invoke("Leave").then(null, function () {}) : window.Promise.resolve();
    return finished.then(function () {
      return stopping.stop().then(null, function (error) {
        log("stop failed", was, error && error.message ? error.message : error);
      });
    });
  }

  function startSession(sectionId, context) {
    var candidate = buildConnection();

    candidate.on("ReceiveNotification", function (notification) {
      if (!notification || notification.type !== NOTIFICATION_TYPE_PRESENCE) {
        return;
      }
      if (applyNotification(notification.payload)) {
        log("roster", sectionId, describeRoster());
        renderBar();
      }
    });

    candidate.onreconnected(function () {
      // A new transport means a new session; the old roster describes a world
      // that no longer exists.
      log("reconnected — rejoining", sectionId);
      clearRoster();
      candidate.invoke("Connect", sectionId, APP_NAME).then(
        function () {
          log("rejoined after reconnect", sectionId);
        },
        function (error) {
          log("rejoin after reconnect FAILED", error && error.message ? error.message : error);
        }
      );
    });

    candidate.onclose(function (error) {
      log("connection closed", sectionId, error ? error.message || error : "(clean)");
    });

    log("starting session", sectionId, "host=" + context.app, "screen=" + context.screen, "reportedAs=" + APP_NAME);
    return candidate
      .start()
      .then(function () {
        log("connected — invoking Connect", sectionId, "as", APP_NAME);
        return candidate.invoke("Connect", sectionId, APP_NAME);
      })
      .then(function () {
        connection = candidate;
        connectedSectionId = sectionId;
        startKeepAlive();
        log("Connect acknowledged", sectionId, "— keep-alive every " + KEEPALIVE_MS + "ms");
      })
      .then(null, function (error) {
        log("start/invoke FAILED", sectionId, error && error.message ? error.message : error);
        candidate.stop().then(null, function () {});
      });
  }

  function reconcile() {
    if (busy) {
      return;
    }
    var context = readContext();
    var wanted = sectionIdFor(context);
    if (wanted === connectedSectionId) {
      return;
    }

    busy = true;
    leaveAndStop()
      .then(function () {
        return wanted ? startSession(wanted, context) : null;
      })
      .then(function () {
        busy = false;
      }, function (error) {
        log("reconcile failed", error && error.message ? error.message : error);
        busy = false;
      });
  }

  // ---- boot ---------------------------------------------------------------

  window.__ccPresence = {
    messages: messages,
    context: readContext,
    status: function () {
      return {
        connectedSectionId: connectedSectionId,
        connectionState: connection ? connection.state : "Disconnected",
        skipNegotiation: skipNegotiation,
        busy: busy,
        keepAlives: keepAliveCount,
        keepAliveErrors: keepAliveErrorCount,
        keepAliveLastAt: keepAliveLastAt,
        keepAliveEveryMs: KEEPALIVE_MS,
        context: readContext()
      };
    },
    roster: buildRoster,
    describeRoster: describeRoster,
    sections: function () {
      return latestBySection;
    },
    reconcile: reconcile,
    leave: leaveAndStop,
    // __ccPresence.setVerbose(true) to watch every beat; false to go quiet again.
    setVerbose: function (on) {
      verbose = !!on;
      log("verbose", verbose ? "on" : "off");
      return verbose;
    },
    // __ccPresence.setTrace(true) then reconnect() to capture SignalR's full
    // frame-by-frame log into .messages. Noisy by design — turn it off after.
    setSkipNegotiation: function (on) {
      skipNegotiation = !!on;
      log("skipNegotiation", skipNegotiation, "— call reconnect() to apply");
      return skipNegotiation;
    },
    setTrace: function (on) {
      trace = !!on;
      log("trace", trace ? "on" : "off");
      return trace;
    },
    // Force a fresh session, e.g. after switching trace on.
    reconnect: function () {
      connectedSectionId = null;
      return leaveAndStop().then(function () {
        reconcile();
        return "reconnecting";
      });
    },
    signalrLogCount: function () {
      return signalrLogged;
    },
    // Diagnostic seam: invoke an arbitrary hub method on the live connection and
    // park the outcome for inspection. Exists to interrogate the hub's surface
    // from the console — SignalR answers an unknown method with "Method does not
    // exist", which cleanly separates "we are calling it wrong" from "the server
    // never pushes". Usage:
    //   __ccPresence.probe("GetMembers", "124253:CASE")
    //   __ccPresence.lastProbe()
    probe: function () {
      var args = Array.prototype.slice.call(arguments);
      if (!connection || connection.state !== "Connected") {
        lastProbe = { state: "no connection" };
        return "no connection";
      }
      lastProbe = { state: "pending", method: args[0] };
      connection.invoke.apply(connection, args).then(
        function (result) {
          lastProbe = { state: "ok", method: args[0], result: result };
          log("probe ok", args[0], JSON.stringify(result));
        },
        function (error) {
          lastProbe = {
            state: "error",
            method: args[0],
            message: error && error.message ? error.message : String(error)
          };
          log("probe error", args[0], lastProbe.message);
        }
      );
      return "sent — read __ccPresence.lastProbe()";
    },
    lastProbe: function () {
      return lastProbe;
    }
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
    // Best-effort tidy-up: tell the server we've gone rather than making it wait
    // out the eviction window. Not guaranteed — see the note in leaveAndStop.
    window.addEventListener("unload", function () {
      leaveAndStop();
    }, false);
  }
})();
