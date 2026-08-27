/* modern/main.js — session lifecycle and boot. MODERN/DCF ONLY.
 *
 * Holds ONE presence session for the section the current screen represents:
 *   CMS Modern -> "<caseId>:CASE"          (on the case)
 *   DCF        -> "<caseId>:CASE_REVIEW"   (reviewing the case)
 *
 * Failure semantics follow the Classic client, which is the reference for this
 * API: a 410 on heartbeat means the Watchdog has forgotten the session, so
 * recreate it; a transient timeout (null) is retried on the next tick. We differ
 * on one point deliberately — Classic stops permanently on a non-410 heartbeat
 * error, whereas an observe-only bar is better off continuing to try than going
 * dark for the rest of the session.
 */

var JSONP_PATH = "/global-components/presence-jsonp";

// DCF and CMS Modern are one app in users' minds, so the presence API models them
// under a single name.
var APP_NAME = "CMS Modern";

var TICK_MS = 3000; // heartbeat + poll, matching the Classic client
var TIMEOUT_MS = 8000; // per-call watchdog
var POLL_MS = 2000; // how often to re-read the URL

var messages = [];
var verbose = false;

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

var BASE = resolveJsonpBase(JSONP_PATH);
var roster = CCPRoster.createRoster();
var call = CCPJsonp.createJsonp({ base: BASE, appName: APP_NAME, timeoutMs: TIMEOUT_MS, log: log });

var sessionId = "";
var activeSectionId = "";
var tickTimer = null;
var stats = { creates: 0, heartbeats: 0, polls: 0, errors: 0, restarts: 0, lastTickAt: null };

function draw() {
  renderBar(roster.people(), APP_NAME);
}

function stopTicking() {
  if (tickTimer) {
    window.clearInterval(tickTimer);
    tickTimer = null;
  }
}

function stopSession() {
  stopTicking();
  if (sessionId) {
    log("removing session", sessionId, activeSectionId);
    // Best-effort DELETE on leave. NOT guaranteed on tab-close — the server's TTL
    // is the real backstop, which is why the heartbeat exists at all.
    call("remove", { sid: sessionId }, function () {});
  }
  sessionId = "";
  activeSectionId = "";
  roster.clear();
  removeBar();
}

// A 410 means the Watchdog no longer knows this session. Without one we cannot
// poll, so tear down and rebuild on the same section.
function restartSession() {
  var sid = activeSectionId;
  stats.restarts = stats.restarts + 1;
  stopSession();
  if (sid) {
    startSession(sid);
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
          restartSession();
        } else {
          log("heartbeat FAILED", data.jsonpError);
        }
        return;
      }
      stats.heartbeats = stats.heartbeats + 1;
      if (verbose) {
        log("heartbeat ok", "#" + stats.heartbeats);
      }
    });

    call("poll", { sid: mine }, function (data) {
      if (sessionId !== mine) {
        return;
      }
      if (data === null) {
        if (verbose) {
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
      if (roster.apply(data)) {
        log("roster", activeSectionId, roster.describe());
        draw();
      } else if (verbose) {
        log("poll: no change", "#" + stats.polls);
      }
    });
  } catch (e) {
    // a throw here would kill the interval — never let that happen
  }
}

function startSession(sectionId) {
  activeSectionId = sectionId;
  log("creating session", sectionId, "as", APP_NAME);
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
    tickTimer = window.setInterval(tick, TICK_MS);
  });
}

function reconcile() {
  var context = readContext();
  var wanted = sectionIdForContext(context);
  if (wanted === activeSectionId || (!wanted && !activeSectionId)) {
    return;
  }
  if (activeSectionId) {
    stopSession();
  }
  if (wanted) {
    startSession(wanted);
  }
}

window.__ccPresence = {
  messages: messages,
  context: readContext,
  status: function () {
    return {
      base: BASE,
      appName: APP_NAME,
      activeSectionId: activeSectionId,
      sessionId: sessionId,
      tickEveryMs: TICK_MS,
      stats: stats,
      context: readContext()
    };
  },
  roster: function () {
    return roster.people();
  },
  describeRoster: function () {
    return roster.describe();
  },
  sections: function () {
    return roster.sections();
  },
  reconcile: reconcile,
  leave: stopSession,
  setVerbose: function (on) {
    verbose = !!on;
    log("verbose", verbose ? "on" : "off");
    return verbose;
  }
};

log("client loaded", window.location.href, "base=" + BASE);
reconcile();
window.setInterval(reconcile, POLL_MS);

if (window.addEventListener) {
  window.addEventListener("hashchange", reconcile, false);
  // Best-effort tidy-up so the server need not wait out the TTL.
  window.addEventListener("unload", function () {
    stopSession();
  }, false);
}
