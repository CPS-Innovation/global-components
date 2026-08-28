/* modern/main.js — boot and wiring. MODERN/DCF ONLY.
 *
 * Thin by design. Everything with a decision in it lives in a shared module:
 *   modern/sections.js       which sections we are in (URL detectors)
 *   common/presence-sessions which sessions to hold, and what to do when they fail
 *   common/presence-roster   who is present, reconciled by version
 *   modern/bar.js            what that looks like on screen
 * This file owns only the loop that connects them, and the diagnostics surface.
 *
 * TRANSPORT: JSONP, the same as Classic — one mechanism for both legacy apps. A
 * working SignalR implementation is archived under
 * infra/proxy/reference/signalr-presence-transport/ with instructions for bringing
 * it back; it was retired on merit, not on feasibility.
 */

var JSONP_PATH = "/global-components/presence-jsonp";

// Reported to the presence API as the joining application. DCF and CMS Modern are
// one app in users' minds, so the API models them under a single name.
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

function isVerbose() {
  return verbose;
}

var BASE = resolveJsonpBase(JSONP_PATH);
var roster = CCPRoster.createRoster();

function draw() {
  // An empty roster removes the bar rather than drawing an empty one.
  renderBar(roster.people(), APP_NAME);
}

// Snapshots arrive per section and are version-guarded inside the roster, so
// polls from several sections merge without ordering assumptions.
function onNotifications(list) {
  if (roster.apply(list)) {
    log("roster", roster.describe());
    draw();
  } else if (verbose) {
    log("no change");
  }
}

// A section we no longer hold a session for — left, or evicted. Its roster
// described a world we can no longer vouch for; the other sections stand.
function onSectionDropped(sectionId) {
  if (roster.forget(sectionId)) {
    log("forgot section", sectionId);
    draw();
  }
}

var sessions = CCPSessions.createSessions({
  call: CCPJsonp.createJsonp({
    base: BASE,
    appName: APP_NAME,
    timeoutMs: TIMEOUT_MS,
    log: log
  }),
  appName: APP_NAME,
  tickMs: TICK_MS,
  log: log,
  verbose: isVerbose,
  onNotifications: onNotifications,
  onSectionDropped: onSectionDropped
});

var lastReported = "";

// Called on a timer and on hashchange. setDesired is idempotent and cheap — a
// section already held is left strictly alone — so this re-asserts the truth
// every pass rather than trying to spot changes itself.
function reconcile() {
  var ids = activeSectionIds();
  var key = ids.join("|");
  if (key !== lastReported) {
    lastReported = key;
    log("sections", key || "(none)");
  }
  sessions.setDesired(ids);
}

window.__ccPresence = {
  messages: messages,
  status: function () {
    return {
      base: BASE,
      appName: APP_NAME,
      location: describeLocation(),
      sections: activeSections(),
      sessions: sessions.stats()
    };
  },
  roster: function () {
    return roster.people();
  },
  describeRoster: function () {
    return roster.describe();
  },
  sections: function () {
    return activeSections();
  },
  rosterBySection: function () {
    return roster.sections();
  },
  reconcile: reconcile,
  leave: function () {
    sessions.stop();
    roster.clear();
    draw();
  },
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
    sessions.stop();
  }, false);
}
