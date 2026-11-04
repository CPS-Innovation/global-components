/* classic/sections.js — which sections CMS Classic is showing. CLASSIC ONLY.
 *
 * The hard case. Classic has no addressable state: the section is whatever a
 * nested, same-origin frame happens to be displaying, and the only way to know is
 * to read that frame's own globals and hidden fields. So each detector below is a
 * URL FRAGMENT (which frame) plus a READER (is it active, and for which subject).
 *
 * Compare modern/sections.js, where the address is the whole story and every
 * detector is one regex.
 *
 * TO SUPPORT A NEW SECTION: write a reader that returns CCPLocator.section(...)
 * or null, and add one row to CLASSIC_SECTIONS. Nothing else changes — not the
 * sessions, not the roster, not the banner.
 *
 * PLURAL. The original returned the FIRST match and stopped, so a user on a case
 * review who opened a witness panel was reported as being in one section, not
 * two. Every matching frame is now reported.
 *
 * `hint` carries what only Classic cares about: the finer contact-edit key and
 * the person/recorder ids and name for the event sink. Shared code passes it
 * through untouched.
 */

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

// The OUTER doll — and we ask CMS's own question rather than inventing one.
// From the generated script CMS serves itself:
//
//     var sQString = top.frameMain.document.location.search;
//     if (sQString.indexOf(QUERY_CASE_ID) > -1 &&
//         top.frameMain.document.location.href.indexOf(SCREEN_DESTROYED_CASE) == -1)
//
// with QUERY_CASE_ID = "intCaseID" and SCREEN_DESTROYED_CASE = "uadsDestroyedCase".
// So the canonical answer to "which case am I on" is frameMain's query string, and
// we use the same frame and the same test.
//
// WHY ONE FRAME AND NOT ALL OF THEM. Both CMS worlds put the case in frameMain —
// the case-details workspace (Case/uacdCaseDetails.aspx, itself a frameset holding
// the blue action bar) and pre-charge (uapcPreChargeCaseAnalysis, PCDAllRequests,
// PreChargeTriage, register/uarpRegisterPCDCase, all plain pages). Only the header
// differs between them, which is why pre-charge looks like an outlier and is not.
// Meanwhile a scan of every frame picks up things that are NOT where you are: the
// captures show uaglCMSOnExit.aspx carrying the PREVIOUS session's case id at login.
//
// Still no page list: a case screen nobody has seen registers the case, as long as
// CMS puts it in frameMain — which is how CMS finds it too.
var FRAME_MAIN = "frameMain";
var SCREEN_DESTROYED_CASE = "uadsDestroyedCase"; // carries a case id; is not one
var SCREEN_ON_EXIT = "uaglCMSOnExit"; // ditto, from the session being torn down
var SECTION_KIND_CASE = "CASE"; // case-wide, no subject

// NO POPUP HOST HERE ANY MORE. Each section used to declare which frame should
// host the hover popup, because pages differ in structure: some load a frameset
// into frameMain and render in a child "framePage", others render directly as
// frameMain's own document. The footer stripe that replaced the popup always
// renders in the action bar instead (see stripe.js), which it resolves from the
// live frame structure, so a section no longer has to know where it is drawn.

var timer;

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
  // Subject-scoped: the subject is the PERSON, so the victim and witness rows of
  // one person share a section id — presence follows the person, not the row.
  //
  // hint.key is finer than the section id (it adds role and recorder), so a
  // victim<->witness switch still logs a closed/editing transition even though
  // the section itself has not changed.
  return CCPLocator.section(caseId, SECTION_KIND_VICTIM_WITNESS, personId, {
    key: caseId + "/" + personId + "/" + (recorderId || "-") + "/" + role,
    personId: personId,
    recorderId: recorderId,
    name: trim((first[idx] || "") + " " + (sur[idx] || "")),
    role: role
  });
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

  return CCPLocator.section(caseId, SECTION_KIND_VICTIM_WITNESS, witnessId ? witnessId : null, {
    personId: witnessId ? witnessId : ""
  });
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
  return CCPLocator.section(caseId, SECTION_KIND_CASE_REVIEW, null, {});
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

  return CCPLocator.section(caseId, SECTION_KIND_DEFENDANT, partyId, {
    key: caseId + "/" + partyId + "/defendant",
    personId: partyId,
    role: "Defendant"
  });
}

// The section registry. fragment -> the frame that shows it; read -> is it active.
// The order is a priority list: the first match is the section the stripe is about.
var CLASSIC_SECTIONS = [
  { kind: SECTION_KIND_VICTIM_WITNESS, fragment: FRAGMENT_CONTACTS, read: readOpenContact },
  { kind: SECTION_KIND_CASE_REVIEW, fragment: FRAGMENT_CASE_REVIEW, read: readCaseReview },
  { kind: SECTION_KIND_CASE_REVIEW, fragment: FRAGMENT_CASE_REVIEW_CHARGE, read: readCaseReview },
  { kind: SECTION_KIND_DEFENDANT, fragment: FRAGMENT_DEFS_CHARGES, read: readOpenDefendant },
  { kind: SECTION_KIND_VICTIM_WITNESS, fragment: FRAGMENT_DOCUMENTS, read: readWitnessTab }
];

// Walk win and its whole same-origin subtree, collecting every section this one
// spec finds. Cross-origin frames throw on access and are skipped; a reader that
// throws costs its own frame and nothing more.
function readSectionsInFrames(win, spec, depth, out) {
  if (depth > MAXDEPTH) {
    return;
  }
  var href = "";
  try {
    href = win.location.href;
  } catch (e) {
    href = ""; // cross-origin frame
  }
  if (href && href.indexOf(spec.fragment) !== -1) {
    var section = null;
    try {
      section = spec.read(win);
    } catch (e2) {
      section = null;
    }
    if (section) {
      section.hint = section.hint ? section.hint : {};
      // Most sections are identified finely enough by their id; only the contact
      // panel needs a finer key, and it sets its own.
      //
      // REBUILT FROM THE UNSUFFIXED KIND rather than taken from section.id,
      // which carries the CIN suffix. The suffix is not known at load — it
      // arrives with whoami — so an id used as the key would CHANGE under an
      // open panel the moment it does, and updateEvents reads a changed key as a
      // different record: "closed" then "editing" for something nobody touched.
      // section.kind is already stripped by CCPLocator.section.
      if (!section.hint.key) {
        section.hint.key = CCPSections.sectionId(section.caseId, section.kind, section.subjectId);
      }
      out.push(section);
    }
  }
  var frames;
  try {
    frames = win.frames;
  } catch (e3) {
    return;
  }
  var i;
  for (i = 0; i < frames.length; i++) {
    readSectionsInFrames(frames[i], spec, depth + 1, out);
  }
}

function classicDetector(spec) {
  return {
    kind: spec.kind,
    detect: function (root) {
      var out = [];
      readSectionsInFrames(root, spec, 0, out);
      return out;
    }
  };
}

// The shell's frameMain, which is the screen the user is actually on.
function mainFrame(root) {
  var found = null;
  try {
    found = root.frameMain; // a named frame of the shell: the direct route
  } catch (e) {
    found = null;
  }
  if (found) {
    return found;
  }
  // Injected somewhere other than the shell, or the frame is not yet named.
  return presenceFindFrameByName(root, FRAME_MAIN, 0);
}

// Anywhere in a case. Unlike the readers above this does NOT walk: it asks the one
// canonical frame, so it cannot be fooled by a sibling frame that happens to name
// a case. When a finer section is also active both are reported — a user editing a
// witness is in that witness's section AND on the case.
//
// The hand-written client did this as a FALLBACK_DETECTORS entry that walked every
// frame for one whose URL contains "intCaseID", used only when no finer section
// matched. NOT ported, on purpose, and the difference is worth knowing: walking
// means the first frame naming any case wins, which is the misleading-sibling
// problem the test suite pins. What WAS worth taking from it is iScreenCaseID
// below. The cost is a case screen whose frameMain URL carries no case id while a
// nested frame does: we report no case section there and the hand-written client
// would have. No such screen is known — if one turns up, it belongs here as
// another source for THIS frame, not as a walk.
function readCaseContext(root) {
  var main = mainFrame(root);
  if (!main) {
    return null;
  }
  var href = "";
  try {
    href = String(main.location.href || "");
  } catch (e) {
    return null; // cross-origin, or navigating
  }
  if (href.indexOf(SCREEN_DESTROYED_CASE) !== -1 || href.indexOf(SCREEN_ON_EXIT) !== -1) {
    return null; // names a case without being on one
  }
  // CMS's own global for "the case this screen is about", preferred over the URL
  // because a screen can keep it across a navigation that drops the parameter.
  // A zero is not a case, and `?` already treats it as absent.
  var caseId = "";
  try {
    caseId = main.iScreenCaseID ? String(main.iScreenCaseID) : "";
  } catch (e2) {
    caseId = "";
  }
  if (!caseId) {
    caseId = queryParam(href, "intCaseID");
  }
  if (!caseId) {
    return null;
  }
  return CCPLocator.section(caseId, SECTION_KIND_CASE, null, {});
}

function buildClassicLocator() {
  var detectors = [];
  var i;
  for (i = 0; i < CLASSIC_SECTIONS.length; i++) {
    detectors.push(classicDetector(CLASSIC_SECTIONS[i]));
  }
  // LAST, and that matters: detector order is priority and the banner follows the
  // first section found, so every finer section outranks the case around it. This
  // one is not a walker — it asks frameMain directly — so it is added here rather
  // than sitting in the registry above.
  detectors.push({ kind: SECTION_KIND_CASE, detect: readCaseContext });
  return CCPLocator.createLocator(detectors);
}

var classicLocator = buildClassicLocator();

/** Every section active anywhere in the CMS frameset right now. */
function activeSections() {
  return classicLocator.list(window);
}

/** The same, as ids — what the session layer wants. */
function activeSectionIds() {
  return classicLocator.ids(window);
}
