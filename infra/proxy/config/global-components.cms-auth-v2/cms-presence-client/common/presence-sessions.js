/* common/presence-sessions.js — hold a session per active section. SHARED, MODE 5 FLOOR.
 *
 * The locator says which sections the user is in; this keeps the server's idea of
 * that in step. You hand it the DESIRED set and it does the diffing: create what is
 * new, remove what has gone, heartbeat and poll what remains.
 *
 * WHY A SET AND NOT ONE SESSION
 * A user can be in several sections at once — on the case and editing a witness
 * within it. Both clients used to hold exactly one session and so under-reported.
 * The roster was always keyed by section and needed no change.
 *
 * FAILURE SEMANTICS, which are the whole reason this is worth sharing:
 *   - a 410 on heartbeat means the Watchdog has forgotten that session. Its roster
 *     is now fiction, so drop the section and let the next pass recreate it.
 *   - a timeout (null) is nothing: retry on the next pass.
 *   - a create that fails is retried on the next pass rather than leaving the
 *     section unregistered until the user navigates. Classic's original stopped
 *     permanently on a non-410 error; that is available as dropSectionOnError,
 *     because an observe-only UI is usually better off still trying.
 *
 * Every callback checks `live[id] !== entry` before acting. Entries are replaced by
 * identity, so a section that was removed and re-added mid-flight correctly ignores
 * the older reply instead of adopting a dead session id.
 */

var CCPSessions = {};

/**
 * @param {{call: function(string, Object, function(*): void): void,
 *          appName: string, tickMs: number,
 *          log: function(...*): void, verbose: function(): boolean,
 *          onNotifications: function(Array): void,
 *          onSectionDropped: function(string): void,
 *          dropSectionOnError?: boolean,
 *          onFatal?: function(string, string): void}} options
 * @returns {{setDesired: function(string[]): void, stop: function(): void,
 *            ids: function(): string[], stats: function(): Object}}
 */
CCPSessions.createSessions = function (options) {
  var call = options.call;
  var log = options.log;

  var live = {}; // sectionId -> { sessionId, creating }
  var order = []; // the same ids, kept as an array: no Object.keys at mode 5
  var timer = null;
  /** @type {{creates: number, heartbeats: number, polls: number, errors: number,
   *          restarts: number, removes: number, lastTickAt: string|null}} */
  var stats = {
    creates: 0,
    heartbeats: 0,
    polls: 0,
    errors: 0,
    restarts: 0,
    removes: 0,
    lastTickAt: null
  };

  function forget(sectionId) {
    var at = CCPSections.indexOfString(order, sectionId);
    if (at !== -1) {
      order.splice(at, 1);
    }
    live[sectionId] = null;
    options.onSectionDropped(sectionId);
  }

  function stopTicking() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function createSession(sectionId, entry) {
    entry.creating = true;
    log("creating session", sectionId, "as", options.appName);
    call("create", { sectionId: sectionId }, function (data) {
      if (live[sectionId] !== entry) {
        return; // superseded while in flight
      }
      entry.creating = false;
      if (data === null || data.jsonpError || !data.sessionId) {
        var why = data === null ? "no response (timeout)" : data.jsonpError || "no sessionId in response";
        stats.errors = stats.errors + 1;
        log("create FAILED", sectionId, why, "— retrying next pass");
        return;
      }
      stats.creates = stats.creates + 1;
      entry.sessionId = data.sessionId;
      log("session", entry.sessionId, "for", sectionId);
      beat(sectionId, entry);
    });
  }

  function heartbeat(sectionId, entry) {
    var sid = entry.sessionId;
    call("heartbeat", { sid: sid }, function (data) {
      if (live[sectionId] !== entry || entry.sessionId !== sid) {
        return;
      }
      if (data === null) {
        return; // transient timeout — retry next pass
      }
      if (data.jsonpError) {
        stats.errors = stats.errors + 1;
        if (data.jsonpError.indexOf("410") > -1) {
          // The session is gone, and so is the truth of its roster.
          stats.restarts = stats.restarts + 1;
          log("heartbeat: session expired (410) — recreating", sectionId);
          entry.sessionId = "";
          options.onSectionDropped(sectionId);
          return;
        }
        log("heartbeat FAILED", sectionId, data.jsonpError);
        if (options.dropSectionOnError) {
          log("dropping section after error", sectionId);
          forget(sectionId);
          // Distinct from onSectionDropped, which also fires for an ordinary
          // leave: this one says the section went away because something broke,
          // which a UI may want to show rather than just going quiet.
          if (options.onFatal) {
            options.onFatal(sectionId, data.jsonpError);
          }
        }
        return;
      }
      stats.heartbeats = stats.heartbeats + 1;
      if (options.verbose()) {
        log("heartbeat ok", sectionId, "#" + stats.heartbeats);
      }
    });
  }

  function poll(sectionId, entry) {
    var sid = entry.sessionId;
    call("poll", { sid: sid }, function (data) {
      if (live[sectionId] !== entry || entry.sessionId !== sid) {
        return;
      }
      if (data === null) {
        if (options.verbose()) {
          log("poll: no response (timeout)", sectionId);
        }
        return;
      }
      if (data.jsonpError) {
        stats.errors = stats.errors + 1;
        log("poll FAILED", sectionId, data.jsonpError);
        return;
      }
      stats.polls = stats.polls + 1;
      // An empty array applies nothing and leaves the current rosters standing.
      options.onNotifications(data);
    });
  }

  function beat(sectionId, entry) {
    heartbeat(sectionId, entry);
    poll(sectionId, entry);
  }

  // One pass over every desired section: get it a session if it lacks one,
  // otherwise beat. This is the only place sessions are made or used, so a section
  // that failed to register simply tries again next time round.
  function pump() {
    var i, sectionId, entry;
    stats.lastTickAt = new Date().toISOString();
    for (i = 0; i < order.length; i++) {
      sectionId = order[i];
      entry = live[sectionId];
      if (!entry || entry.creating) {
        continue;
      }
      if (!entry.sessionId) {
        createSession(sectionId, entry);
      } else {
        beat(sectionId, entry);
      }
    }
  }

  function tick() {
    try {
      pump();
    } catch (e) {
      // a throw here would kill the interval — never let that happen
    }
  }

  function removeSession(sectionId) {
    var entry = live[sectionId];
    if (entry && entry.sessionId) {
      stats.removes = stats.removes + 1;
      log("removing session", entry.sessionId, sectionId);
      // Best-effort on leave. NOT guaranteed on tab-close — the server's TTL is
      // the real backstop, which is why the heartbeat exists at all.
      call("remove", { sid: entry.sessionId }, function () {});
    }
  }

  return {
    /**
     * Make the live set match `ids`. Safe to call every pass with the same list —
     * a section already held is left strictly alone, session and all.
     */
    setDesired: function (ids) {
      var i, id;
      var added = [];

      // Gone: remove server-side, then forget locally.
      for (i = order.length - 1; i >= 0; i--) {
        id = order[i];
        if (CCPSections.indexOfString(ids, id) === -1) {
          removeSession(id);
          forget(id);
        }
      }

      // New: register interest now; the pass below gets them sessions.
      for (i = 0; i < ids.length; i++) {
        id = ids[i];
        if (!live[id]) {
          live[id] = { sessionId: "", creating: false };
          order.push(id);
          added.push(id);
        }
      }

      if (!order.length) {
        stopTicking();
        return;
      }
      if (!timer) {
        timer = window.setInterval(tick, options.tickMs);
      }
      // Give the new sections a session now rather than making them wait out a
      // full interval — but only them: the sections already held keep their own
      // cadence instead of being beaten early every time the set changes.
      for (i = 0; i < added.length; i++) {
        createSession(added[i], live[added[i]]);
      }
    },

    stop: function () {
      var i;
      stopTicking();
      for (i = order.length - 1; i >= 0; i--) {
        removeSession(order[i]);
        forget(order[i]);
      }
    },

    ids: function () {
      return order.slice(0);
    },

    stats: function () {
      return {
        sections: order.length,
        ids: order.slice(0),
        tickEveryMs: options.tickMs,
        creates: stats.creates,
        heartbeats: stats.heartbeats,
        polls: stats.polls,
        removes: stats.removes,
        errors: stats.errors,
        restarts: stats.restarts,
        lastTickAt: stats.lastTickAt
      };
    }
  };
};
