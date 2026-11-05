/* classic/main.js — the observation loop and wiring. CLASSIC ONLY.
 *
 * Runs a low-frequency pass that asks the locator what is on screen, tells the
 * session layer to match it, and keeps the banner in step. Everything with a
 * decision in it lives elsewhere:
 *   classic/sections.js      which sections are active (frame readers)
 *   common/presence-sessions which sessions to hold, and what failure means
 *   common/presence-roster   who is present, reconciled by version
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
// Nothing acts on these yet; see presence-preview.js.
var preview = null;

var roster = CCPRoster.createRoster();

function presenceLog() {
  // Classic ships no routine console output: this file runs inside CMS, where an
  // unexpected console call in an old document mode is a real risk. The
  // diagnostics seam below is the way to see what is happening. The ONE exception
  // is presenceConnectionFailed, which says once that presence is not working.
}

function isVerbose() {
  return false;
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
    if (sections[i].kind !== SECTION_KIND_CASE) {
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
function drawStripe(primary) {
  if (!primary) {
    presenceRemoveStripe();
    return;
  }
  // COLLAPSED HERE, not in the stripe, because this is where the two things the
  // reduction needs live: the viewer's address (so their own row can be marked, and
  // the summary can say "people" rather than "other people") and the primary case
  // (so a roster that still holds a case the reader has navigated away from does
  // not report it). The stripe is handed finished words.
  //
  // An unanswered whoami means viewer.email() is "" and CCPPeople.collapse marks
  // NOBODY — so the reader is counted among the others and the summary says
  // "other people". One person too many, which is the safe direction: the opposite
  // would hide a colleague.
  var me = viewer ? viewer.email() : "";
  var people = CCPPeople.collapse(roster.members(activeSectionIds(), primary.caseId), me);
  var text = presenceBuildDetails(people); // "" when nobody is on this case
  var includesSelf = false;
  var i;
  for (i = 0; i < people.length; i++) {
    if (people[i].isCurrentUser) {
      includesSelf = true;
    }
  }
  if (text) {
    presenceShowStripe(text, people.length, includesSelf);
  } else {
    presenceRemoveStripe();
  }
}

function onNotifications(data) {
  if (!roster.apply(data)) {
    return;
  }
  drawStripe(primarySection());
}

// A session we no longer hold: left, or the Watchdog forgot it. Its roster is no
// longer evidence of anything, and the others still stand.
function onSectionDropped(sectionId) {
  if (roster.forget(sectionId)) {
    drawStripe(primarySection());
  }
}

// Presence is not working. Take the UI away rather than leaving a stale roster on
// screen implying we still know who is present, and say so ONCE per page load:
// the sessions layer retries on every pass, so a logged line per failure would be
// a line every three seconds for as long as the outage lasts.
var presenceFailureLogged = false;

function presenceConnectionFailed(reason) {
  presenceRemoveStripe();
  if (presenceFailureLogged) {
    return;
  }
  presenceFailureLogged = true;
  try {
    if (window.console && window.console.log) {
      window.console.log("There was an error connecting to The Watchdog: " + reason);
    }
  } catch (e) { }
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
  onTrouble: function (sectionId, reason) {
    presenceConnectionFailed(reason);
  }
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
  drawStripe(primary);
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
function environmentReady() {
  if (viewer && viewer.cmsEnv()) {
    CCPEnvironment.adopt(viewer.cmsEnv());
  }
  return CCPEnvironment.known();
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
    log: presenceLog
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
    roster: function () {
      return roster.people();
    },
    describeRoster: function () {
      return roster.describe();
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
        claimKeys: viewer ? viewer.claimKeys() : ""
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
    // page means the copy did not arrive; see presence-preview.js.
    //
    // Nothing acts on these yet.
    preview: function () {
      return preview
        ? { known: preview.known(), flags: preview.flags() }
        : { known: false, flags: {} };
    },
    refreshPreview: function () {
      if (preview) {
        preview.refresh(true);
      }
    },
    tick: tick
  };

  // Clean up the timer when the shell unloads.
  window.attachEvent("onunload", shutdown);

  start();
}
