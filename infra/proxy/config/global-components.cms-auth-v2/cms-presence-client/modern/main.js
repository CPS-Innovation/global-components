/* modern/main.js — boot and transport selection. MODERN/DCF ONLY.
 *
 * Holds ONE presence session for the section the current screen represents:
 *   CMS Modern -> "<caseId>:CASE"          (on the case)
 *   DCF        -> "<caseId>:CASE_REVIEW"   (reviewing the case)
 *
 * This file owns everything that does NOT depend on how we talk to the server:
 * reading the URL, the roster, the bar, and noticing when the user has moved to
 * another case. The talking itself belongs to a transport —
 *   modern/transport-jsonp.js     what ships
 *   modern/transport-signalr.js   loaded on demand, under evaluation
 * — which are interchangeable because the presence API sends the same snapshots
 * down either pipe. Switch at runtime:
 *
 *   __ccPresence.setTransport("signalr")
 *
 * and watch __ccPresence.status().
 */

var JSONP_PATH = "/global-components/presence-jsonp";

// Reported to the hub as the joining application. DCF and CMS Modern are one app
// in users' minds, so the presence API models them under a single name.
var APP_NAME = "CMS Modern";

// JSONP shipping. SignalR is an experiment until we know whether its negotiate
// XHR survives the cross-domain estate; see SIGNALR-CROSS-DOMAIN.md.
var DEFAULT_TRANSPORT = "jsonp";

var TICK_MS = 3000; // JSONP heartbeat + poll, matching the Classic client
var TIMEOUT_MS = 8000; // per-call watchdog
var KEEPALIVE_MS = 5000; // SignalR: server evicts an idle session after 10s
var POLL_MS = 2000; // how often to re-read the URL

var messages = [];
var verbose = false;
var skipNegotiation = false;

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

function isSkipNegotiation() {
  return skipNegotiation;
}

var BASE = resolveJsonpBase(JSONP_PATH);
var roster = CCPRoster.createRoster();

var transportName = DEFAULT_TRANSPORT;
var transport = null;
var activeSectionId = "";

function draw() {
  // An empty roster removes the bar rather than drawing an empty one.
  renderBar(roster.people(), APP_NAME);
}

// Every transport reports the same way: a list of notifications in, a redraw out
// if anything actually changed. Version-guarded inside the roster, so an
// out-of-order snapshot from either pipe is discarded rather than applied.
function onNotifications(list) {
  if (roster.apply(list)) {
    log("roster", activeSectionId, roster.describe());
    draw();
  } else if (verbose) {
    log("no change");
  }
}

// "What you are holding is now fiction" — a dropped session, a reconnect, or a
// deliberate leave. Never a partial update; the next snapshot rebuilds it.
function onReset() {
  roster.clear();
  draw();
}

function createTransport(name) {
  if (name === "signalr") {
    return CCPTransportSignalr.create({
      appName: APP_NAME,
      keepAliveMs: KEEPALIVE_MS,
      log: log,
      verbose: isVerbose,
      skipNegotiation: isSkipNegotiation,
      onNotifications: onNotifications,
      onReset: onReset
    });
  }
  return CCPTransportJsonp.create({
    base: BASE,
    appName: APP_NAME,
    timeoutMs: TIMEOUT_MS,
    tickMs: TICK_MS,
    log: log,
    verbose: isVerbose,
    onNotifications: onNotifications,
    onReset: onReset
  });
}

function stopSession() {
  if (transport) {
    transport.stop();
  }
  activeSectionId = "";
}

function reconcile() {
  var wanted = sectionIdForContext(readContext()) || "";
  if (wanted === activeSectionId) {
    return;
  }
  if (activeSectionId) {
    transport.stop();
  }
  activeSectionId = wanted;
  if (wanted) {
    transport.start(wanted);
  }
}

// Tear the current transport down and rebuild on the same section. Used by both
// setTransport and a bare reconnect(), because they are the same operation.
function reconnect() {
  var section = activeSectionId;
  stopSession();
  transport = createTransport(transportName);
  log("transport", transportName);
  if (section) {
    activeSectionId = section;
    transport.start(section);
  }
  return transportName;
}

transport = createTransport(transportName);

window.__ccPresence = {
  messages: messages,
  context: readContext,
  status: function () {
    return {
      base: BASE,
      appName: APP_NAME,
      transport: transportName,
      activeSectionId: activeSectionId,
      tickEveryMs: TICK_MS,
      stats: transport.stats(),
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
  reconnect: reconnect,
  leave: stopSession,
  transportName: function () {
    return transportName;
  },
  /**
   * Switch transport and reconnect on the same section. "signalr" fetches its
   * vendor bundle on first use, so give it a moment before judging status().
   */
  setTransport: function (name) {
    var wanted = name === "signalr" ? "signalr" : "jsonp";
    if (wanted === transportName) {
      log("transport already", wanted);
      return wanted;
    }
    transportName = wanted;
    return reconnect();
  },
  /**
   * SignalR only, and only for comparing the two failure modes: true avoids the
   * negotiate XHR (so no zone-1406 dialog) at the price of never receiving a
   * push, because negotiate is what puts a client in Azure SignalR Service's
   * delivery path. Call reconnect() to apply.
   */
  setSkipNegotiation: function (on) {
    skipNegotiation = !!on;
    log("skipNegotiation", skipNegotiation, "— call reconnect() to apply");
    return skipNegotiation;
  },
  setVerbose: function (on) {
    verbose = !!on;
    log("verbose", verbose ? "on" : "off");
    return verbose;
  }
};

log("client loaded", window.location.href, "base=" + BASE, "transport=" + transportName);
reconcile();
window.setInterval(reconcile, POLL_MS);

if (window.addEventListener) {
  window.addEventListener("hashchange", reconcile, false);
  // Best-effort tidy-up so the server need not wait out the TTL.
  window.addEventListener("unload", function () {
    stopSession();
  }, false);
}
