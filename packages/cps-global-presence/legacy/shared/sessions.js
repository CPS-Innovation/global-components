/* legacy/shared/sessions.js — hold a session per active section. SHARED, MODE 5 FLOOR.
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
 *   - any other error keeps the session and retries on the next pass. Dropping it
 *     would abandon a session the server still holds and register a second one.
 *   - a create that fails is retried on the next pass rather than leaving the
 *     section unregistered until the user navigates.
 *
 * WHAT THE UI DOES ABOUT IT IS THE CLIENT'S: onTrouble fires on every call that
 * did not answer usefully, including a plain timeout, and onRecovered when it
 * answers again. The retry happens either way.
 *
 * Every callback checks `live[id] !== entry` before acting. Entries are replaced by
 * identity, so a section that was removed and re-added mid-flight correctly ignores
 * the older reply instead of adopting a dead session id.
 */

var CCPSessions = {};


/**
 * HOW LONG A CALL MAY TAKE before it is worth a log line, though it answered. JSONP
 * calls normally come back in well under a second; one that takes several is the
 * first sign of the timeouts that follow it.
 */
CCPSessions.SLOW_MS = 2000;

/**
 * @param {{call: function(string, Object, function(*): void): void,
 *          appName: string, tickMs: number,
 *          log: function(...*): void, verbose: function(): boolean,
 *          onNotifications: function(Array, string=): void,
 *          onSectionDropped: function(string): void,
 *          onTrouble?: function(string, string, string=): void,
 *          onRecovered?: function(string, number): void}} options
 * @returns {{setDesired: function(string[]): void, stop: function(): void,
 *            ids: function(): string[], stats: function(): Object,
 *            anyTroubled: function(): boolean}}
 */
CCPSessions.createSessions = function (options) {
  var call = options.call;
  var log = options.log;

  var TIMEOUT = "no response (timeout)";

  // getTime(), not Date.now(): the floor is document mode 5.
  function now() {
    return new Date().getTime();
  }

  // Every call goes through here so its round trip can be measured. The JSONP
  // layer knows only when a call left and when it came back; this is where the
  // section it was for is known, so this is where the time is worth reporting.
  function timed(op, params, onData) {
    var startedAt = now();
    call(op, params, function (data) {
      onData(data, now() - startedAt);
    });
  }

  var live = {}; // sectionId -> entry, see newEntry
  var order = []; // the same ids, kept as an array: no Object.keys at mode 5
  var timer = null;
  var lastTickMs = 0; // when the pass last ran, to notice when the browser held it back
  /** @type {{creates: number, heartbeats: number, polls: number, errors: number,
   *          restarts: number, removes: number, lastTickAt: string|null,
   *          timeouts: number, troubles: number, lateTicks: number,
   *          maxTickGapMs: number, slowCalls: number,
   *          lastTrouble: {at: string, op: string, sectionId: string, reason: string}|null}} */
  var stats = {
    creates: 0,
    heartbeats: 0,
    polls: 0,
    errors: 0,
    restarts: 0,
    removes: 0,
    lastTickAt: null,
    timeouts: 0,
    troubles: 0,
    lateTicks: 0,
    maxTickGapMs: 0,
    slowCalls: 0,
    lastTrouble: null
  };

  // troubledSince is the moment a section stopped answering usefully, 0 while it
  // is healthy. It is what turns a run of failures into ONE "trouble START" and
  // ONE "recovered after" line, rather than a line every three seconds that would
  // push the start of the outage out of the ring buffer.
  function newEntry() {
    return {
      sessionId: "",
      creating: false,
      troubledSince: 0,
      troubles: 0,
      lastReason: "",
      okBeats: 0,
      lastOkAt: 0
    };
  }

  // "That call did not tell us anything." Never fatal, never a reason not to
  // retry. Logged at the START of a run and whenever its reason changes; every
  // call in between is counted, and logged too when verbose.
  function trouble(sectionId, entry, op, reason, ms) {
    var at = now();
    stats.troubles = stats.troubles + 1;
    if (reason === TIMEOUT) {
      stats.timeouts = stats.timeouts + 1;
    }
    stats.lastTrouble = { at: CCPUtil.stamp(), op: op, sectionId: sectionId, reason: String(reason) };
    if (!entry.troubledSince) {
      entry.troubledSince = at;
      entry.troubles = 1;
      entry.lastReason = String(reason);
      log(
        "trouble START",
        op,
        sectionId,
        reason,
        ms + "ms",
        entry.lastOkAt ? "last ok " + (at - entry.lastOkAt) + "ms ago" : "never answered ok",
        "— retrying every pass"
      );
    } else {
      entry.troubles = entry.troubles + 1;
      if (String(reason) !== entry.lastReason || options.verbose()) {
        entry.lastReason = String(reason);
        log("trouble", op, sectionId, reason, ms + "ms", "#" + entry.troubles);
      }
    }
    if (options.onTrouble) {
      options.onTrouble(sectionId, String(reason), op);
    }
  }

  // A call that answered usefully. Ends a troubled run, if there was one, and
  // says so with how long it lasted: that duration is how long a Classic reader
  // was without the stripe.
  function ok(sectionId, entry, op, ms) {
    var at = now();
    var down;
    entry.lastOkAt = at;
    if (ms > CCPSessions.SLOW_MS) {
      stats.slowCalls = stats.slowCalls + 1;
      log("slow", op, sectionId, ms + "ms");
    }
    if (!entry.troubledSince) {
      return;
    }
    down = at - entry.troubledSince;
    log(
      "recovered",
      sectionId,
      "after " + down + "ms,",
      entry.troubles + " failed call(s), last: " + entry.lastReason,
      "(via " + op + ")"
    );
    entry.troubledSince = 0;
    entry.troubles = 0;
    entry.lastReason = "";
    if (options.onRecovered) {
      options.onRecovered(sectionId, down);
    }
  }

  function forget(sectionId) {
    var at = CCPUtil.indexOf(order, sectionId);
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
    lastTickMs = 0;
  }

  function createSession(sectionId, entry) {
    entry.creating = true;
    log("creating session", sectionId, "as", options.appName);
    timed("create", { sectionId: sectionId }, function (data, ms) {
      if (live[sectionId] !== entry) {
        return; // superseded while in flight
      }
      entry.creating = false;
      if (data === null || data.jsonpError || !data.sessionId) {
        var why = data === null ? TIMEOUT : data.jsonpError || "no sessionId in response";
        stats.errors = stats.errors + 1;
        trouble(sectionId, entry, "create", why, ms);
        return;
      }
      stats.creates = stats.creates + 1;
      entry.sessionId = data.sessionId;
      entry.okBeats = 0;
      log("session", entry.sessionId, "for", sectionId, ms + "ms");
      ok(sectionId, entry, "create", ms);
      beat(sectionId, entry);
    });
  }

  function heartbeat(sectionId, entry) {
    var sid = entry.sessionId;
    timed("heartbeat", { sid: sid }, function (data, ms) {
      if (live[sectionId] !== entry || entry.sessionId !== sid) {
        return;
      }
      if (data === null) {
        // Transient — retry next pass. Still reported: a client whose UI claims
        // to know who is present has stopped being able to say that.
        trouble(sectionId, entry, "heartbeat", TIMEOUT, ms);
        return;
      }
      if (data.jsonpError) {
        stats.errors = stats.errors + 1;
        if (data.jsonpError.indexOf("410") > -1) {
          // The session is gone, and so is the truth of its roster.
          stats.restarts = stats.restarts + 1;
          // NOT trouble(): nothing is broken. The section is dropped, so the
          // roster it stood for goes with it and the UI follows from that.
          //
          // How long since the last good heartbeat is the number that explains a
          // 410: the Watchdog expires a session it has not heard from, so a long
          // gap here (a late tick, a run of timeouts) is the cause, not the server.
          log(
            "heartbeat: session expired (410) — recreating",
            sectionId,
            "after " + entry.okBeats + " good heartbeat(s),",
            entry.lastOkAt ? "last ok " + (now() - entry.lastOkAt) + "ms ago" : "never answered ok"
          );
          entry.sessionId = "";
          options.onSectionDropped(sectionId);
          return;
        }
        trouble(sectionId, entry, "heartbeat", data.jsonpError, ms);
        return;
      }
      stats.heartbeats = stats.heartbeats + 1;
      entry.okBeats = entry.okBeats + 1;
      ok(sectionId, entry, "heartbeat", ms);
      if (options.verbose()) {
        log("heartbeat ok", sectionId, "#" + stats.heartbeats, ms + "ms");
      }
    });
  }

  function poll(sectionId, entry) {
    var sid = entry.sessionId;
    timed("poll", { sid: sid }, function (data, ms) {
      if (live[sectionId] !== entry || entry.sessionId !== sid) {
        return;
      }
      if (data === null) {
        trouble(sectionId, entry, "poll", TIMEOUT, ms);
        return;
      }
      if (data.jsonpError) {
        stats.errors = stats.errors + 1;
        trouble(sectionId, entry, "poll", data.jsonpError, ms);
        return;
      }
      stats.polls = stats.polls + 1;
      // BEFORE the notifications are handed on, so a client that redraws on
      // recovery sees the section as healthy when it does.
      ok(sectionId, entry, "poll", ms);
      // An empty array applies nothing and leaves the current rosters standing.
      options.onNotifications(data, sectionId);
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
    stats.lastTickAt = CCPUtil.stamp();
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

  // A pass that arrives long after it was due means the browser held our timers
  // back: a background tab, a machine waking from sleep, a page busy with
  // something else. Heartbeats stop for as long as that lasts, the Watchdog's TTL
  // runs out, and the next heartbeat earns a 410, which looks like presence
  // flickering for no reason. This line is that reason.
  function noteGap() {
    var at = now();
    var gap = lastTickMs ? at - lastTickMs : 0;
    lastTickMs = at;
    if (gap > stats.maxTickGapMs) {
      stats.maxTickGapMs = gap;
    }
    if (gap > options.tickMs * 2) {
      stats.lateTicks = stats.lateTicks + 1;
      log("tick late by " + (gap - options.tickMs) + "ms — timers held back (background tab, sleep or a busy page?)");
    }
  }

  function tick() {
    try {
      noteGap();
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
      var removed = [];

      // Gone: remove server-side, then forget locally.
      for (i = order.length - 1; i >= 0; i--) {
        id = order[i];
        if (CCPUtil.indexOf(ids, id) === -1) {
          removed.push(id);
          removeSession(id);
          forget(id);
        }
      }

      // New: register interest now; the pass below gets them sessions.
      for (i = 0; i < ids.length; i++) {
        id = ids[i];
        if (!live[id]) {
          live[id] = newEntry();
          order.push(id);
          added.push(id);
        }
      }

      // What the client is ASKING to hold, whenever that changes. A section that
      // goes and comes back a pass later is a detector that lost sight of it for
      // one pass (a frame mid-navigation), and it costs a remove, a create and a
      // stripe that blinks; this pair of lines is how that shows up.
      if (added.length || removed.length) {
        log(
          "desired",
          added.length ? "+" + added.join(",+") : "",
          removed.length ? "-" + removed.join(",-") : "",
          "now holding " + order.length
        );
      }

      if (!order.length) {
        stopTicking();
        return;
      }
      if (!timer) {
        lastTickMs = now();
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

    // Whether any held section is in the middle of a troubled run. Classic keeps
    // its stripe down until this is false again.
    anyTroubled: function () {
      var i, entry;
      for (i = 0; i < order.length; i++) {
        entry = live[order[i]];
        if (entry && entry.troubledSince) {
          return true;
        }
      }
      return false;
    },

    stats: function () {
      var troubled = [];
      var i, entry;
      for (i = 0; i < order.length; i++) {
        entry = live[order[i]];
        if (entry && entry.troubledSince) {
          troubled.push(order[i] + " for " + (now() - entry.troubledSince) + "ms: " + entry.lastReason);
        }
      }
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
        timeouts: stats.timeouts,
        troubles: stats.troubles,
        troubled: troubled,
        lastTrouble: stats.lastTrouble,
        slowCalls: stats.slowCalls,
        lateTicks: stats.lateTicks,
        maxTickGapMs: stats.maxTickGapMs,
        lastTickAt: stats.lastTickAt
      };
    }
  };
};
