/* apps/modern/main.js — boot and wiring. MODERN/DCF ONLY.
 *
 * There were three of these until 2026-11-03 — modern/, modern-2/ and modern-3/,
 * identical but for what they drew, so the presentations could be compared with
 * only the design as a variable. modern-3's pinned notification won, and the other
 * two were deleted along with the MODERN_SKIN selector that chose between them.
 * This file is what modern-3/main.js was.
 *
 * Thin by design. Everything with a decision in it lives in a shared module:
 *   modern/sections.js       which sections we are in (URL detectors)
 *   legacy/sessions which sessions to hold, and what to do when they fail
 *   core/roster   who is present, reconciled by version
 *   core/people   one row per person, collapsing apps that display alike
 *   modern/bar.js            what that looks like on screen
 * This file owns only the loop that connects them, and the diagnostics surface.
 *
 * TRANSPORT: JSONP, the same as Classic — one mechanism for both legacy apps. A
 * working SignalR implementation is archived under
 * infra/proxy/reference/signalr-presence-transport/ with instructions for bringing
 * it back; it was retired on merit, not on feasibility.
 */

var JSONP_PATH = "/global-components/presence-jsonp";

// The preview state, read on the SAME path its cookie is scoped to. It is not an
// op on the presence adapter precisely because of that scoping: the cookie is not
// sent to /global-components/presence-jsonp, so an op there could not read the
// thing it was asking about.
var PREVIEW_PATH = "/global-components/state/preview";

// Reported to the presence API as the joining application. DCF and CMS Modern are
// one app in users' minds, so the API models them under a single name.
var APP_NAME = "CMS Modern";

var TICK_MS = 3000; // heartbeat + poll, matching the Classic client
var TIMEOUT_MS = 8000; // per-call watchdog
var POLL_MS = 2000; // how often to re-read the URL

// The shared ring buffer, echoing to the console as this client always has. See
// CCPLog: the same buffer Classic keeps, so __ccPresence.dump() reads the same way
// in both apps.
var modernLog = CCPLog.createLog({ prefix: "[cc-presence]", echo: true });
var log = modernLog.log;
var messages = modernLog.messages;

function isVerbose() {
  return modernLog.verbose();
}

var BASE = CCPOrigin.resolve(JSONP_PATH);
var roster = CCPRoster.createRoster();

/**
 * The summary line — the web components' sentence, from the shared content module
 * rather than a copy of it. It used to be a copy, with a comment promising it was
 * "worded as the web components word it"; see CCPContent for why that promise was
 * not keepable.
 *
 * NO LOCK CLAUSE. This client does not read the lock — it has no route to the
 * case-details API and no token for it — so it omits the third argument and gets
 * the presence-only sentence, which is the same one the web component shows for an
 * unlocked case.
 */
function summarise(people) {
  var includesSelf = false;
  var i;
  for (i = 0; i < people.length; i++) {
    if (people[i].isCurrentUser) {
      includesSelf = true;
    }
  }
  return CCPContent.summary(people.length, includesSelf);
}

// `reason` says what asked for the redraw, and is logged only when what the reader
// can see changes (CCPLog's ui).
function draw(reason) {
  // Through CCPPeople rather than roster.people(): the banner names applications
  // and when each person arrived in them, and collapses two applications that
  // display alike into one. roster.people() predates that and reports raw names
  // with no times.
  //
  // An empty roster removes the banner rather than drawing an empty one.
  var me = viewer.email();
  var members = roster.members(activeSectionIds());
  var people = CCPPeople.collapse(shouldCountSelf() ? members : CCPPeople.others(members, me), me);
  renderBanner(people, summarise(people));
  modernLog.ui(people.length > 0, people.length, people.length ? reason : "nobody else here (" + reason + ")");
}

// Arrivals and departures, masked, whenever the roster changes. Replaces logging
// the whole roster on every change, which repeated the same names each time and
// put full addresses into a buffer that gets pasted into tickets.
function logRosterChanges() {
  var said = CCPLog.describeChanges(roster.takeChanges());
  if (said) {
    log("roster", said);
  }
}

// Snapshots arrive per section and are version-guarded inside the roster, so
// polls from several sections merge without ordering assumptions.
function onNotifications(list) {
  if (roster.apply(list)) {
    logRosterChanges();
    draw("roster changed");
  } else if (isVerbose()) {
    log("no change");
  }
}

// A section we no longer hold a session for — left, or evicted. Its roster
// described a world we can no longer vouch for; the other sections stand.
function onSectionDropped(sectionId) {
  if (roster.forget(sectionId)) {
    log("forgot section", sectionId);
    logRosterChanges();
    draw("section dropped " + sectionId);
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

// WHETHER THE READER IS COUNTED: the caseLockingCountSelf preview flag, through
// preview.countSelf() — the same rule as Classic and the web components. Off
// unless the flag is explicitly on, so a QA user alone on a case sees nothing and
// the banner appears only when somebody else really is there.
//
// On, it is the evidence that self-identification works: a roster that includes
// you, marked "(current user)", shows that whoami answered and that the address it
// returned matches what the API reports you as. Off, an empty banner looks the
// same whether that works or presence is broken end to end — so tick the flag to
// prove it, rather than reading anything into its absence.
//
// __ccPresence.setCountSelf(true|false) overrides the flag for this page;
// setCountSelf(null) hands control back to it.
var countSelfOverride = null;

function shouldCountSelf() {
  if (countSelfOverride !== null) {
    return countSelfOverride;
  }
  return preview.countSelf();
}

var viewer = CCPViewer.createViewer({ call: call, log: log });

// A SECOND caller, because the preview state is on a different path — the state
// route, where its cookie is scoped, not the presence adapter. namePrefix must
// differ from the default: callback names are minted per instance, so two callers
// sharing a prefix would overwrite each other's window properties and deliver
// responses to the wrong one. See CCPJsonp.createJsonp.
var previewCall = CCPJsonp.createJsonp({
  base: CCPOrigin.resolve(PREVIEW_PATH),
  appName: APP_NAME,
  timeoutMs: TIMEOUT_MS,
  namePrefix: "__ccpp_",
  log: log
});

// onChange redraws: the flag decides whether the reader is counted, and its answer
// can land after the roster has already been drawn.
var preview = CCPPreview.createPreview({
  call: previewCall,
  log: log,
  onChange: function () {
    draw("preview flags arrived");
  }
});

var sessions = CCPSessions.createSessions({
  call: call,
  appName: APP_NAME,
  tickMs: TICK_MS,
  log: log,
  verbose: isVerbose,
  onNotifications: onNotifications,
  onSectionDropped: onSectionDropped,
  // The banner stays up through trouble, unlike Classic's stripe: a failed call
  // here is logged by the sessions layer and retried. The one thing worth doing on
  // top is asking how old the token is when the API refuses it, which is the
  // difference between "Classic's auth replay has stopped working" (Modern rides
  // the cookie it refreshes) and a network problem.
  onTrouble: function (sectionId, reason) {
    if (/\b40[13]\b/.test(reason)) {
      viewer.recheck(reason);
    }
  }
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
    draw("left from the console");
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
      tokenExpiresIn: viewer.tokenExpiresIn(),
      // The claim names our presence token carries — names only, no values.
      // Answers "is claim X configured on the app registration" from a live
      // session; nothing in the client reads it.
      claimKeys: viewer.claimKeys(),
      // The reader's Entra group IDs — assigned groups they are a member of. Not
      // acted on yet; this is the input a group-gated feature will read through
      // viewer.inGroup(id).
      groups: viewer.groups()
    };
  },
  // Re-ask whoami, past the point where it has stopped asking by itself. For
  // tokenExpiresIn: call this, give it a second, then read whoami() again — the
  // numbers above are a cache of the last ANSWER, not a live read.
  refreshWhoami: function () {
    viewer.refresh(true);
  },
  // The preview flags this client can see — i.e. what reached the IE-MODE cookie
  // jar, which is a different jar from the one the preview page writes with its
  // own saves. An empty object after pressing "Copy these settings to CMS" on the
  // preview page means the copy did not arrive; see preview.js.
  //
  // countSelf is what this page is actually doing, override included — the one
  // flag that is acted on.
  preview: function () {
    return { known: preview.known(), flags: preview.flags(), countSelf: shouldCountSelf() };
  },
  refreshPreview: function () {
    preview.refresh(true);
  },
  // One string, not an array of objects: the only console available in the CMS
  // estate is IEChooser's, which cannot be attached before boot and renders
  // nested objects badly. Everything log() ever said is still in `messages`
  // (a 200-line ring buffer written BEFORE the console is touched), so attaching
  // late loses nothing -- this just makes it readable and copyable in one go.
  dump: function () {
    return modernLog.dump();
  },
  // true/false overrides the preview flag for this page; null follows it again.
  setCountSelf: function (on) {
    countSelfOverride = on === null || on === undefined ? null : !!on;
    log("countSelf", countSelfOverride === null ? "from preview" : countSelfOverride ? "on" : "off");
    draw("countSelf override");
    return shouldCountSelf();
  },
  setVerbose: function (on) {
    return modernLog.setVerbose(on);
  },
  // Stop (or restart) echoing to the console. The buffer keeps recording either way.
  setConsole: function (on) {
    return modernLog.setEcho(on);
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
