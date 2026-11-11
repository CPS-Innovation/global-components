/* apps/classic/main.js — the observation loop and wiring. CLASSIC ONLY.
 *
 * Runs a low-frequency pass that asks the locator what is on screen, tells the
 * session layer to match it, and keeps the banner in step. Everything with a
 * decision in it lives elsewhere:
 *   classic/sections.js      which sections are active (frame readers)
 *   legacy/sessions which sessions to hold, and what failure means
 *   core/roster   who is present, reconciled by version
 *   classic/stripe.js        the red footer stripe and its details accordion
 *   classic/event-sink.js    the finer contact-edit events
 *
 * WHAT CHANGED when this stopped being one file: presence used to start and stop
 * with the contact-edit events, so exactly one section could be held and the
 * "editing"/"closed" pair drove everything. Those are now separate questions —
 * the sections drive presence, the contact panel drives the event sink — because
 * a user is present on a case whether or not a panel happens to be open, and can
 * be in more than one section at a time.
 */

var INTERVAL = 3000; // ms between observation passes

// Reported to the presence API as the joining application. The njs adapter
// defaults a MISSING appName to exactly this, but CCPJsonp always sends one, so
// it is now stated rather than relied upon.
var PRESENCE_APP_NAME = "CMS Classic";

var PRESENCE_JSONP_TICK_MS = 3000; // heartbeat + poll cadence
var PRESENCE_JSONP_TIMEOUT_MS = 8000; // per-call watchdog (JSONP has no error event)

var timer;
var lastKey = ""; // the primary section's contact key; "" means nothing open
var lastRec = null; // and the record we reported for it
var lastPrimaryId = ""; // the section the stripe is currently about

// Who is reading this page, and WHICH CMS INSTANCE they are on. Classic had no
// viewer at all until the CIN suffix stopped being a hardcoded constant: there
// was nothing it needed to ask about itself, since the stripe names everyone
// including the reader. Created in the guarded block at the foot of this file,
// not here — createViewer asks whoami on construction, and the switch promises a
// disabled bundle makes no JSONP call.
var viewer = null;

// The preview flags, read from the IE-MODE cookie jar — the one the preview
// page's own saves never reach. Created in the same guarded block as the viewer,
// and for the same reason: createPreview asks on construction.
//
// One flag is acted on — caseLockingCountSelf, through shouldCountSelf() below.
var preview = null;

// WHETHER THE READER IS COUNTED among the people on the case: the
// caseLockingCountSelf preview flag, the same rule as Modern and the web
// components (see CCPPreview's countSelf). Off unless explicitly on, so a QA user
// alone on a case sees no stripe, and it appears only when somebody else really
// is there.
//
// Classic used to count the reader unconditionally — it never filtered at all —
// which is why "(current user)" showed here whatever the preview page said.
//
// __ccPresence.setCountSelf(true|false) overrides the flag for this page;
// setCountSelf(null) hands control back to it.
var countSelfOverride = null;

function shouldCountSelf() {
  if (countSelfOverride !== null) {
    return countSelfOverride;
  }
  return preview ? preview.countSelf() : false;
}

var roster = CCPRoster.createRoster();

// EVERYTHING IS RECORDED, NOTHING IS PRINTED. Classic ships no routine console
// output: this file runs inside CMS, where an unexpected console call in an old
// document mode is a real risk. But it used to throw every line away, which meant
// the shared engine's account of timeouts, 410s and failed creates never reached
// anyone, and an intermittent stripe had nothing to explain it. Now every line
// goes into a ring buffer from boot: __ccPresence.dump() reads it back, and
// __ccPresence.setConsole(true) echoes new lines live. The ONE unprompted console
// line is still presenceConnectionFailed's, said once per page.
var presenceLogBuffer = CCPLog.createLog({ prefix: "[cc-presence]", echo: false });
var presenceLog = presenceLogBuffer.log;

function isVerbose() {
  return presenceLogBuffer.verbose();
}

// Arrivals and departures, masked, whenever the roster changes.
function logRosterChanges() {
  var said = CCPLog.describeChanges(roster.takeChanges());
  if (said) {
    presenceLog("roster", said);
  }
}

// The record the event sink expects, filled from whatever the reader supplied.
function recordFor(section) {
  var hint = section.hint ? section.hint : {};
  return {
    key: hint.key ? hint.key : section.id,
    caseId: section.caseId,
    personId: hint.personId ? hint.personId : "",
    recorderId: hint.recorderId ? hint.recorderId : "",
    name: hint.name ? hint.name : "",
    role: hint.role ? hint.role : ""
  };
}

// The stripe is about ONE case — the one the user is looking at — even when
// several sections of it are held. Detector order decides which that is, so the
// registry in sections.js is also a priority list.
function primarySection() {
  var sections = activeSections();
  return sections.length ? sections[0] : null;
}

// The event sink means "a subject's edit panel opened / closed". Being on a case
// is not that: since the case-wide section is active on every case screen, driving
// the sink from it would turn a transition signal into a near-constant one and
// change what a consumer of __ccContactLogger.onChange has been promised. So the
// sink follows the finest section, and ignores the case around it.
function subjectSection(sections) {
  var i;
  for (i = 0; i < sections.length; i++) {
    if (sections[i].kind !== CCPKinds.CASE) {
      return sections[i];
    }
  }
  return null;
}

// Show the stripe whenever ANY section of the case has members — there is no
// threshold, so a case where only you are present still says so. An empty roster
// takes it away rather than leaving an empty red bar on the page.
//
// TWO things change the answer and both call this: a new roster, and a new primary
// section. Only the first used to — see updateStripeSection for why that was not
// as broken as it looks, and why it is still worth not relying on.
//
// The primary is passed in rather than looked up because tick() has just walked
// the frames for it, and at document mode 5 that walk is not free.
//
// `reason` says what asked for the redraw. It goes into the log only when what
// the reader can see changes (see CCPLog's ui), which is how "the stripe went away
// and came back" becomes a pair of lines that name their causes.
// What the stripe shows for one case. An unanswered whoami means an empty viewer
// address, so nobody is filtered: one person too many, never a colleague hidden.
function currentView(caseId) {
  return CCPView.build({
    members: roster.members(activeSectionIds(), caseId),
    viewerEmail: viewer ? viewer.email() : "",
    countSelf: shouldCountSelf()
  });
}

function drawStripe(primary, reason) {
  if (!primary) {
    presenceRemoveStripe();
    presenceLogBuffer.ui(false, 0, "no section on screen (" + reason + ")");
    return;
  }
  // Filtered to the primary case: the stripe is about the case on screen, while the
  // roster can still hold another case's sections between a navigation and the
  // sessions layer dropping them.
  var view = currentView(primary.caseId);
  if (view.count) {
    presenceShowStripe(view);
    presenceLogBuffer.ui(true, view.count, reason);
  } else {
    presenceRemoveStripe();
    presenceLogBuffer.ui(false, 0, "nobody else on case " + primary.caseId + " (" + reason + ")");
  }
}

function onNotifications(data, sectionId) {
  if (!roster.apply(data, sectionId)) {
    return;
  }
  logRosterChanges();
  drawStripe(primarySection(), "roster changed");
}

// A session we no longer hold: left, or the Watchdog forgot it. Its roster is no
// longer evidence of anything, and the others still stand.
function onSectionDropped(sectionId) {
  if (roster.forget(sectionId)) {
    logRosterChanges();
    drawStripe(primarySection(), "section dropped " + sectionId);
  }
}

// THE STRIPE COMES BACK WHEN THE CALLS DO. A failed call takes it down (see
// presenceConnectionFailed). It used to stay down until the ROSTER changed,
// because a redraw was only ever asked for by a roster change or a section change.
// Polls return deltas, so on a quiet case the polls after an outage say nothing
// new, and the stripe stayed away until somebody arrived or left. One 8-second
// timeout could hide the people on a case for as long as nobody moved, and that
// is a large part of what "sometimes on, sometimes off" looked like.
//
// Now the sessions layer says when a troubled section answers again, and once no
// held section is still in trouble the stripe is redrawn from the roster it
// already holds.
function onRecovered(sectionId, downMs) {
  if (sessions.anyTroubled()) {
    presenceLog("stripe stays down: another section is still not answering");
    return;
  }
  drawStripe(primarySection(), "calls answering again after " + downMs + "ms");
}

// Presence is not working. Take the UI away rather than leaving a stale roster on
// screen implying we still know who is present, and say so ONCE per page load:
// the sessions layer retries on every pass, so a logged line per failure would be
// a line every three seconds for as long as the outage lasts.
var presenceFailureLogged = false;

//
// Every occurrence still reaches the ring buffer, through the sessions layer's
// "trouble START" line and the UI HIDE below. Only the console line is once.
function presenceConnectionFailed(reason, sectionId, op) {
  presenceRemoveStripe();
  presenceLogBuffer.ui(false, 0, "trouble " + (op ? op + " " : "") + (sectionId ? sectionId + " " : "") + reason);
  if (presenceFailureLogged) {
    return;
  }
  presenceFailureLogged = true;
  try {
    if (window.console && window.console.log) {
      window.console.log("There was an error connecting to The Watchdog: " + reason + " (history: window.__ccPresence.dump())");
    }
  } catch (e) { }
}

// A refused credential is worth one more question: how old is the token? See
// CCPViewer's recheck, which keeps this to one whoami a minute.
function presenceAuthRefused(reason) {
  if (viewer && /\b40[13]\b/.test(reason)) {
    viewer.recheck(reason);
  }
}

// ONE jsonp caller, shared with the viewer: whoami goes out on the same route
// the sessions use, so there must not be a second base.
var presenceCall = CCPJsonp.createJsonp({
  base: CCPOrigin.resolve("/global-components/presence-jsonp"),
  appName: PRESENCE_APP_NAME,
  timeoutMs: PRESENCE_JSONP_TIMEOUT_MS,
  log: presenceLog
});

var sessions = CCPSessions.createSessions({
  call: presenceCall,
  appName: PRESENCE_APP_NAME,
  tickMs: PRESENCE_JSONP_TICK_MS,
  log: presenceLog,
  verbose: isVerbose,
  onNotifications: onNotifications,
  onSectionDropped: onSectionDropped,
  // Classic's original behaviour: a non-410 error takes the section down rather
  // than beating a session the server has an opinion about. The next observation
  // pass puts it straight back, because the section is still on screen — so this
  // is "start again", not "give up".
  dropSectionOnError: true,
  // Classic hides the stripe on ANY failed call, including a plain timeout. The
  // shared module stays silent on those for Modern/DCF, which keeps its banner up
  // and simply retries, so this is opt-in per client rather than a change to the
  // failure semantics both share.
  onTrouble: function (sectionId, reason, op) {
    presenceConnectionFailed(reason, sectionId, op);
    presenceAuthRefused(reason);
  },
  onRecovered: onRecovered
});

// The stripe follows the primary section: moving to a different one re-asks what
// the stripe should say, and moving off every section takes it away.
//
// It used to redraw in the second case ONLY — its comment said "but only to take
// it DOWN". That was less broken than it reads, and the distinction is worth
// keeping: leaving a section also drops its session, which fires onSectionDropped
// -> roster.forget -> drawStripe, so the stripe did come down. But that route only
// fires when the roster HELD an entry under the same key the detector produced —
// not when nobody else was in the section, and not if the server echoed a key we
// do not hold. A section change is as much a reason to redraw as a roster change,
// so this no longer leans on the other route to be correct.
//
// There is still no "connecting" state. Arriving somewhere the cached roster knows
// nothing about yields no detail text, so the stripe comes DOWN and stays down
// until that case's first poll answers (see stripe.js).
function updateStripeSection(primary) {
  var id = primary ? primary.id : "";
  if (id === lastPrimaryId) {
    return;
  }
  lastPrimaryId = id;
  drawStripe(primary, "section changed to " + (id || "(none)"));
}

// The contact-edit events, unchanged in meaning: emitted on transition only, and
// a switch from contact A to contact B emits "closed" A then "editing" B.
function updateEvents(primary) {
  var rec = primary ? recordFor(primary) : null;
  var key = rec ? rec.key : "";
  if (key === lastKey) {
    return; // no change since the last pass -> stay quiet
  }
  var prev = lastRec;
  lastRec = rec;
  lastKey = key;
  if (prev) {
    sendEvent("closed", prev); // includes the A -> B switch case
  }
  if (rec) {
    sendEvent("editing", rec);
  }
}

// WHICH CMS INSTANCE ARE WE ON. The answer comes back with whoami, so it is not
// there on the first pass, and a section named without it joins a room nobody is
// in — see CCPEnvironment. So every pass offers what the viewer has (adopt is
// set-once and ignores a repeat) and registers nothing until something has been
// adopted. "Not yet" costs one observation pass; the loop was already
// re-asserting what it wants every three seconds.
//
// Only the REGISTRATION waits. The contact-edit events below are a separate
// concern with no rooms in it, and the stripe reflects a roster that is simply
// empty until sessions exist.
var waitingLogged = false;

function environmentReady() {
  if (viewer && viewer.cmsEnv()) {
    CCPEnvironment.adopt(viewer.cmsEnv());
  }
  if (CCPEnvironment.known()) {
    return true;
  }
  if (!waitingLogged) {
    waitingLogged = true;
    presenceLog("waiting for the CMS environment before registering anything");
  }
  return false;
}

// What the frame readers see, whenever that changes. A section that vanishes for
// one pass and comes back is a frame caught mid-navigation, and it costs a remove,
// a create and a stripe that blinks; this is the line that shows it happening.
var lastSectionsKey = "";

function logSections(ids) {
  var key = ids.join("|");
  if (key === lastSectionsKey) {
    return;
  }
  lastSectionsKey = key;
  presenceLog("sections", key || "(none)");
}

function tick() {
  // FIRST, and before the frames are read: the section ids below are built with
  // the suffix, so adopting it after detection would spend one whole pass
  // registering unsuffixed ids — and the roster would then be keyed under names
  // the next pass no longer produces, so leaving a section would not take its
  // entry with it.
  //
  // Separately guarded from the registration below: a viewer that threw on every
  // pass must not be able to stop sessions it has already unblocked.
  var ready = false;
  try {
    if (viewer) {
      viewer.refresh();
    }
  } catch (e1) { }
  try {
    ready = environmentReady();
  } catch (e0) { }

  var sections = [];
  try {
    sections = activeSections();
  } catch (e) {
    sections = [];
  }
  var ids = [];
  var i;
  for (i = 0; i < sections.length; i++) {
    ids.push(sections[i].id);
  }
  logSections(ids);
  try {
    if (ready) {
      sessions.setDesired(ids);
    }
  } catch (e2) { }
  var primary = sections.length ? sections[0] : null;
  // Guarded like the two calls above it, and for the same reason: the UI is the
  // least important thing this pass does, and it must not be able to stop the
  // contact-edit events that follow. It used to be safe by accident — all it could
  // reach was presenceRemoveStripe, which swallows its own failures — and it now
  // builds the roster text as well.
  try {
    updateStripeSection(primary);
    // Put the stripe back if CMS replaced the document it was in. A navigation that
    // changes neither the section nor the roster still destroys it, so neither of
    // the redraw triggers would notice. Idempotent and cheap on a quiet pass.
    presenceRefreshStripe();
  } catch (e3) { }
  updateEvents(subjectSection(sections));
}

function start() {
  if (timer) {
    return;
  }
  tick();
  timer = window.setInterval(tick, INTERVAL);
}

function stop() {
  if (timer) {
    window.clearInterval(timer);
    timer = null;
  }
}

// Best-effort close when the shell goes away while a contact is still open. Not
// guaranteed (a killed tab runs nothing) — see the TTL note in the header.
function shutdown() {
  if (lastRec) {
    var prev = lastRec;
    lastRec = null;
    lastKey = "";
    try {
      sendEvent("closed", prev);
    } catch (e) { }
  }
  try {
    sessions.stop();
  } catch (e2) { }
  stop();
}

// NOTHING ABOVE THIS LINE STARTS ANYTHING. The switch is honoured here, at the
// single point where the loop begins and the diagnostics appear — so a disabled
// bundle observes no sections, makes no JSONP call, renders no stripe and resizes
// no frameset, and publishes no handles either. The hand-written client returned
// early from its IIFE instead; the IIFE boundary is build.sh's here, so the guard
// is at the other end of the same file.
if (CMS_WATCHDOG_ENABLED === true) {
  // The first JSONP call of the page, and the reason this is not at module scope:
  // createViewer asks whoami on construction.
  viewer = CCPViewer.createViewer({ call: presenceCall, log: presenceLog });

  // A SECOND caller, on the state route rather than the presence adapter,
  // because that is where the preview cookie is scoped — an op on the adapter
  // would not be sent the cookie it was asking about. namePrefix must differ
  // from the default: callback names are minted per instance, so two callers
  // sharing a prefix would overwrite each other's window properties and deliver
  // responses to the wrong one. See CCPJsonp.createJsonp.
  preview = CCPPreview.createPreview({
    call: CCPJsonp.createJsonp({
      base: CCPOrigin.resolve("/global-components/state/preview"),
      appName: PRESENCE_APP_NAME,
      timeoutMs: PRESENCE_JSONP_TIMEOUT_MS,
      namePrefix: "__ccpp_",
      log: presenceLog
    }),
    log: presenceLog,
    // Redraw when the answer lands: it decides whether the reader is counted, and
    // the roster may already have been drawn without it.
    onChange: function () {
      drawStripe(primarySection(), "preview flags arrived");
    }
  });

  // start/stop/tick so the loop can be driven from the console, and onChange as
  // the seam for calling an endpoint without editing this file.
  window.__ccContactLogger = { start: start, stop: stop, tick: tick };

  // Presence diagnostics, mirroring the Modern client so the same questions can
  // be asked of either app.
  window.__ccPresence = {
    sections: activeSections,
    sessions: function () {
      return sessions.stats();
    },
    // What the stripe would say for the case on screen.
    roster: function () {
      var primary = primarySection();
      return primary ? currentView(primary.caseId).lines : [];
    },
    rosterBySection: function () {
      return roster.sections();
    },
    // What the stripe thinks it is doing. Added after an investigation that had to
    // read the frameset by hand to find out; see presenceStripeSnapshot for how to
    // read it.
    stripe: function () {
      return presenceStripeSnapshot();
    },
    // WHY NOTHING REGISTERED, when nothing has. presenceLog is a no-op in
    // Classic (see its comment), so this is the only way to see the viewer's
    // answer: cmsEnvWhy names which kind of empty an empty cmsEnv is, and cin is
    // null until something has been adopted.
    whoami: function () {
      return {
        email: viewer ? viewer.email() : "",
        oid: viewer ? viewer.oid() : "",
        known: viewer ? viewer.known() : false,
        cmsEnv: viewer ? viewer.cmsEnv() : "",
        cmsEnvWhy: viewer ? viewer.cmsEnvWhy() : "",
        cin: CCPEnvironment.CIN,
        // THE ONE TO READ to see whether __ccAuthHandover's replay is working:
        // seconds since the presence token was issued, so near-zero means one was
        // minted moments ago. -1 means there is no token to age.
        tokenAge: viewer ? viewer.tokenAge() : -1,
        // Seconds left on it. For sizing the replay interval, NOT for deciding
        // whether a refresh happened — AAD varies the lifetime, so this can fall
        // after a successful replay.
        tokenExpiresIn: viewer ? viewer.tokenExpiresIn() : 0,
        // The claim names our presence token carries — names only, no values.
        // Answers "is claim X configured on the app registration" from a live
        // session; nothing in the client reads it.
        claimKeys: viewer ? viewer.claimKeys() : "",
        // The reader's Entra group IDs — assigned groups they are a member of. Not
        // acted on yet; a group-gated feature will read viewer.inGroup(id).
        groups: viewer ? viewer.groups() : []
      };
    },
    // Re-ask whoami, past the point where it has stopped asking by itself. For
    // tokenExpiresIn: call this, give it a second, then read whoami() again. The
    // numbers above are a cache of the last ANSWER, so without this they stay at
    // their boot values for the life of the tab.
    refreshWhoami: function () {
      if (viewer) {
        viewer.refresh(true);
      }
    },
    // The preview flags THIS client can see — what reached the IE-mode cookie
    // jar, which is not the jar the preview page writes with its own saves. An
    // empty object after pressing "Copy these settings to CMS" on the preview
    // page means the copy did not arrive; see preview.js.
    //
    // countSelf is what this page is actually doing, override included — the one
    // flag that is acted on.
    preview: function () {
      return preview
        ? { known: preview.known(), flags: preview.flags(), countSelf: shouldCountSelf() }
        : { known: false, flags: {}, countSelf: shouldCountSelf() };
    },
    // true/false overrides the preview flag for this page; null follows it again.
    setCountSelf: function (on) {
      countSelfOverride = on === null || on === undefined ? null : !!on;
      presenceLog("countSelf", countSelfOverride === null ? "from preview" : countSelfOverride ? "on" : "off");
      drawStripe(primarySection(), "countSelf override");
      return shouldCountSelf();
    },
    refreshPreview: function () {
      if (preview) {
        preview.refresh(true);
      }
    },
    tick: tick,
    // THE HISTORY. Everything this client has logged since boot, oldest first, as
    // one copyable string; see presenceLogBuffer. The first thing to run when the
    // stripe has been coming and going.
    dump: function () {
      return presenceLogBuffer.dump();
    },
    messages: presenceLogBuffer.messages,
    // Echo new lines to the console as they happen. Off by default in Classic.
    setConsole: function (on) {
      return presenceLogBuffer.setEcho(on);
    },
    // Log every heartbeat and every failed call, not just the first of a run.
    setVerbose: function (on) {
      return presenceLogBuffer.setVerbose(on);
    }
  };

  presenceLog("client loaded", "base=" + CCPOrigin.resolve("/global-components/presence-jsonp"));

  // Clean up the timer when the shell unloads.
  window.attachEvent("onunload", shutdown);

  start();
}
