/* modern/transport-jsonp.js — the shipping transport. MODERN/DCF ONLY.
 *
 * Holds one presence session over JSONP: create -> heartbeat + poll -> remove.
 * Chosen because <script src> is not gated by Windows zone setting 1406, so it
 * works cross-domain in the IE-mode estate where XHR does not. See
 * transport-signalr.js for the alternative and what it costs.
 *
 * Failure semantics follow the Classic client, which is the reference for this
 * API: a 410 on heartbeat means the Watchdog has forgotten the session, so
 * recreate it; a transient timeout (null) is retried on the next tick. We differ
 * on one point deliberately — Classic stops permanently on a non-410 heartbeat
 * error, whereas an observe-only bar is better off continuing to try than going
 * dark for the rest of the session.
 */

var CCPTransportJsonp = {};

/**
 * @param {{base: string, appName: string, timeoutMs: number, tickMs: number,
 *          log: function(...*): void, verbose: function(): boolean,
 *          onNotifications: function(Array): void, onReset: function(): void}} options
 * @returns {{name: string, start: function(string): void, stop: function(): void, stats: function(): Object}}
 */
CCPTransportJsonp.create = function (options) {
  var log = options.log;
  var call = CCPJsonp.createJsonp({
    base: options.base,
    appName: options.appName,
    timeoutMs: options.timeoutMs,
    log: log
  });

  var sessionId = "";
  var activeSectionId = "";
  var tickTimer = null;
  var stats = { creates: 0, heartbeats: 0, polls: 0, errors: 0, restarts: 0, lastTickAt: null };

  function stopTicking() {
    if (tickTimer) {
      window.clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  function stop() {
    stopTicking();
    if (sessionId) {
      log("removing session", sessionId, activeSectionId);
      // Best-effort DELETE on leave. NOT guaranteed on tab-close — the server's
      // TTL is the real backstop, which is why the heartbeat exists at all.
      call("remove", { sid: sessionId }, function () {});
    }
    sessionId = "";
    activeSectionId = "";
    options.onReset();
  }

  // A 410 means the Watchdog no longer knows this session. Without one we cannot
  // poll, so tear down and rebuild on the same section.
  function restart() {
    var sid = activeSectionId;
    stats.restarts = stats.restarts + 1;
    stop();
    if (sid) {
      start(sid);
    }
  }

  function tick() {
    try {
      if (!sessionId) {
        return;
      }
      var mine = sessionId; // capture: ignore callbacks whose session was superseded
      stats.lastTickAt = new Date().toISOString();

      call("heartbeat", { sid: mine }, function (data) {
        if (sessionId !== mine) {
          return;
        }
        if (data === null) {
          return; // transient timeout — retry next tick
        }
        if (data.jsonpError) {
          stats.errors = stats.errors + 1;
          if (data.jsonpError.indexOf("410") > -1) {
            log("heartbeat: session expired (410) — recreating");
            restart();
          } else {
            log("heartbeat FAILED", data.jsonpError);
          }
          return;
        }
        stats.heartbeats = stats.heartbeats + 1;
        if (options.verbose()) {
          log("heartbeat ok", "#" + stats.heartbeats);
        }
      });

      call("poll", { sid: mine }, function (data) {
        if (sessionId !== mine) {
          return;
        }
        if (data === null) {
          if (options.verbose()) {
            log("poll: no response (timeout)");
          }
          return;
        }
        if (data.jsonpError) {
          stats.errors = stats.errors + 1;
          log("poll FAILED", data.jsonpError);
          return;
        }
        stats.polls = stats.polls + 1;
        // An empty array applies nothing and leaves the current rosters standing.
        options.onNotifications(data);
      });
    } catch (e) {
      // a throw here would kill the interval — never let that happen
    }
  }

  function start(sectionId) {
    activeSectionId = sectionId;
    log("creating session", sectionId, "as", options.appName);
    call("create", { sectionId: sectionId }, function (data) {
      if (activeSectionId !== sectionId) {
        return; // superseded while in flight
      }
      if (data === null || data.jsonpError || !data.sessionId) {
        var why = data === null ? "no response (timeout)" : data.jsonpError || "no sessionId in response";
        stats.errors = stats.errors + 1;
        log("create FAILED", sectionId, why);
        return;
      }
      stats.creates = stats.creates + 1;
      sessionId = data.sessionId;
      log("session", sessionId, "for", sectionId);
      tick();
      tickTimer = window.setInterval(tick, options.tickMs);
    });
  }

  return {
    name: "jsonp",
    start: start,
    stop: stop,
    stats: function () {
      return {
        sessionId: sessionId,
        sectionId: activeSectionId,
        tickEveryMs: options.tickMs,
        creates: stats.creates,
        heartbeats: stats.heartbeats,
        polls: stats.polls,
        errors: stats.errors,
        restarts: stats.restarts,
        lastTickAt: stats.lastTickAt
      };
    }
  };
};
