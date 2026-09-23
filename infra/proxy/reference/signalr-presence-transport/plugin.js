/* signalr/plugin.js — the SignalR transport proper. LAZILY LOADED, MODERN/DCF ONLY.
 *
 * Bundled with its vendor code into cms-presence-signalr.js and fetched only when
 * someone selects this transport; see modern/transport-signalr.js for why, and for
 * the seam. This file publishes ONE global — window.CCPSignalRFactory — and the
 * shipping client calls it with everything it needs.
 *
 * Derived from cms-presence-client.signalr.src.js, which was the whole client
 * before JSONP won. What is gone: the section/URL logic, the roster and the bar,
 * all of which now live in common/ and modern/ and are shared by both transports.
 * What is left is the connection lifecycle, which is all that differs.
 *
 * ES5, and Promise is available: the es6-promise polyfill is concatenated ahead of
 * this file in the same artefact. Do not rely on either in the shipping bundle.
 */
(function () {
  "use strict";

  // The hub's error text when our session has been reaped. Not a failure to retry
  // blindly: the session is gone, so the cure is to Connect again.
  var SESSION_EVICTED_CODE = "SESSION_EVICTED";

  // ReceiveNotification carries a discriminator; 0 is the presence snapshot.
  var NOTIFICATION_TYPE_PRESENCE = 0;

  /**
   * @param {Object} api supplied by modern/transport-signalr.js
   * @returns {{name: string, start: function(string): void, stop: function(): void, stats: function(): Object}}
   */
  window.CCPSignalRFactory = function (api) {
    var log = api.log;

    var connection = null;
    var connectedSectionId = null;
    var wantedSectionId = "";
    var keepAliveTimer = null;
    var busy = false;

    // A healthy keep-alive is deliberately SILENT: at one beat per 5s it would
    // flush every interesting line out of the message buffer within twenty
    // minutes. But silence and "not running" look identical from a console, so
    // count the beats instead and let status() report them.
    var stats = {
      keepAlives: 0,
      keepAliveErrors: 0,
      keepAliveLastAt: null,
      notifications: 0,
      connects: 0,
      reconnects: 0,
      startFailures: 0,
      lastError: null,
      lastCloseAt: null
    };

    var trace = false;
    var signalrLogged = 0;

    function isSessionEvicted(error) {
      var message = error && error.message ? String(error.message) : String(error || "");
      return message.indexOf(SESSION_EVICTED_CODE) !== -1;
    }

    function describe(error) {
      return error && error.message ? error.message : String(error);
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
            stats.keepAlives = stats.keepAlives + 1;
            stats.keepAliveLastAt = new Date().toISOString();
            if (api.verbose()) {
              log("KeepAlive ok", connectedSectionId, "#" + stats.keepAlives);
            }
          })
          .then(null, function (error) {
            stats.keepAliveErrors = stats.keepAliveErrors + 1;
            stats.lastError = describe(error);
            if (!isSessionEvicted(error)) {
              log("KeepAlive failed", describe(error));
              return null;
            }
            // Our session was reaped. Everything we hold is now fiction, so drop
            // it and rejoin rather than carrying on with a dead session.
            log("session evicted — rejoining", connectedSectionId);
            api.onReset();
            return connection.invoke("Connect", connectedSectionId, api.appName).then(
              function () {
                log("rejoined", connectedSectionId);
              },
              function (rejoinError) {
                log("rejoin FAILED — will retry next tick", describe(rejoinError));
              }
            );
          })
          .then(function () {
            inFlight = false;
          }, function () {
            inFlight = false;
          });
      }, api.keepAliveMs);
    }

    function buildConnection() {
      return new window.signalR.HubConnectionBuilder()
        .withUrl(api.hubUrl, {
          // NO accessTokenFactory. This script ships no credential at all: the
          // auth callback puts the token in an HttpOnly cookie scoped to this
          // path, and the proxy lifts it into an Authorization header on the way
          // upstream (presenceBearer, in global-components.case-locking.ts). The
          // token never reaches page JS and never appears in a URL.
          //
          // Cross-domain, the cookie still travels: QA and UAT are both under
          // cps.gov.uk, so these requests are cross-ORIGIN but same-SITE, which
          // SameSite=Lax permits. The proxy answers with an explicit
          // Access-Control-Allow-Origin and -Credentials for the same reason.
          skipNegotiation: api.skipNegotiation(),

          // WebSockets only. The fallbacks are no use to us here: long-polling and
          // SSE are both XHR, so a zone that blocks negotiate blocks them too, and
          // failing over to them would only trade one dialog for many. The cost is
          // that a WebSocket we cannot establish has no second chance.
          transport: window.signalR.HttpTransportType.WebSockets
        })
        .withAutomaticReconnect()
        .configureLogging({
          // A custom ILogger receives every level; the filtering is ours to do.
          // Warnings and errors are always kept (rare, and always interesting).
          // Everything else needs trace, because it logs every frame.
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
      api.onReset();
      log("leaving", was);

      // Leave first so the server drops us immediately rather than waiting out the
      // eviction window; then close the socket. Both are best-effort — a killed
      // tab does neither, which is exactly why the server has a timeout at all.
      var finished = stopping.state === "Connected"
        ? stopping.invoke("Leave").then(null, function () {})
        : window.Promise.resolve();
      return finished.then(function () {
        return stopping.stop().then(null, function (error) {
          log("stop failed", was, describe(error));
        });
      });
    }

    function openSession(sectionId) {
      var candidate = buildConnection();

      candidate.on("ReceiveNotification", function (notification) {
        if (!notification || notification.type !== NOTIFICATION_TYPE_PRESENCE) {
          return;
        }
        stats.notifications = stats.notifications + 1;
        // The roster takes a LIST of notifications — one poll response, or one
        // push wrapped in an array. Same shape either way, which is what lets the
        // two transports share it.
        api.onNotifications([notification]);
      });

      candidate.onreconnected(function () {
        // A new transport means a new session; the old roster describes a world
        // that no longer exists.
        stats.reconnects = stats.reconnects + 1;
        log("reconnected — rejoining", sectionId);
        api.onReset();
        candidate.invoke("Connect", sectionId, api.appName).then(
          function () {
            log("rejoined after reconnect", sectionId);
          },
          function (error) {
            log("rejoin after reconnect FAILED", describe(error));
          }
        );
      });

      candidate.onclose(function (error) {
        stats.lastCloseAt = new Date().toISOString();
        log("connection closed", sectionId, error ? describe(error) : "(clean)");
      });

      log("starting session", sectionId, "negotiate=" + (api.skipNegotiation() ? "SKIPPED" : "on"), "as", api.appName);
      return candidate
        .start()
        .then(function () {
          log("connected — invoking Connect", sectionId, "as", api.appName);
          return candidate.invoke("Connect", sectionId, api.appName);
        })
        .then(function () {
          connection = candidate;
          connectedSectionId = sectionId;
          stats.connects = stats.connects + 1;
          startKeepAlive();
          log("Connect acknowledged", sectionId, "— keep-alive every " + api.keepAliveMs + "ms");
        })
        .then(null, function (error) {
          stats.startFailures = stats.startFailures + 1;
          stats.lastError = describe(error);
          log("start/invoke FAILED", sectionId, describe(error));
          candidate.stop().then(null, function () {});
        });
    }

    // Both start() and stop() go through here, because both mean "the section we
    // should be holding has changed" and the transition is the same either way:
    // leave what we have, then open what we want. `busy` serialises them, and
    // wantedSectionId is re-read afterwards so a change made mid-transition is
    // not lost.
    function settle() {
      if (busy) {
        return;
      }
      if (wantedSectionId === connectedSectionId) {
        return;
      }
      busy = true;
      var target = wantedSectionId;
      leaveAndStop()
        .then(function () {
          return target ? openSession(target) : null;
        })
        .then(function () {
          busy = false;
          settle(); // the wanted section may have moved on while we were working
        }, function (error) {
          busy = false;
          stats.lastError = describe(error);
          log("transition FAILED", target, describe(error));
        });
    }

    return {
      name: "signalr",
      start: function (sectionId) {
        wantedSectionId = sectionId;
        settle();
      },
      stop: function () {
        wantedSectionId = "";
        settle();
      },
      setTrace: function (on) {
        trace = !!on;
        return trace;
      },
      stats: function () {
        return {
          state: connection ? connection.state : "(no connection)",
          connectedSectionId: connectedSectionId,
          keepAliveMs: api.keepAliveMs,
          keepAlives: stats.keepAlives,
          keepAliveErrors: stats.keepAliveErrors,
          keepAliveLastAt: stats.keepAliveLastAt,
          notifications: stats.notifications,
          connects: stats.connects,
          reconnects: stats.reconnects,
          startFailures: stats.startFailures,
          lastError: stats.lastError,
          lastCloseAt: stats.lastCloseAt,
          signalrLogged: signalrLogged
        };
      }
    };
  };
})();
