/* classic/main.js — the observation loop and wiring. CLASSIC ONLY.
 *
 * Runs a low-frequency pass that asks the locator what is on screen, tells the
 * session layer to match it, and keeps the banner in step. Everything with a
 * decision in it lives elsewhere:
 *   classic/sections.js      which sections are active (frame readers)
 *   common/presence-sessions which sessions to hold, and what failure means
 *   common/presence-roster   who is present, reconciled by version
 *   classic/banner.js        the menu-bar icon and its popup
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
var lastPrimaryId = ""; // the section the banner is currently about

var roster = CCPRoster.createRoster();

function presenceLog() {
  // Classic ships no console output: this file runs inside CMS, where an
  // unexpected console call in an old document mode is a real risk. The
  // diagnostics seam below is the way to see what is happening.
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

// The banner is about ONE case — the one the user is looking at — even when
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

function drawBanner(caseId) {
  var sections = roster.sections();
  var tip = presenceBuildTooltip(caseId, sections); // "" when nobody is anywhere
  var count = presenceCountMembers(caseId, sections);
  if (tip) {
    presenceShowBanner(tip, count);
  } else {
    presenceRemoveBanner();
  }
}

function onNotifications(data) {
  if (!roster.apply(data)) {
    return;
  }
  var primary = primarySection();
  if (primary) {
    drawBanner(primary.caseId);
  }
}

// A session we no longer hold: left, or the Watchdog forgot it. Its roster is no
// longer evidence of anything, and the others still stand.
function onSectionDropped(sectionId) {
  if (roster.forget(sectionId)) {
    var primary = primarySection();
    if (primary) {
      drawBanner(primary.caseId);
    }
  }
}

// Non-recoverable: surface it the way the original did — "!" in place of the
// head-count, with the reason in the popup — rather than leaving a stale roster
// on screen implying we still know who is there.
function onFatal() {
  presenceShowBanner(PRESENCE_ERROR_TIP, PRESENCE_ERROR_MARK);
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
  // Classic's original behaviour: a non-410 error is not retried, it is shown.
  dropSectionOnError: true,
  onFatal: onFatal
});

// The banner follows the primary section: a new one shows "connecting" until the
// first poll answers, and no section at all takes the banner away.
function updateBanner(primary) {
  var id = primary ? primary.id : "";
  if (id === lastPrimaryId) {
    return;
  }
  lastPrimaryId = id;
  if (!primary) {
    presencePopupFrameName = null; // no section -> nowhere to anchor -> no popup
    presenceRemoveBanner();
    return;
  }
  // Where the popup renders. null when the section declared no host frame, in
  // which case banner.js renders no popup at all — there is no default.
  presencePopupFrameName = primary.hint && primary.hint.popupFrame ? primary.hint.popupFrame : null;
  // Show the icon at once: the section IS supported, we simply do not know the
  // roster yet. Replaced by the real numbers on the first successful poll.
  presenceShowBanner(PRESENCE_CONNECTING_TIP, PRESENCE_CONNECTING_DOTS);
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
  updateBanner(primary);
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

// start/stop/tick so the loop can be driven from the console, and onChange as the
// seam for calling an endpoint without editing this file.
window.__ccContactLogger = { start: start, stop: stop, tick: tick };

// Presence diagnostics, mirroring the Modern client so the same questions can be
// asked of either app.
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
