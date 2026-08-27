/* cms-auth-v2-client.js
 * Injected into the persistent CMS frameset shell (uaglCMS.aspx <head>), which
 * loads once per session and persists THROUGH login (the login page and the app
 * both load into the shell's frameMain). Two independent concerns, each its own
 * IIFE so a failure in one cannot affect the other:
 *   1. Contact-edit logger + section presence (immediately below) — observes the
 *      Witnesses & details screen, reports which contact is being edited, and (via
 *      the presence API over JSONP) shows an "also viewing" banner when another
 *      user is in the same section.
 *   2. Login -> auth iframe (bottom of file) — on login, spawns the /polaris auth
 *      iframe; its AD callback stashes the id-token in POLARIS localStorage for the
 *      presence API to read same-origin. No cross-subdomain cookie hand-off.
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

/* ===========================================================================
 * ccEndpoint — resolve one of OUR endpoints against the host that SERVED THIS
 * SCRIPT. Shared by both concerns below, hence file scope.
 *
 * A relative URL resolves against the DOCUMENT, not the script. So "/polaris-v2"
 * written here resolves to whichever host serves the CMS page — even when this
 * file was fetched from somewhere else entirely. Deploying the script to another
 * host changes nothing on its own; the page decides.
 *
 * Deriving it instead makes the injected <script src> the SINGLE SWITCH: point
 * the injection at another environment and the auth flow, the presence calls and
 * the client all follow it, with no constant to edit and no app setting to lose.
 * That is what deploy.local.sh's SCRIPT_TARGET_ENV changes.
 *
 * It matters most for the auth flow: the callback sets the presence cookie
 * HOST-ONLY, so the auth iframe must land on the same host as the presence API,
 * or the JSONP adapter never sees the cookie and every call is unauthorised.
 *
 * Falls back to the bare path, which is exactly right when the page and our
 * endpoints share an origin — so this is a NO-OP in a conventional deployment.
 *
 * IE MODE / DOCUMENT-MODE 5 SAFE: getElementsByTagName, String.indexOf and a
 * regex literal. No JSON, no Array methods, no trailing commas.
 * =========================================================================== */
function ccEndpoint(path) {
  var scripts, i, src, match;
  try {
    scripts = document.getElementsByTagName("script");
    for (i = 0; i < scripts.length; i++) {
      src = scripts[i].src ? String(scripts[i].src) : "";
      if (src.indexOf("cms-auth-v2-client.js") !== -1) {
        match = /^(https?:\/\/[^\/]+)/.exec(src);
        if (match) {
          return match[1] + path;
        }
      }
    }
  } catch (e) {
    // an unusual DOM must not stop the client loading
  }
  return path;
}

(function () {
  var INTERVAL = 3000; // ms between observation passes
  var MAXDEPTH = 64;

  // ---- Sections --------------------------------------------------------------
  // The Watchdog tracks "sections" of the site. A section is identified by the URL
  // FRAGMENT of its iframe and has a KIND (the section name The Watchdog knows).
  // Its presence id is built as:
  //   sectionId = caseId ":" KIND             (case-wide sections, no subject)
  //   sectionId = caseId ":" KIND ":" subjId  (subject-scoped sections, e.g. a person)
  // Each section provides a "detector" (see SECTION_DETECTORS below) that reads its
  // frame and returns a presence record (carrying .sectionId) when it is active.
  var FRAGMENT_CONTACTS = "uaccContactDetails.aspx"; // victim/witness edit screen
  var VICWIT = "VW"; // VICTIMS_WITNESSES_CONTACT (sRHPType of the vic/wit RHP)
  var SECTION_KIND_VICTIM_WITNESS = "VICTIM_WITNESS"; // subject-scoped (personId)

  var FRAGMENT_CASE_REVIEW = "uapcPreChargeCaseAnalysis.aspx"; // case review screen
  var FRAGMENT_CASE_REVIEW_CHARGE = "uapcPreChargeDecDetails.aspx";
  var SECTION_KIND_CASE_REVIEW = "CASE_REVIEW"; // case-wide (no subject)

  var FRAGMENT_DEFS_CHARGES = "uadcDefsCharges.aspx"; // Defs & Charges tab (its own frame)
  var SECTION_KIND_DEFENDANT = "DEFENDANT";           // subject-scoped (partyId)

  var FRAGMENT_DOCUMENTS = "uacgSelectDocument.aspx";

  // Which frame HOSTS the hover popup for a section. Pages differ in structure:
  //   - Some sections (e.g. victim/witness) load a FRAMESET into frameMain, and the
  //     content lives in a child frame named "framePage" — so the popup is rendered
  //     there (frameMain itself is a frameset doc whose body never renders).
  //   - Other sections (e.g. case review) are rendered DIRECTLY as frameMain's content
  //     document (no inner frameset, no framePage) — so the popup is rendered into
  //     frameMain's own body.
  // Each SECTION_DETECTORS entry declares its popupFrame so the engine knows where to
  // append the popup (see presenceShowPopup).
  var POPUP_FRAME_PAGE = "framePage"; // inner content frame (frameset pages)
  var POPUP_FRAME_MAIN = "frameMain"; // frameMain rendered directly as content

  var timer;
  var lastRec = null; // last reported contact; null means nothing open
  var lastKey = ""; // its key; "" means nothing open

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
    } catch (e) { }
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

  // Extract a query-string parameter from a URL string. document-mode 5 has no
  // URL / URLSearchParams, so we split by hand. Returns "" when the param is absent
  // (and tolerates a value that fails to decode). Matching is case-sensitive, so the
  // caller must pass the exact CMS param name (e.g. "intCaseID").
  function queryParam(url, name) {
    if (!url) { return ""; }
    var q = url.indexOf("?");
    if (q < 0) { return ""; }
    var qs = url.substring(q + 1);
    var hash = qs.indexOf("#");
    if (hash >= 0) { qs = qs.substring(0, hash); }
    var pairs = qs.split("&");
    var i, kv, val;
    for (i = 0; i < pairs.length; i++) {
      kv = pairs[i].split("=");
      if (kv[0] === name) {
        val = kv.length > 1 ? kv[1] : "";
        try { return decodeURIComponent(val); } catch (e) { return val; }
      }
    }
    return "";
  }

  // Find, within win's subtree (win itself included), the href of the first
  // same-origin frame whose location contains `fragment`, or "" if none. Used by
  // section readers whose caseId lives in a frame's URL rather than in a global.
  function frameHrefContaining(win, fragment, depth) {
    if (depth > MAXDEPTH) { return ""; }
    var href = "";
    try { href = win.location.href; } catch (e) { href = ""; } // x-origin frame
    if (href && href.indexOf(fragment) !== -1) { return href; }
    var frames, i, found;
    try { frames = win.frames; } catch (e2) { return ""; }
    for (i = 0; i < frames.length; i++) {
      found = frameHrefContaining(frames[i], fragment, depth + 1);
      if (found) { return found; }
    }
    return "";
  }

  // Passively read the currently-open victim/witness contact from one frame.
  // Returns a presence record or null. Reads only.
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
    // Victim/witness pages expose the case id as the global i32CaseId.
    var caseId = "";
    try {
      caseId = win.i32CaseId ? String(win.i32CaseId) : "";
    } catch (e) { }
    if (!caseId) {
      return null;
    }
    var first = splitCsv(win, fieldVal(win, "hidContactFirstName"));
    var sur = splitCsv(win, fieldVal(win, "hidContactSurname"));
    var recorderId = recorderIdFor(win, personId, idx);
    var role = row && row.ContactType ? row.ContactType : "";
    var rec = {};
    // Subject-scoped section: the subject is the person, so victim<->witness rows of
    // the SAME person share one sectionId (presence follows the person, not the row).
    rec.sectionId = caseId + ":" + SECTION_KIND_VICTIM_WITNESS + ":" + personId;
    // key is finer than sectionId (adds role/recorder) so a victim<->witness switch
    // still logs a closed/editing transition even though the sectionId is unchanged.
    rec.key = caseId + "/" + personId + "/" + (recorderId || "-") + "/" + role;
    rec.caseId = caseId;
    rec.personId = personId;
    rec.recorderId = recorderId;
    rec.name = trim((first[idx] || "") + " " + (sur[idx] || ""));
    rec.role = role;
    return rec;
  }

  function readWitnessTab(win) {
    var callMode = win.sCallMode;
    if (!callMode || callMode !== "witness") {
      return null;
    }

    var listMode = fieldVal(win, "cboNWitnessMode");
    if (!{ "2": 1, "3": 1, "4": 1, "5": 1 }[listMode]) {
      return null;
    }

    var el = getEl(win, "tblWitnessDetails");
    if (!el || !el.currentStyle) {
      return null;
    }
    var editPanelDisplay = el.currentStyle.display;
    var showingEditPanel = editPanelDisplay !== "none";

    var actionMode = fieldVal(win, "cboYAction");
    var deleteOrMergeAction = !!{ "4": 1, "5": 1 }[actionMode];

    if (!showingEditPanel && !deleteOrMergeAction) {
      return null;
    }

    var href = ""; try { href = win.location.href; } catch (e2) { href = ""; }
    var caseId = queryParam(href, "intCaseID");
    if (!caseId) {
      return null;
    }

    var witnessId = undefined;
    var selectedWitnesses = win.document.getElementById("hidWitnessIdCSV").value;
    if (!!selectedWitnesses && selectedWitnesses != "" && selectedWitnesses.indexOf(",") === -1) {
      witnessId = selectedWitnesses;
    }

    var rec = {};
    rec.sectionId = caseId + ":" + SECTION_KIND_VICTIM_WITNESS + (witnessId ? ":" + witnessId : "");
    rec.key = rec.sectionId;
    rec.caseId = caseId;
    rec.personId = witnessId ? witnessId : "";
    rec.recorderId = "";
    rec.name = "";
    rec.role = "";
    return rec;
  }

  // Case review is a CASE-WIDE section spanning MORE THAN ONE page: the review
  // analysis (uapcPreChargeCaseAnalysis.aspx) and the charge decision
  // (uapcPreChargeDecDetails.aspx) both live under the SAME section, so both must
  // yield the SAME sectionId ("<caseId>:CASE_REVIEW") — that way users on either page
  // merge into one presence roster/count. There is no subject id. Unlike the
  // victim/witness page, case review does NOT expose i32CaseId; the case id is the
  // intCaseID query param of whichever case-review frame is open, e.g.
  //   .../CMS.24.0.01/Case/uapcPreChargeCaseAnalysis.aspx?intCaseID=2121407
  //   .../CMS.24.0.01/Case/uapcPreChargeDecDetails.aspx?intCaseID=2121407
  // so we locate whichever of those frames is present (win or a child) and read the
  // id off its URL. One reader serves both pages (see SECTION_DETECTORS).
  function readCaseReview(win) {
    var href = frameHrefContaining(win, FRAGMENT_CASE_REVIEW, 0);
    if (!href) {
      href = frameHrefContaining(win, FRAGMENT_CASE_REVIEW_CHARGE, 0);
    }
    if (!href) {
      return null;
    }
    var caseId = queryParam(href, "intCaseID");
    if (!caseId) {
      return null;
    }
    var rec = {};
    rec.sectionId = caseId + ":" + SECTION_KIND_CASE_REVIEW;
    rec.key = rec.sectionId;
    rec.caseId = caseId;
    rec.personId = "";
    rec.recorderId = "";
    rec.name = "";
    rec.role = "";
    return rec;
  }

  function readOpenDefendant(win) {
    if (fieldVal(win, "hidInEditMode") !== "Y") { return null; }

    var mode = "";
    try { mode = win.sMode ? String(win.sMode).toLowerCase() : ""; } catch (e2) { }
    if (!mode || mode !== "editdefendant") { return null; }

    var partyId = fieldVal(win, "hidPartyID");
    if (!partyId || partyId === "0") { return null; }

    var caseId = "";
    try { caseId = win.iScreenCaseID ? String(win.iScreenCaseID) : ""; } catch (e) { }
    if (!caseId) {
      var href = ""; try { href = win.location.href; } catch (e2) { href = ""; }
      caseId = queryParam(href, "intCaseID");
    }
    if (!caseId) { return null; }

    var rec = {};
    rec.sectionId = caseId + ":" + SECTION_KIND_DEFENDANT + ":" + partyId;
    rec.key = caseId + "/" + partyId + "/defendant";
    rec.caseId = caseId;
    rec.personId = partyId;
    rec.recorderId = "";
    rec.name = "";
    rec.role = "Defendant";
    return rec;
  }

  // The section registry: each entry maps a frame URL fragment to the detector that
  // reads its presence record. findActiveSection walks the frames and returns the
  // first active section it finds. Add new sections here.
  var SECTION_DETECTORS = [
    { fragment: FRAGMENT_CONTACTS, read: readOpenContact, popupFrame: POPUP_FRAME_PAGE },
    { fragment: FRAGMENT_CASE_REVIEW, read: readCaseReview, popupFrame: POPUP_FRAME_MAIN },
    { fragment: FRAGMENT_CASE_REVIEW_CHARGE, read: readCaseReview, popupFrame: POPUP_FRAME_MAIN },
    { fragment: FRAGMENT_DEFS_CHARGES, read: readOpenDefendant, popupFrame: POPUP_FRAME_PAGE },
    { fragment: FRAGMENT_DOCUMENTS, read: readWitnessTab, popupFrame: POPUP_FRAME_PAGE }
  ];

  // Walk every nested frame; return the presence record from the first same-origin
  // frame matching a section detector that is currently active, or null.
  function findActiveSection(win, depth) {
    if (depth > MAXDEPTH) {
      return null;
    }
    var frames = win.frames;
    var i;
    var child;
    var href;
    var rec;
    var d;
    for (i = 0; i < frames.length; i++) {
      child = frames[i];
      href = "";
      try {
        href = child.location.href;
      } catch (e) { } // same-origin only
      for (d = 0; d < SECTION_DETECTORS.length; d++) {
        if (href.indexOf(SECTION_DETECTORS[d].fragment) !== -1) {
          rec = null;
          try {
            rec = SECTION_DETECTORS[d].read(child);
          } catch (e2) { }
          if (rec) {
            // Carry the section's popup host frame so the banner knows where to render
            // the hover popup (framePage for frameset pages, frameMain for content pages).
            rec.popupFrame = SECTION_DETECTORS[d].popupFrame;
            return rec;
          }
        }
      }
      rec = findActiveSection(child, depth + 1);
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
    // Section presence — isolated so it can never affect CMS. Uses the JSONP
    // transport (presenceJsonp*), which shares this detection + the banner.
    try {
      if (kind === "editing") {
        presenceJsonpStart(rec);
      } else if (kind === "closed") {
        presenceJsonpStop();
      }
    } catch (e) { }

    // postEvent(kind, rec);   // <-- UNCOMMENT to POST (set ENDPOINT_URL first)

    // Runtime seam: lets a consumer hook in without editing this file.
    // Fully isolated — anything it throws is swallowed and cannot affect CMS.
    var api = window.__ccContactLogger;
    if (api && typeof api.onChange === "function") {
      try {
        api.onChange(kind, rec);
      } catch (e) { }
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

  /* ===================================================================
   * SECTION PRESENCE (expansion of concern 1) — JSONP-driven.
   * -------------------------------------------------------------------
   * On "editing" we register the sectionId with the presence API over JSONP
   * (<script src>, which is NOT gated by the IE cross-origin XHR zone), then
   * heartbeat + poll on a timer; the poll's member list drives the menu-bar icon.
   * On "closed" we DELETE the session and remove the icon. See presenceJsonp*
   * below and memory reference_cms_polaris_xorigin_zone.
   * =================================================================== */

  var PRESENCE_BANNER_ID = "ccPresenceBanner";
  var PRESENCE_POPUP_ID = "ccPresencePopup"; // the beige hover popup shown under the icon
  var PRESENCE_COUNT_ID = "ccPresenceCount"; // the bold "(N)" head-count shown right after the icon
  var PRESENCE_COUNT_COLOR = "#350066"; // CPS purple for the "(N)" head-count
  var PRESENCE_CONNECTING_TIP = "Connecting to The Watchdog..."; // popup text shown while the session is being set up (pre-first-poll)
  var PRESENCE_CONNECTING_DOTS = "..."; // shown in place of the "(N)" head-count while connecting
  var PRESENCE_ERROR_TIP = "There was an error connecting to The Watchdog!"; // popup text on a non-recoverable connection error
  var PRESENCE_ERROR_MARK = "!"; // shown in place of the "(N)" head-count on a non-recoverable error
  // Root-relative path of the meeting icon, referenced the same way as the padlock
  // (<HOST>/Noexpiry/Images/uaimcaselock1.gif). The absolute URL is built per-doc in
  // presenceIconUrl so it resolves against the menu bar's own CMS origin.
  var PRESENCE_ICON_PATH = "../Noexpiry/Images/uaimmeeting.gif";

  // Find the CMS yellow menu bar (class="menuBar" — the bar that also hosts the
  // "Legal Links" link). It may live in the shell document or in any same-origin
  // frame, so walk the whole frame tree. document-mode 5 has no
  // getElementsByClassName / querySelector, so scan elements and test className.
  function classHas(el, cls) {
    var c = el.className;
    if (!c || typeof c.split !== "function") { return false; }
    var parts = c.split(" "), i;
    for (i = 0; i < parts.length; i++) {
      if (parts[i] === cls) { return true; }
    }
    return false;
  }

  function findElByClassInDoc(doc, cls) {
    var all = null;
    try {
      all = doc.all ? doc.all : (doc.getElementsByTagName ? doc.getElementsByTagName("*") : null);
    } catch (e) { return null; }
    if (!all) { return null; }
    var i;
    for (i = 0; i < all.length; i++) {
      if (classHas(all[i], cls)) { return all[i]; }
    }
    return null;
  }

  // Returns { win: frameWindow, row: menuBarRow } for the first same-origin frame
  // whose document contains the menuBar row, or null. We carry the frame WINDOW
  // (not the row's ownerDocument, which is unreliable in document-mode 5) so callers
  // reach the row's real document via win.document.
  function findMenuBar(win, depth) {
    if (depth > MAXDEPTH) { return null; }
    var doc;
    try { doc = win.document; } catch (e) { return null; } // x-origin frame
    var el = findElByClassInDoc(doc, "menuBar");
    if (el) { return { win: win, row: el }; }
    var frames, i, found;
    try { frames = win.frames; } catch (e2) { return null; }
    for (i = 0; i < frames.length; i++) {
      found = findMenuBar(frames[i], depth + 1);
      if (found) { return found; }
    }
    return null;
  }

  // Presence indicator: whenever anyone is viewing a supported section, show the
  // meeting icon as the LAST cell of the yellow menu bar. The bar is a table ROW
  // (<TR class=menuBar>) whose items are <TD class=menu> cells; there is no
  // pre-existing element to anchor to (the old cboNShow anchor no longer exists),
  // so the ONLY way to place the icon is to append a NEW <TD> at the end of the row.
  // On hover the icon shows a custom beige popup (presenceShowPopup) with the roster
  // text; the same text is kept on the icon (icon.ccTipText) so each poll just
  // refreshes it. Replaces the old per-frame "also viewing" text banner.
  function presenceShowBanner(tip, count) {
    var hit = findMenuBar(window, 0);
    if (!hit) { return; }
    var doc = hit.win.document; // real doc of the frame the row lives in
    var row = hit.row;
    try {
      // Reuse the existing icon if we already added it on a previous poll; otherwise
      // insert exactly one new cell and wire the hover popup ONCE. Without the reuse
      // check, every presence update would append another cell / rebind handlers.
      var icon = doc.getElementById(PRESENCE_BANNER_ID);
      if (!icon) {
        var cell = row.insertCell(row.cells.length);
        cell.className = "menu"; // match the other menu cells' styling
        icon = doc.createElement("img");
        icon.id = PRESENCE_BANNER_ID;
        icon.src = PRESENCE_ICON_PATH;
        icon.border = 0;
        icon.style.verticalAlign = "middle";
        icon.style.cursor = "default";
        cell.appendChild(icon);
        // The head-count, shown as bold "(N)" in CPS purple right after the icon.
        // Refreshed on every poll (see below); starts hidden until we have a count.
        var cnt = doc.createElement("span");
        cnt.id = PRESENCE_COUNT_ID;
        cnt.style.marginLeft = "3px";
        cnt.style.fontWeight = "bold";
        cnt.style.color = PRESENCE_COUNT_COLOR;
        cnt.style.verticalAlign = "middle";
        cell.appendChild(cnt);
        // Hover popup (attachEvent — no addEventListener in document-mode 5). The
        // handlers read icon.ccTipText, which we refresh below on every poll, so the
        // popup always shows the latest roster without rebinding.
        try {
          icon.attachEvent("onmouseover", function () { presenceShowPopup(icon); });
          icon.attachEvent("onmouseout", function () { presenceHidePopup(); });
        } catch (eBind) { }
      }

      // Keep the current roster text on the icon for the hover handlers. We do NOT set
      // title/alt — the custom popup replaces the native tooltip. If the popup is open
      // right now, refresh its text in place.
      icon.ccTipText = tip ? tip : "Also viewing this case";
      // Refresh the head-count after the icon: show it verbatim in brackets whether it's
      // the numeric roster size ("(N)") or the connecting placeholder ("(...)"). There is
      // no 0/negative case to guard — a real roster always has >= 1 (you), and the
      // pre-roster connecting state is already handled by passing the "..." placeholder.
      var cntEl = doc.getElementById(PRESENCE_COUNT_ID);
      if (cntEl) { cntEl.innerText = count ? ("(" + count + ")") : ""; }
      if (presencePopupEl) { presenceShowPopup(icon); }
    } catch (e) { }
  }

  // Absolute position of the icon within its document (viewport rect + scroll).
  // ---- Hover popup, anchored to the active section's host frame top-right -----
  // The popup is appended to the CONTENT frame that renders the active section and
  // pinned to its TOP-RIGHT (top:0, right:0) so it grows DOWN-and-LEFT and is never
  // clipped. Which frame that is depends on the page structure and is declared per
  // section in SECTION_DETECTORS (popupFrame):
  //   - "framePage": frameset pages (e.g. victim/witness) render content in an inner
  //     framePage frame; frameMain is a frameset doc whose body never renders.
  //   - "frameMain": content pages (e.g. case review) render directly as frameMain's
  //     document, so the popup goes into frameMain's own body.
  // presencePopupFrameName holds the current section's host frame (set on start). It is
  // null when the active section did NOT declare a popupFrame — there is no default, so
  // in that case we simply do not render the popup. presencePopupEl tracks the live
  // popup so we can remove it.
  var presencePopupFrameName = null; // current section's popup host frame; null = don't render
  var presencePopupEl = null;

  // Find the first same-origin frame named `name` anywhere in the tree, or null.
  function presenceFindFrameByName(win, name, depth) {
    if (depth > MAXDEPTH) { return null; }
    var frames;
    try { frames = win.frames; } catch (e) { return null; } // x-origin
    var i, f, nm, found;
    for (i = 0; i < frames.length; i++) {
      f = frames[i];
      nm = "";
      try { nm = f.name; } catch (e2) { nm = ""; }
      if (nm === name) {
        try { if (f.document) { return f; } } catch (e3) { } // same-origin probe
      }
      found = presenceFindFrameByName(f, name, depth + 1);
      if (found) { return found; }
    }
    return null;
  }

  // Show (or refresh) the popup in the active section's host frame, pinned to its
  // top-right and growing down-and-left. Text is icon.ccTipText; white-space:pre
  // renders the "\n" line breaks. If the active section declared no popup host frame
  // (presencePopupFrameName is null) or that frame can't be found / has no renderable
  // body, we render NOTHING — there is deliberately no default/fallback host.
  function presenceShowPopup(icon) {
    try {
      if (!presencePopupFrameName) { return; } // section didn't declare a popup host frame
      var text = icon.ccTipText || "";
      if (!text) { return; }
      var host = presenceFindFrameByName(window, presencePopupFrameName, 0);
      var hostDoc = null;
      if (host) { try { hostDoc = host.document; } catch (eD) { hostDoc = null; } }
      if (!hostDoc || !hostDoc.body) { return; } // host frame missing / no body -> don't render
      var pop = hostDoc.getElementById(PRESENCE_POPUP_ID);
      if (!pop) {
        pop = hostDoc.createElement("div");
        pop.id = PRESENCE_POPUP_ID;
        pop.style.position = "absolute";
        // Top offset depends on the host frame: framePage renders content at its own
        // top so 0 is fine; frameMain-as-content has the menu/header chrome up top, so
        // push the popup down 50px to clear it. Either way it grows down-and-left.
        pop.style.top = (presencePopupFrameName === POPUP_FRAME_MAIN ? "50px" : "0px");
        pop.style.right = "0px"; // pin top-right -> grows down-and-left
        pop.style.background = "#FFFFB3";
        pop.style.border = "1px solid #8a8a5c";
        pop.style.padding = "6px 8px";
        pop.style.fontFamily = "Arial, sans-serif";
        pop.style.fontSize = "10pt";
        pop.style.fontWeight = "bold";
        pop.style.color = "#000000";
        pop.style.whiteSpace = "pre";
        pop.style.zIndex = "100000";
        (hostDoc.body || hostDoc.documentElement).appendChild(pop);
      }
      presencePopupEl = pop;
      pop.innerText = text; // IE renders \n as line breaks under white-space:pre
      pop.style.display = "";
    } catch (e) { }
  }

  // Remove the popup wherever it was rendered.
  function presenceHidePopup() {
    try {
      if (presencePopupEl && presencePopupEl.parentNode) {
        presencePopupEl.parentNode.removeChild(presencePopupEl);
      }
    } catch (e) { }
    presencePopupEl = null;
  }

  function presenceRemoveBanner() {
    var hit = findMenuBar(window, 0);
    var doc = hit ? hit.win.document : null;
    if (!doc) { return; }
    try {
      presenceHidePopup(); // drop the hover popup if it's open
      var icon = doc.getElementById(PRESENCE_BANNER_ID);
      if (!icon) { return; }
      // Remove the whole cell we added (the <TD>), not just the <img>. Delete it via
      // the table DOM API (deleteCell) for the same IE-mode reason as insertCell;
      // fall back to removeChild if deleteCell/cellIndex aren't available.
      var cell = icon.parentNode; // the <TD>
      var tr = cell ? cell.parentNode : null; // the <TR>
      if (tr && tr.deleteCell && typeof cell.cellIndex === "number" && cell.cellIndex >= 0) {
        tr.deleteCell(cell.cellIndex);
      } else if (cell && cell.parentNode) {
        cell.parentNode.removeChild(cell);
      } else if (icon.parentNode) {
        icon.parentNode.removeChild(icon);
      }
    } catch (e) { }
  }

  /* ---- JSONP transport ------------------------------------------------------
   * Uses <script src> (NOT gated by the IE cross-origin XHR zone), so there's no
   * iframe and no cookie bridge — the adapter (handlePresenceJsonp) turns each GET
   * into the backend's real REST call. The JSONP response executes as JS, so the
   * callback receives a REAL object/array — no JSON parsing needed here (which an
   * XHR relay could not do in document-mode 5). Drives the menu-bar banner.
   * ----------------------------------------------------------------------- */
  // Resolved against the host that served this script — see ccEndpoint. Relative
  // would resolve to the CMS page's host, which is the wrong box once the UI and
  // the API are on different domains.
  var PRESENCE_JSONP_BASE = ccEndpoint("/global-components/presence-jsonp");
  var PRESENCE_JSONP_TICK_MS = 3000; // heartbeat + poll cadence
  var PRESENCE_JSONP_TIMEOUT_MS = 8000; // per-call watchdog (JSONP has no error event)

  var presenceJsonpSeq = 0; // monotonic: cache-busts each URL; also names new callbacks
  var presenceJsonpFreeCbs = []; // reusable "__ccpj_N" names returned by cleanup (see below)
  var presenceJsonpSessionId = ""; // presence-API session id
  var presenceJsonpActiveSid = ""; // section we're holding
  var presenceJsonpHbTimer = null;

  // Version-reconciled roster cache. Keyed by SECTION identity (caseId:kind:subjectId),
  // each entry is { caseId: <string>, kind: <string>, version: <number>, members: [ ... ] }
  // where each member is { email, app, joinedAt } (see presenceSnapshotMembers). The
  // wire does NOT guarantee per-section ordering, so a snapshot's roster only replaces
  // the cached one when its version is strictly newer (see presenceApplyNotifications).
  // Reset per presence session (in presenceJsonpStop).
  var presenceSections = {};

  // Core JSONP call. onData(obj) with the executed object/array, or null on failure.

  // A shared no-op parked in a freed callback slot: a straggler response that somehow
  // fires after cleanup harmlessly calls this instead of a stale per-call handler.
  function presenceJsonpNoop() { }

  // Callback names MUST be top-level window properties (the adapter reflects the name
  // verbatim and rejects anything but a bare identifier — see handlePresenceJsonp), so
  // they can't be namespaced under one object. In document-mode 5 we can NEITHER delete a
  // window expando (delete is unsupported here) NOR clear it (window[name] = undefined
  // leaves the key), so a fresh name per call would accumulate one dead __ccpj_N key on
  // EVERY heartbeat/poll tick — an unbounded leak. So we REUSE names from a free pool:
  // take a freed one when available, mint a new one only when the pool is empty. The live
  // __ccpj_* key count is then bounded by peak concurrency (a handful of in-flight calls),
  // not by uptime. cleanup() parks a no-op in the slot and returns the name to the pool.
  function presenceJsonpAcquireCb() {
    var n = presenceJsonpFreeCbs.length;
    if (n > 0) {
      var name = presenceJsonpFreeCbs[n - 1];
      presenceJsonpFreeCbs.length = n - 1; // pop the reused name off the free pool
      return name;
    }
    return "__ccpj_" + presenceJsonpSeq; // pool empty -> mint a new name (seq just bumped by caller)
  }

  function presenceJsonp(op, params, onData) {
    presenceJsonpSeq = presenceJsonpSeq + 1;
    var cbName = presenceJsonpAcquireCb();
    var done = false;
    var script = null;
    var timer = null;

    function cleanup() {
      if (timer) { window.clearTimeout(timer); timer = null; }
      // Drop this call's closure and return the NAME to the pool for reuse. We can't remove
      // the window key (no delete in document-mode 5) and clearing it to undefined would leak
      // one dead key per tick, so reuse is what keeps the live __ccpj_* count bounded. Parking
      // a shared no-op frees the captured closure and neutralises any straggler response.
      try { window[cbName] = presenceJsonpNoop; } catch (e1) { }
      presenceJsonpFreeCbs[presenceJsonpFreeCbs.length] = cbName;
      try { if (script && script.parentNode) { script.parentNode.removeChild(script); } } catch (e2) { }
    }

    window[cbName] = function (data) {
      if (done) { return; }
      done = true;
      cleanup();
      onData(data);
    };

    var url = PRESENCE_JSONP_BASE + "?op=" + encodeURIComponent(op);
    var k;
    for (k in params) {
      if (params.hasOwnProperty(k)) {
        url = url + "&" + k + "=" + encodeURIComponent(params[k]);
      }
    }
    url = url + "&callback=" + cbName + "&_=" + presenceJsonpSeq;

    timer = window.setTimeout(function () {
      if (done) { return; }
      done = true;
      cleanup();
      onData(null);
    }, PRESENCE_JSONP_TIMEOUT_MS);

    try {
      script = document.createElement("script");
      script.type = "text/javascript";
      script.src = url;
      document.documentElement.appendChild(script);
    } catch (e) {
      if (!done) { done = true; cleanup(); onData(null); }
    }
  }

  // ---- Roster reconciliation (custom application protocol) -------------------
  // A poll response is an ARRAY of notification objects; each carries
  // payload.snapshots, an array of per-section rosters. Each snapshot has a
  // { section, members, version }. Snapshots are NOT guaranteed to arrive in order,
  // so we key a cache by section identity and apply a snapshot's members ONLY when
  // its version is newer than the cached one — dropping stale / out-of-order updates.
  // An empty members array is a VALID update (everyone left that section) and simply
  // clears that section's roster. The icon shows whenever ANY section of the case has
  // members; its tooltip groups the roster BY SECTION (empty sections omitted — see
  // presenceBuildTooltip).

  // Build the dictionary key for a section object (caseId:kind:subjectId). subjectId
  // is null/absent for case-wide sections (CASE_REVIEW, CASE) — treat as empty.
  function presenceSectionKey(section) {
    if (!section) { return ""; }
    var caseId = section.caseId != null ? String(section.caseId) : "";
    var kind = section.kind != null ? String(section.kind) : "";
    var subjectId = section.subjectId != null ? String(section.subjectId) : "";
    var key = caseId + ":" + kind;
    // subjectId is OPTIONAL: subject-scoped kinds (e.g. VICTIM_WITNESS) carry one,
    // case-wide kinds (CASE, CASE_REVIEW) do not. Only append it when present, so a
    // case-wide section keys as "544545:CASE" (no trailing ":") — matching how the
    // sectionId strings are built in readCaseReview / readOpenContact.
    if (subjectId !== "") { key = key + ":" + subjectId; }
    return key;
  }

  // Normalise a snapshot's members array into our cache shape: one
  // { email, app, joinedAt } per member (may be empty). We keep all three fields
  // because the tooltip shows "<email> on <app> - joined <date>".
  function presenceSnapshotMembers(members) {
    var out = [];
    if (!members || typeof members.length !== "number") { return out; }
    var i, m;
    for (i = 0; i < members.length; i++) {
      m = members[i];
      if (m && m.userEmail) {
        out[out.length] = {
          email: m.userEmail,
          app: m.sourceApplication ? m.sourceApplication : "",
          joinedAt: m.joinedAt ? m.joinedAt : ""
        };
      }
    }
    return out;
  }

  // Apply one poll response (delta) into presenceSections. A snapshot's roster
  // replaces the cached one for its section only when version > cached.version, so
  // stale / out-of-order section notifications are ignored. An empty members array
  // for a newer version correctly clears that section's roster.
  function presenceApplyNotifications(data) {
    if (!data || typeof data.length !== "number") { return; }
    var n, notif, payload, snaps, s, snap, section, key, version, current;
    for (n = 0; n < data.length; n++) {
      notif = data[n];
      if (!notif || !notif.payload) { continue; }
      snaps = notif.payload.snapshots;
      if (!snaps || typeof snaps.length !== "number") { continue; }
      for (s = 0; s < snaps.length; s++) {
        snap = snaps[s];
        if (!snap) { continue; }
        section = snap.section;
        key = presenceSectionKey(section);
        if (!key) { continue; }
        version = snap.version;
        if (typeof version !== "number") { version = parseInt(version, 10); }
        current = presenceSections[key];
        if (current && typeof current.version === "number" && !isNaN(version) && version <= current.version) {
          continue; // stale / out-of-order — keep the newer cached roster
        }
        presenceSections[key] = {
          caseId: section && section.caseId != null ? String(section.caseId) : "",
          kind: section && section.kind != null ? String(section.kind) : "",
          version: version,
          members: presenceSnapshotMembers(snap.members)
        };
      }
    }
  }

  // Human-readable label for a section kind (used in the by-section tooltip).
  function presenceSectionLabel(kind) {
    if (kind === "CASE") { return "Case"; }
    if (kind === "CASE_REVIEW") { return "Case Review"; }
    if (kind === "VICTIM_WITNESS") { return "Witness/Victim"; }
    if (kind === "DEFENDANT") { return "Defendant"; }
    return kind ? kind : "Section";
  }

  var PRESENCE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Format an ISO-8601 joinedAt ("2026-08-21T08:11:53.226+00:00") as "21 Aug 2026 08:11".
  // document-mode 5 cannot reliably Date.parse ISO strings, so we read the fields out
  // of the string directly (wall-clock as sent). Returns "" if it isn't a timestamp.
  function presenceFormatJoined(iso) {
    if (!iso || typeof iso !== "string") { return ""; }
    var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
    if (!m) { return ""; }
    var monthIdx = parseInt(m[2], 10) - 1;
    var mon = (monthIdx >= 0 && monthIdx < 12) ? PRESENCE_MONTHS[monthIdx] : m[2];
    return parseInt(m[3], 10) + " " + mon + " " + m[1] + " " + m[4] + ":" + m[5];
  }

  // Build the full tooltip text for one case, grouped by section. Format:
  //   Who's working where:
  //   Currently these users are working on <Section>:
  //   <email> on <app> - joined <date>
  //   ...
  //   <blank line between sections>
  // Sections whose roster is empty (everyone left — a valid, version-bumped
  // notification) are OMITTED. Returns "" when no section of the case has members.
  function presenceBuildTooltip(caseId) {
    var blocks = [];
    var key, sec, members, i, mem, when, lines, line;
    for (key in presenceSections) {
      if (!presenceSections.hasOwnProperty(key)) { continue; }
      sec = presenceSections[key];
      if (!sec || sec.caseId !== caseId) { continue; }
      members = sec.members;
      if (!members || members.length === 0) { continue; } // empty section -> omit
      lines = ["Currently these users are working on " + presenceSectionLabel(sec.kind) + ":"];
      for (i = 0; i < members.length; i++) {
        mem = members[i];
        line = mem.email + " on " + (mem.app ? mem.app : "unknown");
        when = presenceFormatJoined(mem.joinedAt);
        if (when) { line = line + " - joined " + when; }
        lines[lines.length] = line;
      }
      blocks[blocks.length] = lines.join("\n");
    }
    if (blocks.length === 0) { return ""; }
    return "Who's working where:\n" + blocks.join("\n\n");
  }

  // Total number of people across ALL sections of one case (sum of the section
  // rosters). Drives the "(N)" head-count after the icon. Empty sections contribute
  // 0, so this matches how many names presenceBuildTooltip lists.
  function presenceCountMembers(caseId) {
    var total = 0, key, sec;
    for (key in presenceSections) {
      if (!presenceSections.hasOwnProperty(key)) { continue; }
      sec = presenceSections[key];
      if (!sec || sec.caseId !== caseId) { continue; }
      if (sec.members && sec.members.length) { total = total + sec.members.length; }
    }
    return total;
  }

  // Compact shape hint for logging: "array[N]" or "object{key,key}".
  function presenceJsonpDescribe(data) {
    if (data === null || typeof data !== "object") { return String(data); }
    if (typeof data.length === "number") { return "array[" + data.length + "]"; }
    var ks = [], k;
    for (k in data) { if (data.hasOwnProperty(k)) { ks[ks.length] = k; } }
    return "object{" + ks.join(",") + "}";
  }

  // Session expired (a 410 on heartbeat: the Watchdog no longer knows this session, e.g. a
  // heartbeat arrived too late to renew it). Without a session we can't poll, so tear the
  // whole routine down and reconnect from scratch — same section id, same popup host frame.
  function presenceJsonpRestart() {
    var sid = presenceJsonpActiveSid; // capture before stop clears these
    var frame = presencePopupFrameName;
    presenceJsonpStop();
    if (sid) {
      presenceJsonpStart({ sectionId: sid, popupFrame: frame });
    }
  }

  // Non-recoverable connection failure (any heartbeat jsonpError that is NOT a 410). Stop the
  // routine — no auto-reconnect — and surface it to the user: "!" in place of the head-count
  // and an error message in the hover popup. presenceJsonpStop clears the popup host frame, so
  // restore it afterwards so the error popup can still render on hover.
  function presenceJsonpFail() {
    var frame = presencePopupFrameName;
    presenceJsonpStop();
    presencePopupFrameName = frame;
    presenceShowBanner(PRESENCE_ERROR_TIP, PRESENCE_ERROR_MARK);
  }

  function presenceJsonpTick() {
    try {
      if (!presenceJsonpSessionId) { return; }
      var sid = presenceJsonpSessionId; // capture: ignore a callback whose session was superseded
      // Heartbeat (PUT-mapped). Its outcome drives failure handling: a 410 means the session
      // expired -> reconnect (restart); any other jsonpError -> stop and show the error. A
      // plain timeout (data === null) is transient, so we just retry on the next tick.
      presenceJsonp("heartbeat", { sid: sid }, function (data) {
        if (presenceJsonpSessionId !== sid) { return; } // superseded (restart / stop / section switch)
        if (data === null) { return; } // transient timeout -> just retry on the next tick
        if (data.jsonpError) {
          if (data.jsonpError.indexOf("410") > -1) {
            presenceJsonpRestart();
          } else {
            presenceJsonpFail();
          }
        }
      });
      // Poll (GET-mapped) -> reconcile -> banner.
      presenceJsonp("poll", { sid: sid }, function (data) {
        if (presenceJsonpSessionId !== sid) { return; } // superseded (restart / stop / section switch)
        if (data === null) { return; } // transient timeout -> just retry on the next tick
        if (data.jsonpError) { return; }
        // Reconcile this delta into the per-section version-checked roster cache, then
        // recompute the banner. Show the icon whenever ANY section of the case has
        // members (no threshold — even just you counts); the tooltip groups the roster
        // BY SECTION (empty sections omitted). An empty poll array applies nothing and
        // simply re-shows the unchanged rosters.
        presenceApplyNotifications(data);
        var caseId = presenceJsonpActiveSid ? presenceJsonpActiveSid.split(":")[0] : "";
        var tip = presenceBuildTooltip(caseId); // grouped, formatted per-section roster ("" if nobody)
        var count = presenceCountMembers(caseId); // total people across all sections -> "(N)" after the icon
        if (tip) {
          presenceShowBanner(tip, count);
        } else {
          presenceRemoveBanner();
        }
      });
    } catch (ex) {
    }
  }

  function presenceJsonpStart(rec) {
    if (!rec.sectionId) { return; }
    var sid = rec.sectionId;
    if (sid === presenceJsonpActiveSid) { return; } // same section (e.g. victim<->witness of one person)
    presenceJsonpStop(); // clears any prior session (and fires its DELETE)
    presenceJsonpActiveSid = sid;
    presencePopupFrameName = rec.popupFrame ? rec.popupFrame : null; // where to render the popup; null = don't render
    // Show the icon immediately — the section IS supported — even though we don't yet
    // know the roster (we are still creating the session + awaiting the first poll). The
    // popup reads "Connecting to The Watchdog..." and the head-count shows "(...)"; both
    // are replaced with the real roster / number on the first successful poll (see
    // presenceJsonpTick). A prior session's banner was already cleared by presenceJsonpStop.
    presenceShowBanner(PRESENCE_CONNECTING_TIP, PRESENCE_CONNECTING_DOTS);
    presenceJsonp("create", { sectionId: sid }, function (data) {
      if (presenceJsonpActiveSid !== sid) { return; } // superseded while in flight
      if (data === null || data.jsonpError || !data.sessionId) {
        var why = data === null ? "no response (timeout)" : (data.jsonpError || "no sessionId in response");
        // Could not establish the session -> non-recoverable. Surface it the same way as a
        // heartbeat failure: "!" in place of the head-count and the error message in the popup.
        presenceJsonpFail();
        return;
      }
      presenceJsonpSessionId = data.sessionId;
      presenceJsonpTick();
      presenceJsonpHbTimer = window.setInterval(presenceJsonpTick, PRESENCE_JSONP_TICK_MS);
    });
  }

  function presenceJsonpStop() {
    if (presenceJsonpHbTimer) {
      window.clearInterval(presenceJsonpHbTimer);
      presenceJsonpHbTimer = null;
    }
    if (presenceJsonpSessionId) {
      // Best-effort DELETE on leave. NOT guaranteed on tab-close (a script injected
      // during unload may not run) — the server-side TTL stays the real backstop.
      presenceJsonp("remove", { sid: presenceJsonpSessionId }, function () { });
    }
    presenceJsonpSessionId = "";
    presenceJsonpActiveSid = "";
    presencePopupFrameName = null; // no active section -> no popup host frame
    presenceSections = {}; // fresh reconciliation state per presence session
    presenceRemoveBanner();
  }

  // ---- HTTP helpers (ready to use; only called if you uncomment above) ----

  function newXhr() {
    try {
      if (typeof XMLHttpRequest !== "undefined") {
        return new XMLHttpRequest();
      }
    } catch (e) { }
    try {
      return new ActiveXObject("Microsoft.XMLHTTP");
    } catch (e) { }
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
    } catch (e) { }
  }

  function tick() {
    var rec = null;
    try {
      rec = findActiveSection(window, 0);
    } catch (e) { }
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
      } catch (e) { }
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
 * Concern 2: LOGIN -> AUTH IFRAME SPAWN
 * ----------------------------------------------------------------------------
 * Independent of the logger above. Watches the CMS login flow from the shell and,
 * when the user has just logged in, spawns the hidden /polaris auth iframe once.
 * That flow (the AD round-trip, a SERVER-SIDE part of this solution — NOT in this
 * file) runs on our own (polaris) origin and, in its final callback, stashes the
 * id-token in POLARIS localStorage. The presence JSONP adapter (also polaris-origin)
 * reads it there same-origin — so there is NO cookie / cross-subdomain hand-off to
 * the CMS domain any more; this file just triggers the flow. See memory
 * reference_cms_polaris_xorigin_zone.
 *
 * Trigger: the shell's frameMain leaving uaulLogin.aspx (login -> app edge). It
 * re-fires if the site returns to login and leaves again. The shell boots ~seconds
 * BEFORE login completes, so we must wait for the edge, not fire on boot.
 *
 * IE MODE / DOCUMENT-MODE 5 — same constraints as concern 1 (no JSON, no arrow
 * functions, var + function declarations, no trailing commas).
 * ==========================================================================*/
(function () {
  var BUILD = "spawn1"; // bump on redeploy to confirm fresh bytes are live (cache!)
  var DEBUG = true; // verbose per-tick logging; window.__ccAuthHandover.setDebug(false) to quiet

  // Auth entry. DELIBERATELY RELATIVE — do NOT run this through ccEndpoint.
  //
  // /polaris-v2 exists to exfiltrate the CMS session cookies from the UI domain to
  // the implementation domain. It can only read those cookies if the browser sends
  // them, which it only does when the request is SAME-ORIGIN with the CMS page.
  // Point this at another host and the capture silently collects nothing: the flow
  // still runs, the AD round trip still succeeds, and the cookie store ends up empty.
  //
  // Crossing to the implementation domain is the SERVER's job, not this line's:
  // handlePolarisV2 redirects to <implementation origin>/init-v2/?cookies=... , with
  // that origin baked in at deploy time. See BUILD_IMPL_ORIGIN in the njs.
  var POLARIS_PATH = "/polaris-v2";
  var LOGIN_FRAGMENT = "uaulLogin.aspx"; // frameMain is "on login" while its URL contains this
  var MAIN_FRAME = "frameMain"; // the shell frame login + app load into

  var WATCH_INTERVAL = 1000; // ms between login-state checks

  var wasOnLogin = false; // login-edge detector state
  var ticks = 0; // watch-loop counter (diagnostic)
  var watchTimer = null; // the poll interval; cleared after the first spawn (single-shot)

  // Enumerate this window's direct child frames (name = url), tolerating
  // cross-origin children (the spawned auth iframe) which throw on access.
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

  // The shell frame that login/app load into. Same-origin; guarded + logged.
  function mainFrameHref() {
    var f;
    try {
      f = window.frames[MAIN_FRAME];
    } catch (e) {
      return "";
    }
    if (!f) {
      return "";
    }
    try {
      return f.location.href || "";
    } catch (e2) {
      return "";
    }
  }

  // Spawn the hidden auth iframe (fire-and-forget) and remove it once it settles.
  // The AD flow runs inside it and its callback stashes the id-token in polaris
  // localStorage; nothing to read back here.
  function spawnIframe() {
    try {
      var f = document.createElement("iframe");
      f.src = POLARIS_PATH;
      f.style.display = "none";
      f.onload = function () {
        try {
          if (f.parentNode) {
            f.parentNode.removeChild(f);
          }
        } catch (e) { }
      };
      document.documentElement.appendChild(f);
    } catch (e) {
    }
  }

  // Fire on the login -> app edge: frameMain WAS on the login page and now isn't.
  function watch() {
    ticks = ticks + 1;
    var href = mainFrameHref();
    var onLogin = href ? href.indexOf(LOGIN_FRAGMENT) !== -1 : false;
    if (!href) {
      return; // can't read frameMain this tick — keep wasOnLogin as-is
    }
    if (wasOnLogin && !onLogin) {
      spawnIframe();
      // SINGLE-SHOT: stop polling after the first spawn — one auth capture per shell
      // (== per website) lifecycle.
      //
      // (a) This is possibly too simplistic. It does NOT handle re-authentication
      //     within the same shell (log out + back in won't re-spawn), and if a shell
      //     ever loads ALREADY authenticated (no login page shown) the edge never
      //     fires — nothing is captured and, since this clear never runs, the poll
      //     keeps going. Today's "full site reload on login" behaviour means fresh
      //     sessions always pass through the login page so the edge does fire; revisit
      //     if that ever changes.
      // (b) A cleaner design would hook the frameMain element's onload event (no
      //     polling at all) and spawn from there. Not done yet because the reliability
      //     of frame onload in this IE-mode frameset has NOT been proved — the poll is
      //     the known-good mechanism for now.
      if (watchTimer) {
        window.clearInterval(watchTimer);
        watchTimer = null;
      }
    }
    wasOnLogin = onLogin;
  }

  // On-demand state dump: window.__ccAuthHandover.debug()
  function debug() {
  }

  function setDebug(v) {
    DEBUG = !!v;
  }

  // Console handles: force a spawn, dump state, or quiet the logging.
  window.__ccAuthHandover = { runNow: spawnIframe, debug: debug, setDebug: setDebug };
  watchTimer = window.setInterval(watch, WATCH_INTERVAL);
})();
