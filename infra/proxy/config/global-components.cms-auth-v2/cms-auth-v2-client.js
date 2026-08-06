/* cms-auth-v2-client.js
 * Injected into the persistent CMS frameset shell (uaglCMS.aspx <head>), which
 * loads once per session and persists THROUGH login (the login page and the app
 * both load into the shell's frameMain). Two independent concerns, each its own
 * IIFE so a failure in one cannot affect the other:
 *   1. Contact-edit logger (immediately below) — observes the Witnesses &
 *      details screen and reports which contact is being edited.
 *   2. Login -> id-token handover (bottom of file) — on login, spawns the auth
 *      iframe and copies the resulting cross-subdomain cookie into localStorage.
 *
 * ---- Concern 1: contact-edit logger ----------------------------------------
 *
 * !! IE MODE / DOCUMENT-MODE 5 (old JScript). DO NOT let Prettier format this !!
 * Trailing commas in object literals or call argument lists are a SYNTAX ERROR
 * here ("SCRIPT1028: Expected identifier, string or number"); the whole file
 * then fails to parse and silently never runs. This file is listed in
 * /.prettierignore for exactly that reason. Also: no const/let/arrow functions,
 * no Array.indexOf/forEach, no String.trim, no JSON, no querySelector, no
 * addEventListener, no MutationObserver. Use var, function declarations,
 * manual loops, document.all/getElementsByTagName and attachEvent.
 *
 * Reports which victim/witness contact's right-hand edit panel is open on the
 * Witnesses & details screen (uaccContactDetails.aspx), and when it stops being
 * open. Two identifiers are reported for the selected person:
 *
 *   personId          - the person/party id. This is hidContactId[index]; the
 *                        SAME value appears for that person's Victim and Witness
 *                        rows, and it is what the URL calls intPersonId.
 *   contactRecorderId - the per-witness contact record id, looked up by personId
 *                        from hidContactRecorderWitnessCache
 *                        ("personId,version,recorderId|..."), falling back to
 *                        hidint64OldContactRecorderIdCSV[index]. Empty for a
 *                        victim who is not also a witness.
 *
 * EVENTS — emitted on transition only, never repeated per poll:
 *   "editing" - a contact's edit panel just became open.
 *   "closed"  - that contact's panel is no longer open (Cancel/OK/deselect, the
 *               frame navigated away, or the shell unloaded).
 * Switching contact A -> B emits "closed" A then "editing" B.
 *
 * TO CALL AN ENDPOINT: every event funnels through ONE function, sendEvent() —
 * see the "OUTPUT SINK" section below. Set ENDPOINT_URL, uncomment one line,
 * and you are done; nothing else in this file needs to change.
 *
 * Alternatively, without editing this file at all, assign a handler at runtime:
 *   window.__ccContactLogger.onChange = function (kind, rec) { ... };
 * where kind is "editing"|"closed" and rec is
 *   { key, caseId, personId, recorderId, name, role }.
 * A handler that throws is swallowed and cannot affect CMS.
 *
 * NOTE for endpoint/locking use: a "closed" event is NOT guaranteed. If the tab
 * crashes, the network drops, or the browser is killed, no poll runs and nothing
 * fires. Do not treat "editing" as a lock that only "closed" releases — treat the
 * repeated polling as a heartbeat and give the server-side record a TTL, or you
 * will strand contacts in a permanently-"being edited" state.
 *
 * Mechanism: PURE OBSERVATION. A low-frequency poll locates the (same-origin)
 * ContactDetails frame and passively READS the CMS's own state:
 *   - win.bRHPOpen / win.sRHPType  -> is a victim/witness edit panel open?
 *   - win.objDataRow               -> the selected left-hand row (ContactType,
 *                                     rowIndex) used to compute the slot index.
 *   - hidden <input> values        -> ids/names at that index.
 * It NEVER wraps, patches or assigns to any CMS function or variable, so it
 * cannot change CMS behaviour.
 *
 * Cost of pure observation vs a function hook: a transition is reported up to one
 * poll interval late, and an open-then-close inside a single interval is not seen
 * at all (neither event fires, so the pair stays balanced).
 */
(function () {
  var INTERVAL = 3000; // ms between observation passes
  var MAXDEPTH = 64;
  var FRAGMENT = "uaccContactDetails.aspx";
  var VICWIT = "VW"; // VICTIMS_WITNESSES_CONTACT
  var timer;
  var lastRec = null; // last reported contact; null means nothing open
  var lastKey = ""; // its key; "" means nothing open

  function log(msg) {
    if (typeof console !== "undefined" && console.log) {
      console.log(msg);
    }
  }

  function trim(s) {
    return String(s == null ? "" : s).replace(/^\s+|\s+$/g, "");
  }

  // Resolve a hidden field by id, tolerating document-mode-5 quirks.
  function getEl(win, id) {
    var d = win.document;
    var el = null;
    if (d.getElementById) {
      el = d.getElementById(id);
    }
    if (!el && d.all) {
      el = d.all[id];
    }
    return el;
  }

  function fieldVal(win, id) {
    var el = getEl(win, id);
    return el ? el.value : "";
  }

  // Split a CSV hidden field the same way the page does, when we can.
  function splitCsv(win, s) {
    try {
      if (typeof win.trimAndSplit === "function") {
        return win.trimAndSplit(s);
      }
    } catch (e) {}
    return String(s == null ? "" : s).split(",");
  }

  // The contact-recorder id for a person: prefer the per-index witness column,
  // else look the person up in the "personId,version,recorderId|..." cache so it
  // resolves whichever role row (Victim or Witness) was clicked.
  function recorderIdFor(win, personId, idx) {
    var perIdx = splitCsv(win, fieldVal(win, "hidint64OldContactRecorderIdCSV"));
    var v = perIdx[idx];
    if (v && v !== "0") {
      return v;
    }
    var cache = fieldVal(win, "hidContactRecorderWitnessCache");
    if (cache) {
      var rows = cache.split("|");
      var i;
      var cells;
      for (i = 0; i < rows.length; i++) {
        if (!rows[i]) {
          continue;
        }
        cells = rows[i].split(",");
        if (cells[0] === personId) {
          return cells[2];
        }
      }
    }
    return "";
  }

  // Reproduce customClickedRow's row->slot-index math from the selected row.
  // Pinned to CMS 24.0.01's victim/witness/alt-contact layout (3 slots each).
  function indexForRow(win, row) {
    if (!row) {
      return -1;
    }
    var types = splitCsv(win, fieldVal(win, "hidContactType"));
    var nDef = 0;
    var nVic = 0;
    var i;
    for (i = 0; i < types.length; i++) {
      if (types[i] === "Def") {
        nDef++;
      } else if (types[i] === "Victim") {
        nVic++;
      }
    }
    var r = row.rowIndex;
    if (row.ContactType === "Victim") {
      return (r - 1) * 3 + nDef;
    }
    return (nVic + r - 1) * 3 + nDef;
  }

  // Passively read the currently-open victim/witness contact from one frame.
  // Returns an object or null. Reads only.
  function readOpenContact(win) {
    if (!win.bRHPOpen || win.sRHPType !== VICWIT) {
      return null;
    }
    var row = win.objDataRow;
    var idx = indexForRow(win, row);
    if (idx < 0) {
      return null;
    }
    var ids = splitCsv(win, fieldVal(win, "hidContactId"));
    var personId = ids[idx];
    if (personId == null || personId === "" || personId === "0") {
      return null;
    }
    var first = splitCsv(win, fieldVal(win, "hidContactFirstName"));
    var sur = splitCsv(win, fieldVal(win, "hidContactSurname"));
    var recorderId = recorderIdFor(win, personId, idx);
    var role = row && row.ContactType ? row.ContactType : "";
    // i32CaseId is a global on the ContactDetails page; any endpoint will want it.
    var caseId = "";
    try {
      caseId = win.i32CaseId ? String(win.i32CaseId) : "";
    } catch (e) {}
    var rec = {};
    rec.key = caseId + "/" + personId + "/" + (recorderId || "-") + "/" + role;
    rec.caseId = caseId;
    rec.personId = personId;
    rec.recorderId = recorderId;
    rec.name = trim((first[idx] || "") + " " + (sur[idx] || ""));
    rec.role = role;
    return rec;
  }

  // Walk every nested frame; return the open contact from the first same-origin
  // ContactDetails frame that has one, or null.
  function findOpenContact(win, depth) {
    if (depth > MAXDEPTH) {
      return null;
    }
    var frames = win.frames;
    var i;
    var child;
    var href;
    var rec;
    for (i = 0; i < frames.length; i++) {
      child = frames[i];
      href = "";
      try {
        href = child.location.href;
      } catch (e) {} // same-origin only
      if (href.indexOf(FRAGMENT) !== -1) {
        rec = null;
        try {
          rec = readOpenContact(child);
        } catch (e) {}
        if (rec) {
          return rec;
        }
      }
      rec = findOpenContact(child, depth + 1);
      if (rec) {
        return rec;
      }
    }
    return null;
  }

  /* ===================================================================
   * OUTPUT SINK — THE ONE PLACE TO CHANGE TO CALL AN ENDPOINT
   * -------------------------------------------------------------------
   * sendEvent() is the single funnel for every event this script produces.
   * It is called exactly twice in the code below (once for "editing", once
   * for "closed"), so changing it changes all reporting.
   *
   * TO START CALLING AN ENDPOINT:
   *   1. set ENDPOINT_URL below (keep it a SAME-ORIGIN relative path)
   *   2. uncomment the postEvent(kind, rec) line inside sendEvent()
   * Nothing else in this file needs to change. postEvent() is written and
   * ready — it just isn't called.
   *
   * Constraints that shaped the helpers (IE mode / document-mode 5):
   *   - No JSON object, so the body is form-encoded by hand, not stringified.
   *   - XMLHttpRequest may be absent; ActiveXObject is the fallback.
   *   - Keep ENDPOINT_URL same-origin. Old IE needs XDomainRequest for
   *     cross-origin and cannot set request headers on it, which would break
   *     the Authorization header below.
   *   - The "closed" fired from shutdown() happens during unload, where an
   *     async request may be cancelled by the browser (there is no
   *     sendBeacon here). Treat "closed" as best-effort and rely on a
   *     server-side TTL — see the note in the file header.
   * =================================================================== */

  var ENDPOINT_URL = ""; // e.g. "/global-components/case-locking/api/cms-contact-view"
  var ID_TOKEN_STORAGE_KEY = "cms-auth-id-token"; // written to top-window localStorage by the auth flow

  // THE SINK. kind is "editing" | "closed"; rec is
  // { key, caseId, personId, recorderId, name, role }.
  function sendEvent(kind, rec) {
    log("[cc] " + kind + " " + describe(rec));

    // postEvent(kind, rec);   // <-- UNCOMMENT to POST (set ENDPOINT_URL first)

    // Runtime seam: lets a consumer hook in without editing this file.
    // Fully isolated — anything it throws is swallowed and cannot affect CMS.
    var api = window.__ccContactLogger;
    if (api && typeof api.onChange === "function") {
      try {
        api.onChange(kind, rec);
      } catch (e) {}
    }
  }

  function describe(rec) {
    var msg = "caseId=" + (rec.caseId || "-");
    msg = msg + " personId=" + rec.personId;
    msg = msg + " contactRecorderId=" + (rec.recorderId || "-");
    msg = msg + ' name="' + rec.name + '"';
    if (rec.role) {
      msg = msg + " role=" + rec.role;
    }
    return msg;
  }

  // ---- HTTP helpers (ready to use; only called if you uncomment above) ----

  function newXhr() {
    try {
      if (typeof XMLHttpRequest !== "undefined") {
        return new XMLHttpRequest();
      }
    } catch (e) {}
    try {
      return new ActiveXObject("Microsoft.XMLHTTP");
    } catch (e) {}
    return null;
  }

  function readIdToken() {
    try {
      return window.localStorage.getItem(ID_TOKEN_STORAGE_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  // Form-encoded by hand: there is no JSON object in document-mode 5.
  function encodeEvent(kind, rec) {
    var b = "event=" + encodeURIComponent(kind);
    b = b + "&caseId=" + encodeURIComponent(rec.caseId || "");
    b = b + "&personId=" + encodeURIComponent(rec.personId || "");
    b = b + "&contactRecorderId=" + encodeURIComponent(rec.recorderId || "");
    b = b + "&role=" + encodeURIComponent(rec.role || "");
    b = b + "&name=" + encodeURIComponent(rec.name || "");
    return b;
  }

  // Fire-and-forget POST. Never throws, never blocks, ignores the response.
  function postEvent(kind, rec) {
    if (!ENDPOINT_URL) {
      return;
    }
    var xhr = newXhr();
    if (!xhr) {
      return;
    }
    try {
      xhr.open("POST", ENDPOINT_URL, true); // async
      xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
      var token = readIdToken();
      if (token) {
        xhr.setRequestHeader("Authorization", "Bearer " + token);
      }
      xhr.send(encodeEvent(kind, rec));
    } catch (e) {}
  }

  function tick() {
    var rec = null;
    try {
      rec = findOpenContact(window, 0);
    } catch (e) {}
    var key = rec ? rec.key : "";
    if (key === lastKey) {
      return; // no change since last pass -> stay quiet
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

  // Best-effort close when the shell goes away while a contact is still open.
  // Not guaranteed (a killed tab runs nothing) — see the TTL note in the header.
  function shutdown() {
    if (lastRec) {
      var prev = lastRec;
      lastRec = null;
      lastKey = "";
      try {
        sendEvent("closed", prev);
      } catch (e) {}
    }
    stop();
  }

  // Expose start/stop/tick so you can drive it from the console if needed, and
  // onChange as the seam for calling an endpoint.
  window.__ccContactLogger = { start: start, stop: stop, tick: tick };

  // Clean up the timer when the shell unloads.
  window.attachEvent("onunload", shutdown);

  start();
})();

/* ============================================================================
 * Concern 2: LOGIN -> ID-TOKEN HANDOVER
 * ----------------------------------------------------------------------------
 * Independent of the logger above. Watches the CMS login flow from the shell and,
 * when the user has just logged in, spawns the /polaris auth iframe. That flow
 * (a co-equal, SERVER-SIDE part of this solution — NOT in this file) runs the AD
 * round-trip on our own domain and finishes by setting a cross-subdomain cookie:
 *     Set-Cookie: cms-auth-id-token=<jwt>; Domain=cps.gov.uk; Path=/; Secure
 * Because main-system.cps.gov.uk and our-domain.cps.gov.uk share the cps.gov.uk
 * registrable domain, that cookie lands in THIS page's jar. We poll for it, copy
 * it into localStorage (where the HTTP-sink and other consumers read it), then
 * DELETE the cookie immediately so it is not attached to further requests.
 *
 * Why the cookie and not a localStorage write from the iframe's end page? In
 * production the auth flow ends on our-domain — a different origin from
 * main-system — so it cannot touch main-system's localStorage. A Domain-scoped
 * cookie is the only channel that crosses the subdomain boundary with no landing
 * page on main-system. Delete-on-read keeps it alive for ~1s, so the
 * every-request overhead is negligible.
 *
 * Trigger: the shell's frameMain leaving uaulLogin.aspx (login -> app edge). It
 * re-fires if the site returns to login and leaves again (belt-and-braces N>=1);
 * one handover runs at a time. The shell boots ~seconds BEFORE login completes,
 * so we must wait for the edge, not fire on boot.
 *
 * Until the server-side Set-Cookie half is live, a handover just times out and
 * tears down harmlessly — so this can ship independently.
 *
 * IE MODE / DOCUMENT-MODE 5 — same constraints as concern 1 (no JSON, no arrow
 * functions, var + function declarations, no trailing commas).
 * ==========================================================================*/
(function () {
  var BUILD = "diag1"; // bump on redeploy to confirm fresh bytes are live (cache!)
  var DEBUG = true; // verbose per-tick logging; window.__ccAuthHandover.setDebug(false) to quiet

  var POLARIS_PATH = "/polaris-v2"; // auth entry; resolves to THIS (main-system) origin then redirects to our domain. Change freely.
  var LOGIN_FRAGMENT = "uaulLogin.aspx"; // frameMain is "on login" while its URL contains this
  var MAIN_FRAME = "frameMain"; // the shell frame login + app load into
  var COOKIE_NAME = "cms-auth-id-token"; // MUST match the Set-Cookie name the auth callback emits
  var COOKIE_DOMAIN = "cps.gov.uk"; // MUST match the Set-Cookie Domain (for delete-on-read)
  var STORAGE_KEY = "cms-auth-id-token"; // localStorage key consumers read

  var WATCH_INTERVAL = 1000; // ms between login-state checks
  var POLL_INTERVAL = 750; // ms between cookie checks during a handover
  var POLL_TIMEOUT = 45000; // ms to wait for the cookie before giving up

  var wasOnLogin = false; // login-edge detector state
  var handoverActive = false; // guard: one handover at a time
  var ticks = 0; // watch-loop counter (diagnostic)

  function log(msg) {
    if (typeof console !== "undefined" && console.log) {
      console.log("[cc-auth] " + msg);
    }
  }
  function dlog(msg) {
    if (DEBUG) {
      log(msg);
    }
  }

  // Enumerate this window's direct child frames (name = url), tolerating
  // cross-origin children (our spawned auth iframe) which throw on access.
  function listFrames() {
    var out = "";
    try {
      var fr = window.frames;
      var i;
      var nm;
      var hrefx;
      for (i = 0; i < fr.length; i++) {
        nm = "#" + i;
        hrefx = "";
        try {
          nm = fr[i].name || "#" + i;
        } catch (e) {
          nm = "#" + i + "(name?)";
        }
        try {
          hrefx = fr[i].location.href || "";
        } catch (e2) {
          hrefx = "(x-origin)";
        }
        out = out + (out ? ", " : "") + nm + "=" + hrefx;
      }
    } catch (e) {
      return "(window.frames unreadable: " + e + ")";
    }
    return out || "(none)";
  }

  // Names of the cookies in this jar (NOT values — avoid logging the token).
  function cookieNames() {
    var jar = "";
    try {
      jar = document.cookie || "";
    } catch (e) {
      return "(cookie unreadable)";
    }
    var parts = jar.split(";");
    var names = "";
    var i;
    var s;
    var eq;
    var nm;
    for (i = 0; i < parts.length; i++) {
      s = parts[i];
      while (s.charAt(0) === " ") {
        s = s.substring(1);
      }
      eq = s.indexOf("=");
      nm = eq === -1 ? s : s.substring(0, eq);
      if (nm) {
        names = names + (names ? ", " : "") + nm;
      }
    }
    return names || "(no cookies)";
  }

  // The shell frame that login/app load into. Same-origin; guarded + logged.
  function mainFrameHref() {
    var f;
    try {
      f = window.frames[MAIN_FRAME];
    } catch (e) {
      dlog("frameMain lookup threw: " + e);
      return "";
    }
    if (!f) {
      dlog("frameMain '" + MAIN_FRAME + "' not found. frames = " + listFrames());
      return "";
    }
    try {
      return f.location.href || "";
    } catch (e2) {
      dlog("frameMain.location unreadable (x-origin?): " + e2);
      return "";
    }
  }

  // Read a cookie value by name (no String.trim in document-mode 5).
  function readCookie(name) {
    var jar = "";
    try {
      jar = document.cookie || "";
    } catch (e) {
      return "";
    }
    var parts = jar.split(";");
    var i;
    var s;
    for (i = 0; i < parts.length; i++) {
      s = parts[i];
      while (s.charAt(0) === " ") {
        s = s.substring(1);
      }
      if (s.substring(0, name.length + 1) === name + "=") {
        var raw = s.substring(name.length + 1);
        try {
          return decodeURIComponent(raw);
        } catch (e2) {
          return raw;
        }
      }
    }
    return "";
  }

  // Expire the cookie at both the shared registrable domain (where it was set)
  // and the host-only default, so it can't linger on later requests.
  function clearCookie(name) {
    var past = "Thu, 01 Jan 1970 00:00:00 GMT";
    try {
      document.cookie = name + "=; Domain=" + COOKIE_DOMAIN + "; Path=/; expires=" + past;
    } catch (e) {}
    try {
      document.cookie = name + "=; Path=/; expires=" + past;
    } catch (e) {}
  }

  function writeStorage(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
      return true;
    } catch (e) {
      log("localStorage.setItem threw: " + e);
      return false;
    }
  }

  function spawnIframe() {
    var f = null;
    try {
      f = document.createElement("iframe");
      f.src = POLARIS_PATH;
      f.style.display = "none";
      document.documentElement.appendChild(f);
      log("spawned auth iframe src=" + POLARIS_PATH);
    } catch (e) {
      f = null;
      log("spawnIframe FAILED: " + e);
    }
    return f;
  }

  function removeIframe(f) {
    try {
      if (f && f.parentNode) {
        f.parentNode.removeChild(f);
      }
    } catch (e) {}
  }

  // Spawn the auth iframe, wait for the id-token cookie, copy it to localStorage,
  // delete the cookie, tear down. One at a time; re-runnable across logins.
  function runHandover() {
    if (handoverActive) {
      dlog("runHandover ignored — a handover is already active");
      return;
    }
    handoverActive = true;
    log("HANDOVER START — cookies now = " + cookieNames());

    var iframe = spawnIframe();
    var elapsed = 0;
    var polls = 0;
    var pollTimer = window.setInterval(function () {
      elapsed = elapsed + POLL_INTERVAL;
      polls = polls + 1;
      var token = readCookie(COOKIE_NAME);
      if (token) {
        window.clearInterval(pollTimer);
        var ok = writeStorage(token);
        clearCookie(COOKIE_NAME);
        removeIframe(iframe);
        handoverActive = false;
        log("id-token cookie found on poll " + polls + " — " + (ok ? "stored (" + token.length + " chars)" : "read but localStorage write FAILED"));
        return;
      }
      dlog("poll " + polls + ": no " + COOKIE_NAME + " yet; cookies = " + cookieNames());
      if (elapsed >= POLL_TIMEOUT) {
        window.clearInterval(pollTimer);
        removeIframe(iframe);
        handoverActive = false;
        log("GAVE UP after " + polls + " polls (~" + Math.round(elapsed / 1000) + "s) — no " + COOKIE_NAME + " cookie. The /polaris flow either did not run or did not Set-Cookie.");
      }
    }, POLL_INTERVAL);
  }

  // Fire on the login -> app edge: frameMain WAS on the login page and now isn't.
  function watch() {
    ticks = ticks + 1;
    var href = mainFrameHref();
    var onLogin = href ? href.indexOf(LOGIN_FRAGMENT) !== -1 : false;
    dlog("tick " + ticks + ": frameMain=" + (href || "(empty)") + " onLogin=" + onLogin + " wasOnLogin=" + wasOnLogin + " handoverActive=" + handoverActive);
    if (!href) {
      return; // can't read frameMain this tick — keep wasOnLogin as-is
    }
    if (wasOnLogin && !onLogin) {
      log("LOGIN EDGE — frameMain left " + LOGIN_FRAGMENT + " -> " + href);
      runHandover();
    }
    wasOnLogin = onLogin;
  }

  // On-demand state dump: window.__ccAuthHandover.debug()
  function debug() {
    log("=== debug snapshot [" + BUILD + "] ===");
    log("POLARIS_PATH=" + POLARIS_PATH + "  COOKIE_NAME=" + COOKIE_NAME + "  MAIN_FRAME=" + MAIN_FRAME);
    log("frameMain href = " + (mainFrameHref() || "(empty)"));
    log("child frames   = " + listFrames());
    log("wasOnLogin=" + wasOnLogin + "  handoverActive=" + handoverActive + "  ticks=" + ticks);
    log("cookies = " + cookieNames());
    var stored = "(unreadable)";
    try {
      stored = window.localStorage.getItem(STORAGE_KEY) ? "present" : "absent";
    } catch (e) {}
    log("id-token in localStorage: " + stored);
  }

  function setDebug(v) {
    DEBUG = !!v;
    log("DEBUG set to " + DEBUG);
  }

  // Console handles: drive the handover, dump state, or quiet the logging.
  window.__ccAuthHandover = { runNow: runHandover, debug: debug, setDebug: setDebug };

  log("handover watcher booted [" + BUILD + "] DEBUG=" + DEBUG + " — watching frame '" + MAIN_FRAME + "' every " + WATCH_INTERVAL + "ms; POLARIS_PATH=" + POLARIS_PATH);
  window.setInterval(watch, WATCH_INTERVAL);
})();
