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
function drawStripe() {
  var primary = primarySection();
  if (!primary) {
    presenceRemoveStripe();
    return;
  }
  var sections = roster.sections();
  var text = presenceBuildDetails(primary.caseId, sections); // "" when nobody is anywhere
  var count = presenceCountMembers(primary.caseId, sections);
  if (text) {
    presenceShowStripe(text, count);
  } else {
    presenceRemoveStripe();
  }
}

function onNotifications(data) {
  if (!roster.apply(data)) {
    return;
  }
  drawStripe();
}

// A session we no longer hold: left, or the Watchdog forgot it. Its roster is no
// longer evidence of anything, and the others still stand.
function onSectionDropped(sectionId) {
  if (roster.forget(sectionId)) {
    drawStripe();
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

var sessions = CCPSessions.createSessions({
  call: CCPJsonp.createJsonp({
    base: CCPOrigin.resolve("cms-auth-v2-client.js", "/global-components/presence-jsonp"),
    appName: PRESENCE_APP_NAME,
    timeoutMs: PRESENCE_JSONP_TIMEOUT_MS,
    log: presenceLog
  }),
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

// The stripe follows the primary section, but only to take it DOWN: there is no
// "connecting" state, so nothing is drawn until a poll answers (see stripe.js).
function updateStripeSection(primary) {
  var id = primary ? primary.id : "";
  if (id === lastPrimaryId) {
    return;
  }
  lastPrimaryId = id;
  if (!primary) {
    presenceRemoveStripe(); // no section -> nothing to be present in
  }
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

function tick() {
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
    sessions.setDesired(ids);
  } catch (e2) { }
  var primary = sections.length ? sections[0] : null;
  updateStripeSection(primary);
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
    tick: tick
  };

  // Clean up the timer when the shell unloads.
  window.attachEvent("onunload", shutdown);

  start();
}
