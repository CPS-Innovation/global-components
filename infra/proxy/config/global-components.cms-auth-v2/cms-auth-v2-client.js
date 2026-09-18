/* cms-auth-v2-client.js
 * Injected into the persistent CMS frameset shell (uaglCMS.aspx <head>), which
 * loads once per session and persists THROUGH login (the login page and the app
 * both load into the shell's frameMain). Two independent concerns, each its own
 * IIFE so a failure in one cannot affect the other:
 *   1. Contact-edit logger + section presence (immediately below) — observes the
 *      Witnesses & details screen, reports which contact is being edited, and (via
 *      the presence API over JSONP) shows a footer accordion with the count and
 *      details of users working on the case.
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
// Master switch for BOTH presence and its auth-iframe bootstrap. Keep false in
// production; set true only in the copy deployed to UAT until testing is complete.
// Deployment-time switch: reload the CMS shell after changing it. It does not
// shut down an integration that was already started by a previously loaded script.
var CMS_WATCHDOG_ENABLED = true;

(function () {
  if (CMS_WATCHDOG_ENABLED !== true) {
    return; // no section observation, JSONP requests, stripe or frame resizing
  }

  var INTERVAL = 3000; // ms between observation passes
  var MAXDEPTH = 64;

  // Set before the section kinds are initialised. CIN2 / CIN3 / CIN5 isolate
  // presence on the same Watchdog; undefined, null or blank uses the default kinds.
  // Deployment-time setting: reload the CMS shell after changing it.
  var CIN_ENVIRONMENT = "CIN3";

  function presenceSectionKind(kind) {
    var environment = typeof CIN_ENVIRONMENT === "undefined" ? "" : trim(CIN_ENVIRONMENT);
    return environment ? kind + "_" + environment : kind;
  }

  // ---- Sections --------------------------------------------------------------
  // The Watchdog tracks "sections" of the site. A section is identified by the URL
  // FRAGMENT of its iframe and has a KIND (the section name The Watchdog knows).
  // Its presence id is built as:
  //   sectionId = caseId ":" KIND             (case-wide sections, no subject)
  //   sectionId = caseId ":" KIND ":" subjId  (subject-scoped sections, e.g. a person)
  // Only KIND receives the CIN suffix: e.g. "1234:CASE_CIN3" or
  // "1234:VICTIM_WITNESS_CIN3:5678". Case and subject ids stay unchanged.
  // Each section provides a "detector" (see SECTION_DETECTORS below) that reads its
  // frame and returns a presence record (carrying .sectionId) when it is active.
  var FRAGMENT_CONTACTS = "uaccContactDetails.aspx"; // victim/witness edit screen
  var VICWIT = "VW"; // VICTIMS_WITNESSES_CONTACT (sRHPType of the vic/wit RHP)
  var SECTION_KIND_VICTIM_WITNESS = presenceSectionKind("VICTIM_WITNESS"); // subject-scoped (personId)

  var FRAGMENT_CASE_REVIEW = "uapcPreChargeCaseAnalysis.aspx"; // case review screen
  var FRAGMENT_CASE_REVIEW_CHARGE = "uapcPreChargeDecDetails.aspx";
  var SECTION_KIND_CASE_REVIEW = presenceSectionKind("CASE_REVIEW"); // case-wide (no subject)

  var FRAGMENT_DEFS_CHARGES = "uadcDefsCharges.aspx"; // Defs & Charges tab (its own frame)
  var SECTION_KIND_DEFENDANT = presenceSectionKind("DEFENDANT"); // subject-scoped (partyId)

  var FRAGMENT_DOCUMENTS = "uacgSelectDocument.aspx";

  var FRAGMENT_GENERIC_CASE_ID = "intCaseID";
  var SECTION_KIND_CASE_GENERIC = presenceSectionKind("CASE");

  // Place the stripe above the footer in frameActionBar when frameMain is a
  // FRAMESET, otherwise in frameMain itself. The footer is the fourth frame.
  var PRESENCE_FRAME_MAIN = "frameMain";
  var PRESENCE_FRAME_ACTION_BAR = "frameActionBar";
  var PRESENCE_ACTION_BAR_ID = "tblCMSActionBar";
  var PRESENCE_ACTION_BAR_ROW_INDEX = 3;

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
  // yield the SAME sectionId (CASE_REVIEW with the optional CIN suffix) — users on either page
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

  function readGenericCase(win) {
    var caseId = "";
    try { caseId = win.iScreenCaseID ? String(win.iScreenCaseID) : ""; } catch (e) { }
    if (!caseId) {
      var href = ""; try { href = win.location.href; } catch (e2) { href = ""; }
      caseId = queryParam(href, "intCaseID");
    }
    if (!caseId) { return null; }

    var rec = {};
    rec.sectionId = caseId + ":" + SECTION_KIND_CASE_GENERIC;
    rec.key = caseId + "/case";
    rec.caseId = caseId;
    rec.personId = "";
    rec.recorderId = "";
    rec.name = "";
    rec.role = "";
    return rec;
  }

  // The section registry: each entry maps a frame URL fragment to the detector that
  // reads its presence record. findActiveSection walks the frames and returns the
  // first active section it finds. Add new sections here.
  var SECTION_DETECTORS = [
    { fragment: FRAGMENT_CONTACTS, read: readOpenContact },
    { fragment: FRAGMENT_CASE_REVIEW, read: readCaseReview },
    { fragment: FRAGMENT_CASE_REVIEW_CHARGE, read: readCaseReview },
    { fragment: FRAGMENT_DEFS_CHARGES, read: readOpenDefendant },
    { fragment: FRAGMENT_DOCUMENTS, read: readWitnessTab }
  ];

  var FALLBACK_DETECTORS = [
    { fragment: FRAGMENT_GENERIC_CASE_ID, read: readGenericCase }
  ];

  // Walk every nested frame; return the presence record from the first same-origin
  // frame matching a section detector that is currently active, or null.
  function findActiveSection(win, depth, detectors) {
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
      for (d = 0; d < detectors.length; d++) {
        if (href.indexOf(detectors[d].fragment) !== -1) {
          rec = null;
          try {
            rec = detectors[d].read(child);
          } catch (e2) { }
          if (rec) {
            return rec;
          }
        }
      }
      rec = findActiveSection(child, depth + 1, detectors);
      if (rec) {
        return rec;
      }
    }

    return null;
  }

  /* ===================================================================
   * OUTPUT SINK — THE ONE PLACE TO CHANGE TO CALL AN ENDPOINT
   * -------------------------------------------------------------------
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

  /* ===================================================================
   * SECTION PRESENCE (expansion of concern 1) — JSONP-driven.
   * -------------------------------------------------------------------
   * On "editing" we register the sectionId with the presence API over JSONP
   * (<script src>, which is NOT gated by the IE cross-origin XHR zone), then
  * heartbeat + poll on a timer; the poll's member list drives the footer stripe.
  * On "closed" we DELETE the session and remove the stripe. See presenceJsonp*
   * below and memory reference_cms_polaris_xorigin_zone.
   * =================================================================== */

  var PRESENCE_CONNECTING_TEXT = "Connecting to The Watchdog...";
  var PRESENCE_ERROR_TEXT = "There was an error connecting to The Watchdog!";
  var PRESENCE_STRIPE_ID = "ccPresenceStripe";
  var PRESENCE_STRIPE_HEADER_ID = "ccPresenceStripeHeader";
  var PRESENCE_STRIPE_SUMMARY_ID = "ccPresenceStripeSummary";
  var PRESENCE_STRIPE_TOGGLE_ID = "ccPresenceStripeToggle";
  var PRESENCE_STRIPE_DETAILS_ID = "ccPresenceStripeDetails";
  var PRESENCE_STRIPE_COLOR = "#b10e1e";
  var PRESENCE_STRIPE_HEIGHT = 23;

  // Only connection/poll/error events update this state. Keep expansion across polls;
  // the observer tick detects section changes but does not render or refresh the UI.
  var presenceStripeState = null; // { text, count }; null = no presence UI
  var presenceStripeEl = null;
  var presenceStripeExpanded = false;
  // Bind the baseline to the actual FRAMESET, not the current named frame. This
  // lets us restore the old footer after navigation without resizing the new page.
  var presenceFooterResize = null; // { frameset, originalRow, baseHeight }

  // document-mode 5 has no getElementsByClassName / querySelector. Scan elements
  // and test className if the footer cannot be found by id.
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

  // The stripe is the only presence UI. Called for connecting, each successful poll,
  // and permanent failure, matching the original banner's cadence and lifecycle.
  function presenceShowStripe(text, count) {
    presenceStripeState = { text: text, count: count };
    presenceRenderStripe();
  }

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

  // Resolve the footer and its owning FRAMESET from the live structure on each
  // update. Search only inside frameMain; never insert HTML into a FRAMESET body.
  function presenceGetFooterTarget() {
    try {
      var main = presenceFindFrameByName(window, PRESENCE_FRAME_MAIN, 0);
      var doc = main ? main.document : null;
      if (!doc || !doc.body) {
        return null;
      }
      var frameset = null;
      var host = main;
      if (String(doc.body.tagName).toLowerCase() === "frameset") {
        frameset = doc.body;
        host = presenceFindFrameByName(main, PRESENCE_FRAME_ACTION_BAR, 0);
        doc = host ? host.document : null;
      }
      if (!doc || !doc.body || String(doc.body.tagName).toLowerCase() === "frameset") {
        return null;
      }
      var footer = getEl(host, PRESENCE_ACTION_BAR_ID);
      if (!footer) {
        footer = findElByClassInDoc(doc, "cmsActionBar");
      }
      if (!footer || !footer.parentNode) {
        return null;
      }
      return { doc: doc, footer: footer, frameset: frameset, win: host };
    } catch (e) {
      return null;
    }
  }

  // Restore just the footer's original row specification. Other CMS rows, including
  // the flexible content row, must remain untouched even if CMS changed them meanwhile.
  function presenceRestoreFooterRows() {
    var resize = presenceFooterResize;
    presenceFooterResize = null;
    if (!resize) {
      return;
    }
    try {
      var rows = String(resize.frameset.rows).split(",");
      if (rows.length > PRESENCE_ACTION_BAR_ROW_INDEX &&
        rows[PRESENCE_ACTION_BAR_ROW_INDEX] !== resize.originalRow) {
        rows[PRESENCE_ACTION_BAR_ROW_INDEX] = resize.originalRow;
        resize.frameset.rows = rows.join(",");
      }
    } catch (e) { }
  }

  // Capture BEFORE inserting the stripe, including during the connecting state.
  // Reuse this baseline on every poll/toggle instead of adding to an enlarged row.
  function presencePrepareFooterResize(target) {
    if (presenceFooterResize && presenceFooterResize.frameset === target.frameset) {
      return;
    }
    presenceRestoreFooterRows();
    if (!target.frameset) {
      return; // HTML frameMain does not need a frameset height adjustment
    }
    try {
      var rows = String(target.frameset.rows).split(",");
      if (rows.length <= PRESENCE_ACTION_BAR_ROW_INDEX) {
        return;
      }
      var row = trim(rows[PRESENCE_ACTION_BAR_ROW_INDEX]);
      var baseHeight;
      if (/^\d+$/.test(row)) {
        baseHeight = parseInt(row, 10);
      } else if (/[%*]/.test(row)) {
        // A percentage or star is not a pixel count. Use the allocated height,
        // but keep the original row text so removing the stripe restores it exactly.
        var frameEl = target.win.frameElement;
        baseHeight = frameEl ? frameEl.offsetHeight : 0;
        if (!(baseHeight > 0)) {
          return;
        }
      } else {
        return;
      }
      presenceFooterResize = {
        frameset: target.frameset,
        originalRow: rows[PRESENCE_ACTION_BAR_ROW_INDEX],
        baseHeight: baseHeight
      };
    } catch (e) { }
  }

  // Measure the full accordion after its text/display has been updated: 23px when
  // collapsed, plus the white details panel when expanded. Only the fourth row changes.
  function presenceResizeFooter() {
    if (!presenceFooterResize || !presenceStripeEl) {
      return;
    }
    try {
      var height = Math.max(PRESENCE_STRIPE_HEIGHT, presenceStripeEl.offsetHeight);
      if (!isFinite(height)) {
        return;
      }
      var resize = presenceFooterResize;
      var rows = String(resize.frameset.rows).split(",");
      if (rows.length <= PRESENCE_ACTION_BAR_ROW_INDEX) {
        return;
      }
      var value = String(resize.baseHeight + height);
      if (rows[PRESENCE_ACTION_BAR_ROW_INDEX] !== value) {
        rows[PRESENCE_ACTION_BAR_ROW_INDEX] = value;
        resize.frameset.rows = rows.join(",");
      }
    } catch (e) { }
  }

  // Drop the old DOM and restore its footer space, retaining text/expansion for the
  // next notification render if the user navigated within the same case.
  function presenceDetachStripe() {
    try {
      if (presenceStripeEl && presenceStripeEl.parentNode) {
        presenceStripeEl.parentNode.removeChild(presenceStripeEl);
      }
    } catch (e) { }
    presenceStripeEl = null;
    presenceRestoreFooterRows();
  }

  function presenceRemoveStripe() {
    presenceStripeState = null;
    presenceStripeExpanded = false;
    presenceDetachStripe();
  }

  // User interaction changes only expansion and its allocated space, not the
  // notification content or connection/poll cadence.
  function presenceUpdateStripeExpanded(toggle, details) {
    var label = presenceStripeExpanded ? "Hide details" : "Show details";
    if (toggle) {
      if (toggle.innerText !== label) {
        toggle.innerText = label;
      }
      toggle.setAttribute("aria-expanded", presenceStripeExpanded ? "true" : "false");
    }
    if (details) {
      details.style.display = presenceStripeExpanded ? "block" : "none";
    }
    presenceResizeFooter();
  }

  // Normal-flow accordion immediately BEFORE the whole footer table, keeping its
  // Cancel/Save/Done controls underneath. Only the red header is fixed at 23px;
  // the details and (in frameset mode) footer frame grow with the roster.
  function presenceRenderStripe() {
    try {
      var state = presenceStripeState;
      var target = presenceGetFooterTarget();
      if (!state || !target) {
        presenceDetachStripe();
        return;
      }
      var doc = target.doc;
      var footer = target.footer;
      var stripe = doc.getElementById(PRESENCE_STRIPE_ID);
      if (presenceStripeEl && presenceStripeEl !== stripe) {
        presenceDetachStripe(); // a new host, or a new document in the same named frame
      }
      presencePrepareFooterResize(target);
      if (!stripe) {
        stripe = doc.createElement("div");
        stripe.id = PRESENCE_STRIPE_ID;
        stripe.style.margin = "0";
        stripe.style.padding = "0";
        stripe.style.fontFamily = "Arial, sans-serif";
        stripe.style.fontSize = "10pt";

        var header = doc.createElement("div");
        header.id = PRESENCE_STRIPE_HEADER_ID;
        header.style.position = "relative";
        header.style.height = PRESENCE_STRIPE_HEIGHT + "px";
        header.style.lineHeight = PRESENCE_STRIPE_HEIGHT + "px";
        header.style.margin = "0";
        header.style.padding = "0";
        header.style.backgroundColor = PRESENCE_STRIPE_COLOR;
        header.style.color = "#ffffff";
        header.style.fontWeight = "bold";
        header.style.overflow = "hidden";

        var summary = doc.createElement("span");
        summary.id = PRESENCE_STRIPE_SUMMARY_ID;
        summary.style.display = "block";
        summary.style.margin = "0 110px 0 8px"; // reserve room for the details link
        summary.style.whiteSpace = "nowrap";
        summary.style.overflow = "hidden";
        summary.style.textOverflow = "ellipsis";
        header.appendChild(summary);

        var toggle = doc.createElement("a");
        toggle.id = PRESENCE_STRIPE_TOGGLE_ID;
        toggle.href = "#" + PRESENCE_STRIPE_DETAILS_ID;
        toggle.style.position = "absolute";
        toggle.style.right = "8px";
        toggle.style.top = "0px";
        toggle.style.color = "#ffffff";
        toggle.style.textDecoration = "underline";
        toggle.style.whiteSpace = "nowrap";
        toggle.setAttribute("role", "button");
        toggle.setAttribute("aria-controls", PRESENCE_STRIPE_DETAILS_ID);
        // DOM0's return false cancels anchor navigation in document-mode 5 too.
        // Enter activates the link natively; Space also toggles it like a button.
        toggle.onclick = function () {
          presenceStripeExpanded = !presenceStripeExpanded;
          presenceUpdateStripeExpanded(toggle, details);
          return false;
        };
        toggle.onkeydown = function (event) {
          var e = event || (doc.parentWindow ? doc.parentWindow.event : null);
          if (e && e.keyCode === 32) {
            e.returnValue = false;
            return toggle.onclick();
          }
          return true;
        };
        header.appendChild(toggle);
        stripe.appendChild(header);

        var details = doc.createElement("div");
        details.id = PRESENCE_STRIPE_DETAILS_ID;
        details.style.backgroundColor = "#ffffff";
        details.style.color = "#000000";
        details.style.border = "1px solid " + PRESENCE_STRIPE_COLOR;
        details.style.borderTop = "0";
        details.style.padding = "6px 8px";
        details.style.whiteSpace = "pre";
        details.style.overflow = "auto"; // keep long roster lines accessible without widening the page
        stripe.appendChild(details);
      }
      if (stripe.nextSibling !== footer) {
        footer.parentNode.insertBefore(stripe, footer);
      }
      presenceStripeEl = stripe;
      var summaryEl = doc.getElementById(PRESENCE_STRIPE_SUMMARY_ID);
      var toggleEl = doc.getElementById(PRESENCE_STRIPE_TOGGLE_ID);
      var detailsEl = doc.getElementById(PRESENCE_STRIPE_DETAILS_ID);
      var summaryText = typeof state.count === "number" ?
        state.count + " users currently working on the case" : state.text;
      if (summaryEl && summaryEl.innerText !== summaryText) {
        summaryEl.innerText = summaryText;
      }
      if (detailsEl) {
        if (detailsEl.innerText !== state.text) {
          detailsEl.innerText = state.text; // never interpret names / notification text as HTML
        }
      }
      presenceUpdateStripeExpanded(toggleEl, detailsEl);
    } catch (e) { }
  }

  /* ---- JSONP transport ------------------------------------------------------
   * Uses <script src> (NOT gated by the IE cross-origin XHR zone), so there's no
   * iframe and no cookie bridge — the adapter (handlePresenceJsonp) turns each GET
   * into the backend's real REST call. The JSONP response executes as JS, so the
   * callback receives a REAL object/array — no JSON parsing needed here (which an
  * XHR relay could not do in document-mode 5). Drives the footer stripe.
   * ----------------------------------------------------------------------- */
  var PRESENCE_JSONP_BASE = "/global-components/presence-jsonp"; // same-origin on the proxy
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
  // clears that section's roster. The stripe shows whenever ANY section of the case has
  // members; its details group the roster BY SECTION (empty sections omitted — see
  // presenceBuildDetails).

  // Build the dictionary key for a section object (caseId:kind:subjectId). subjectId
  // is null/absent for case-wide sections (CASE_REVIEW, CASE) — treat as empty.
  function presenceSectionKey(section) {
    if (!section) { return ""; }
    var caseId = section.caseId != null ? String(section.caseId) : "";
    // The wire kind already includes any CIN suffix; preserve it without adding another.
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
  // because the details show "<email> on <app> - joined <date>".
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

  // Match configured kinds (including any CIN suffix), keeping the display labels readable.
  function presenceSectionLabel(kind) {
    if (kind === SECTION_KIND_CASE_GENERIC) {
      return "Case";
    }
    if (kind === SECTION_KIND_CASE_REVIEW) {
      return "Case Review";
    }
    if (kind === SECTION_KIND_VICTIM_WITNESS) {
      return "Witness/Victim";
    }
    if (kind === SECTION_KIND_DEFENDANT) {
      return "Defendant";
    }
    return kind ? kind : "Section";
  }

  var PRESENCE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Format joinedAt in the computer's local timezone as "21 Aug 2026 08:11".
  // Parse ISO fields and the offset manually: document-mode 5 cannot reliably
  // Date.parse ISO strings. Local Date getters apply the timezone/DST at that instant.
  // A timestamp without an offset denotes local wall-clock time. Invalid input -> "".
  function presenceFormatJoined(iso) {
    if (!iso || typeof iso !== "string") {
      return "";
    }
    var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(iso);
    if (!m) {
      return "";
    }
    var year = parseInt(m[1], 10);
    var monthIdx = parseInt(m[2], 10) - 1;
    var day = parseInt(m[3], 10);
    var hour = parseInt(m[4], 10);
    var minute = parseInt(m[5], 10);
    var second = m[6] ? parseInt(m[6], 10) : 0;
    var millis = m[7] ? parseInt((m[7] + "00").substring(0, 3), 10) : 0;
    var zone = m[8];
    var date = new Date(0);
    date.setUTCFullYear(year, monthIdx, day);
    date.setUTCHours(hour, minute, second, millis);
    // Date normalises out-of-range fields; reject those rather than inventing a date.
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== monthIdx ||
      date.getUTCDate() !== day || date.getUTCHours() !== hour ||
      date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second) {
      return "";
    }
    if (zone && zone !== "Z") {
      var offset = zone.substring(1).replace(":", "");
      var offsetHours = parseInt(offset.substring(0, 2), 10);
      var offsetMinutes = parseInt(offset.substring(2, 4), 10);
      if (offsetHours > 23 || offsetMinutes > 59) {
        return "";
      }
      var offsetMillis = (offsetHours * 60 + offsetMinutes) * 60000;
      // +05:30 means the source clock is ahead of UTC, so subtract its offset.
      date = new Date(date.getTime() + (zone.charAt(0) === "+" ? -offsetMillis : offsetMillis));
    } else if (!zone) {
      date = new Date(0);
      date.setFullYear(year, monthIdx, day);
      date.setHours(hour, minute, second, millis);
    }
    var localHour = date.getHours();
    var localMinute = date.getMinutes();
    return date.getDate() + " " + PRESENCE_MONTHS[date.getMonth()] + " " + date.getFullYear() + " " +
      (localHour < 10 ? "0" : "") + localHour + ":" + (localMinute < 10 ? "0" : "") + localMinute;
  }

  // Build the full details text for one case, grouped by section. Format:
  //   Who's working where:
  //   Currently these users are working on <Section>:
  //   <email> on <app> - joined <date>
  //   ...
  //   <blank line between sections>
  // Sections whose roster is empty (everyone left — a valid, version-bumped
  // notification) are OMITTED. Returns "" when no section of the case has members.
  function presenceBuildDetails(caseId) {
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
  // rosters). Drives the stripe's header count. Empty sections contribute 0,
  // so this matches how many names presenceBuildDetails lists.
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

  // Session expired (a 410 on heartbeat: the Watchdog no longer knows this session, e.g. a
  // heartbeat arrived too late to renew it). Without a session we can't poll, so tear the
  // whole routine down and reconnect from scratch for the same section id.
  function presenceJsonpRestart() {
    var sid = presenceJsonpActiveSid; // capture before stop clears it
    presenceJsonpStop();
    if (sid) {
      presenceJsonpStart({ sectionId: sid });
    }
  }

  // Non-recoverable create/heartbeat failure: stop without auto-reconnect and
  // replace the connecting/roster stripe with the error message.
  function presenceJsonpFail() {
    presenceJsonpStop();
    presenceShowStripe(PRESENCE_ERROR_TEXT, null);
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
      // Poll (GET-mapped) -> reconcile -> stripe.
      presenceJsonp("poll", { sid: sid }, function (data) {
        if (presenceJsonpSessionId !== sid) { return; } // superseded (restart / stop / section switch)
        if (data === null) { return; } // transient timeout -> just retry on the next tick
        if (data.jsonpError) { return; }
        // Reconcile this delta into the per-section version-checked roster cache, then
        // recompute the stripe. Show it whenever ANY section of the case has
        // members (no threshold — even just you counts); the details group the roster
        // BY SECTION (empty sections omitted). An empty poll array applies nothing and
        // simply re-shows the unchanged rosters.
        presenceApplyNotifications(data);
        var caseId = presenceJsonpActiveSid ? presenceJsonpActiveSid.split(":")[0] : "";
        var text = presenceBuildDetails(caseId); // grouped, formatted per-section roster ("" if nobody)
        var count = presenceCountMembers(caseId); // total people across all sections
        if (text) {
          presenceShowStripe(text, count);
        } else {
          presenceRemoveStripe();
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

    // Show connecting immediately, then replace it with the count and details on
    // the first successful poll. No independent UI refresh runs in the observer tick.
    presenceShowStripe(PRESENCE_CONNECTING_TEXT, null);
    presenceJsonp("create", { sectionId: sid }, function (data) {
      if (presenceJsonpActiveSid !== sid) { return; } // superseded while in flight
      if (data === null || data.jsonpError || !data.sessionId) {
        var why = data === null ? "no response (timeout)" : (data.jsonpError || "no sessionId in response");
        // Could not establish the session -> show the same error stripe as heartbeat failure.
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
    presenceSections = {}; // fresh reconciliation state per presence session
    presenceRemoveStripe();
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
      rec = findActiveSection(window, 0, SECTION_DETECTORS);
      if (!rec) {
        rec = findActiveSection(window, 0, FALLBACK_DETECTORS);
      }
    } catch (e) { }
    var key = rec ? rec.key : "";
    if (key === lastKey) {
      lastRec = rec;
      if (rec && presenceJsonpActiveSid == "" && presenceJsonpSessionId == "") {
        presenceJsonpRestart();
      }
      return; // unchanged section: no UI refresh, reconnect, or clearing a permanent failure
    }
    var prev = lastRec;
    lastRec = rec;
    lastKey = key;
    if (prev) {
      presenceJsonpStop();
    }
    if (rec) {
      presenceJsonpStart(rec);
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
        presenceJsonpStop();
      } catch (e) { }
    }
    stop();
  }

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
  if (CMS_WATCHDOG_ENABLED !== true) {
    return; // no login watcher, auth iframe or manual auth-spawn handle
  }

  var BUILD = "spawn1"; // bump on redeploy to confirm fresh bytes are live (cache!)
  var DEBUG = true; // verbose per-tick logging; window.__ccAuthHandover.setDebug(false) to quiet

  var POLARIS_PATH = "/polaris-v2"; // auth entry; resolves to THIS origin then redirects to our domain. Change freely.
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
