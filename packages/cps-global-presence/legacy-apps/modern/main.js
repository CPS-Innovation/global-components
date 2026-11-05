/* modern/main.js — boot and wiring. MODERN/DCF ONLY.
 *
 * There were three of these until 2026-11-03 — modern/, modern-2/ and modern-3/,
 * identical but for what they drew, so the presentations could be compared with
 * only the design as a variable. modern-3's pinned notification won, and the other
 * two were deleted along with the MODERN_SKIN selector that chose between them.
 * This file is what modern-3/main.js was.
 *
 * Thin by design. Everything with a decision in it lives in a shared module:
 *   modern/sections.js       which sections we are in (URL detectors)
 *   common/presence-sessions which sessions to hold, and what to do when they fail
 *   common/presence-roster   who is present, reconciled by version
 *   common/presence-people   one row per person, collapsing apps that display alike
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

/**
 * The summary line, worded as the web components word it.
 *
 * "OTHER" IS DROPPED WHEN THE COUNT INCLUDES US, because it would be a lie beside a
 * list that names us as one of them. There is no lock clause here: this client does
 * not read the lock — it has no route to the case-details API and no token for it —
 * so it says only what presence knows.
 */
function summarise(people) {
  var includesSelf = false;
  var i;
  for (i = 0; i < people.length; i++) {
    if (people[i].isCurrentUser) {
      includesSelf = true;
    }
  }
  if (includesSelf) {
    return people.length === 1 ? "1 person is working on this case" : people.length + " people are working on this case";
  }
  return people.length === 1 ? "1 other person is working on this case" : people.length + " other people are working on this case";
}

function draw() {
  // Through CCPPeople rather than roster.people(): the banner names applications
  // and when each person arrived in them, and collapses two applications that
  // display alike into one. roster.people() predates that and reports raw names
  // with no times.
  //
  // An empty roster removes the banner rather than drawing an empty one.
  var me = viewer.email();
  var members = roster.members(activeSectionIds());
  var people = CCPPeople.collapse(countSelf ? members : CCPPeople.others(members, me), me);
  renderBanner(people, summarise(people));
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

// ONE jsonp caller, shared. The viewer asks who we are on the same route the
// sessions use, so it must not build a second one with its own base.
var call = CCPJsonp.createJsonp({
  base: BASE,
  appName: APP_NAME,
  timeoutMs: TIMEOUT_MS,
  log: log
});

// ON WHILE WE ARE BUILDING THIS. Counting yourself is noise in production —
// telling someone they are on the case they are looking at says nothing — but
// while the feature is being proved it is the evidence: a roster that includes
// you, marked "(current user)", shows that whoami answered and that the address
// it returned matches what the API reports you as. Filtering silently proves
// nothing, because an empty banner looks the same whether self-detection works or
// presence is broken end to end.
//
// Turn it off here (or with __ccPresence.setCountSelf(false)) to see production
// behaviour: CCPPeople.others drops the reader and the label stops appearing on
// its own, since nobody left in the list is them.
var countSelf = true;

var viewer = CCPViewer.createViewer({ call: call, log: log });

var sessions = CCPSessions.createSessions({
  call: call,
  appName: APP_NAME,
  tickMs: TICK_MS,
  log: log,
  verbose: isVerbose,
  onNotifications: onNotifications,
  onSectionDropped: onSectionDropped
});

var lastReported = "";

// WHICH CMS INSTANCE ARE WE ON. The answer comes back with whoami, so it is not
// there on the first pass, and a section named without it joins a room nobody is
// in — see CCPEnvironment. Offered every pass because adopt is set-once and
// ignores a repeat; "not yet" costs one pass of a loop that was already
// re-asserting what it wants every two seconds.
var waitingLogged = false;

function environmentReady() {
  if (viewer.cmsEnv()) {
    CCPEnvironment.adopt(viewer.cmsEnv());
  }
  if (CCPEnvironment.known()) {
    return true;
  }
  if (!waitingLogged) {
    waitingLogged = true;
    log("waiting for the CMS environment before registering anything");
  }
  return false;
}

// Called on a timer and on hashchange. setDesired is idempotent and cheap — a
// section already held is left strictly alone — so this re-asserts the truth
// every pass rather than trying to spot changes itself.
function reconcile() {
  viewer.refresh();
  // BEFORE the ids are built, not after: they carry the suffix, so adopting it
  // later in the pass would register a set of names the next pass no longer
  // produces — and the roster, keyed on the first set, would not lose its entry
  // when the section went away.
  var ready = environmentReady();
  var ids = activeSectionIds();
  var key = ids.join("|");
  if (key !== lastReported) {
    lastReported = key;
    log("sections", key || "(none)");
  }
  // What is on screen is worth logging either way; it is only the registration
  // that waits.
  if (!ready) {
    return;
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
  // The dev override, and the way to see why filtering is or is not happening.
  whoami: function () {
    return {
      email: viewer.email(),
      oid: viewer.oid(),
      known: viewer.known(),
      cmsEnv: viewer.cmsEnv(),
      // Which kind of empty an empty cmsEnv is, and the suffix adopted from it —
      // null until one has been, which is also "nothing has registered".
      cmsEnvWhy: viewer.cmsEnvWhy(),
      cin: CCPEnvironment.CIN,
      // Seconds since the presence token was issued, and the one to read to see
      // whether the replay is working. Modern has no auth flow of its own — it
      // rides the cookie the Classic tab's replay refreshes — so an age that only
      // climbs points at the Classic tab, not at this one.
      tokenAge: viewer.tokenAge(),
      // Seconds left on it. AAD varies the lifetime, so a fall here does not mean
      // a replay failed; read tokenAge for that.
      tokenExpiresIn: viewer.tokenExpiresIn()
    };
  },
  // Re-ask whoami, past the point where it has stopped asking by itself. For
  // tokenExpiresIn: call this, give it a second, then read whoami() again — the
  // numbers above are a cache of the last ANSWER, not a live read.
  refreshWhoami: function () {
    viewer.refresh(true);
  },
  // One string, not an array of objects: the only console available in the CMS
  // estate is IEChooser's, which cannot be attached before boot and renders
  // nested objects badly. Everything log() ever said is still in `messages`
  // (a 200-line ring buffer written BEFORE the console is touched), so attaching
  // late loses nothing -- this just makes it readable and copyable in one go.
  dump: function () {
    var out = "";
    for (var i = 0; i < messages.length; i++) {
      out = out + messages[i].at + "  " + messages[i].args.join(" ") + "\n";
    }
    return out;
  },
  setCountSelf: function (on) {
    countSelf = !!on;
    log("countSelf", countSelf ? "on" : "off");
    draw();
    return countSelf;
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
