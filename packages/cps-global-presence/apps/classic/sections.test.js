/* Unit tests for classic/sections.js — the frame readers.
 *
 * Classic has no addressable state, so these build the thing it actually reads: the
 * CMS shell, with frameMain holding the screen you are on and the finer sections
 * living in frames nested inside it. Every URL below is real, taken from HAR
 * captures of CMS 24.0.01.
 *
 * The two behaviours worth pinning down:
 *   - the CASE section comes from frameMain ALONE, which is the frame CMS itself
 *     consults ("top.frameMain.document.location.search" ~ "intCaseID"), so a
 *     sibling frame naming some other case cannot mislead it;
 *   - everything else is found by WALKING, because witness and defendant panels
 *     genuinely live in nested frames — and several can be active at once, which
 *     the original single-result locator could not report.
 */
var h = require("../../test-harness");

var CASE = "2121407";
var BASE = "https://polaris-qa-notprod.cps.gov.uk/CMS.24.0.01/";

// One CMS frame: a URL, the page globals a reader looks at, and hidden inputs.
function frame(href, globals, fields) {
  var win = globals || {};
  win.location = { href: href };
  win.frames = [];
  win.document = {
    getElementById: function (id) {
      return fields && fields.hasOwnProperty(id) ? { value: fields[id] } : null;
    },
    all: {}
  };
  return win;
}

// A frame whose location throws, exactly as a cross-origin one does.
function foreignFrame() {
  var win = { frames: [] };
  Object.defineProperty(win, "location", {
    get: function () {
      throw new Error("Access is denied.");
    }
  });
  return win;
}

// The shell as CMS builds it. `main` is frameMain — the screen you are on, given
// as a URL or a frame — and `nested` are the frames inside it.
function shell(main, nested) {
  var top = frame(BASE + "uaglCMS.aspx");
  var mainFrame = typeof main === "string" ? frame(main) : main;
  mainFrame.frames = nested || [];
  top.frameMain = mainFrame;
  top.frames = [mainFrame];
  return top;
}

// WHICH CMS INSTANCE THESE READERS ARE RUNNING AGAINST. The wire ids carry its
// suffix, applied in CCPLocator.section so that all three clients get it from
// one place. It is DISCOVERED at runtime now rather than hardcoded in the module
// (it comes back with whoami — see CCPEnvironment), so each load establishes it
// here and the expected wire form is written out against what was established.
var CMS_ENV = "CIN3";

function locate(top) {
  var m = h.load(
    ["core/environment.js", "core/sections.js", "legacy/locator.js", "apps/classic/dom.js", "apps/classic/sections.js"],
    ["activeSections", "activeSectionIds", "CCPEnvironment"],
    { window: top, document: top.document }
  );
  m.CCPEnvironment.adopt(CMS_ENV);
  return m;
}

function wire(kind) {
  return kind + "_" + CMS_ENV;
}

// A test about one section should assert about THAT section. The full list grows
// every time a detector is added — the case-wide one is in almost every result —
// and a test that asserts on all of it fails for reasons unrelated to its subject.
function idsOf(m, kind) {
  var sections = m.activeSections();
  var out = [];
  var i;
  for (i = 0; i < sections.length; i++) {
    if (sections[i].kind === kind) {
      out.push(sections[i].id);
    }
  }
  return out;
}

// The case-details workspace: a frameset in frameMain, holding the content frames.
var CASE_DETAILS = BASE + "Case/uacdCaseDetails.aspx?intCaseID=" + CASE;

var caseReviewFrame = function () {
  return frame(BASE + "Case/uapcPreChargeCaseAnalysis.aspx?intCaseID=" + CASE);
};

var chargeDecisionFrame = function () {
  return frame(BASE + "Case/uapcPreChargeDecDetails.aspx?intCaseID=" + CASE);
};

var defendantFrame = function () {
  return frame(
    BASE + "Case/uadcDefsCharges.aspx?intCaseID=" + CASE,
    { sMode: "editDefendant", iScreenCaseID: CASE },
    { hidInEditMode: "Y", hidPartyID: "88112" }
  );
};

h.describe("case review");

h.test("is found in frameMain and is case-wide — no subject", function () {
  h.assertEqual(idsOf(locate(shell(caseReviewFrame())), "CASE_REVIEW"), [CASE + ":" + wire("CASE_REVIEW")]);
});

h.test("the charge-decision page is the SAME section, so the two rosters merge", function () {
  h.assertEqual(idsOf(locate(shell(chargeDecisionFrame())), "CASE_REVIEW"), [CASE + ":" + wire("CASE_REVIEW")]);
});

h.describe("defendant");

h.test("is subject-scoped on the party id", function () {
  var m = locate(shell(CASE_DETAILS, [defendantFrame()]));
  h.assertEqual(idsOf(m, "DEFENDANT"), [CASE + ":" + wire("DEFENDANT") + ":88112"]);
});

h.test("is ignored unless the panel is actually in edit mode", function () {
  var f = frame(
    BASE + "Case/uadcDefsCharges.aspx?intCaseID=" + CASE,
    { sMode: "editDefendant", iScreenCaseID: CASE },
    { hidInEditMode: "N", hidPartyID: "88112" }
  );
  h.assertEqual(idsOf(locate(shell(CASE_DETAILS, [f])), "DEFENDANT"), []);
});

h.test("a party id of 0 is not a defendant", function () {
  var f = frame(
    BASE + "Case/uadcDefsCharges.aspx?intCaseID=" + CASE,
    { sMode: "editDefendant", iScreenCaseID: CASE },
    { hidInEditMode: "Y", hidPartyID: "0" }
  );
  h.assertEqual(idsOf(locate(shell(CASE_DETAILS, [f])), "DEFENDANT"), []);
});

h.describe("the case itself — asked of frameMain, as CMS asks it");

h.test("the case-details workspace", function () {
  h.assertEqual(idsOf(locate(shell(CASE_DETAILS)), "CASE"), [CASE + ":" + wire("CASE")]);
});

// The pre-charge world: different header, no frameset of its own, same frameMain.
h.test("every pre-charge screen, which is where the header misleads", function () {
  var pages = [
    "Case/uapcPreChargeCaseAnalysis.aspx",
    "Case/uapcPreChargeDecRequests.aspx",
    "Case/uapcPCDAllRequests.aspx",
    "Case/uapcPreChargeTriage.aspx",
    "register/uarpRegisterPCDCase.aspx"
  ];
  var i;
  for (i = 0; i < pages.length; i++) {
    var m = locate(shell(BASE + pages[i] + "?intCaseID=" + CASE));
    h.assertEqual(idsOf(m, "CASE"), [CASE + ":" + wire("CASE")], pages[i]);
  }
});

h.test("a case screen we have never met — there is no page list to fall behind", function () {
  h.assertEqual(idsOf(locate(shell(BASE + "Case/uaSomethingNew.aspx?intCaseID=" + CASE)), "CASE"), [CASE + ":" + wire("CASE")]);
});

h.test("screens with no case register nothing", function () {
  var pages = [
    "Tasks/uatlTaskList.aspx",
    "Support/uacfSearchCriteria.aspx",
    "User/uaulLogin.aspx",
    "Register/uarpRegisterPCDCase.aspx" // "New" — the same page WITHOUT a case
  ];
  var i;
  for (i = 0; i < pages.length; i++) {
    h.assertEqual(locate(shell(BASE + pages[i])).activeSectionIds(), [], pages[i]);
  }
});

h.test("the parameter present but empty is not a case", function () {
  h.assertEqual(locate(shell(BASE + "Case/uacdCaseDetails.aspx?intCaseID=")).activeSectionIds(), []);
});

// CMS's own global for the case a screen is about. Preferred over the URL because
// a screen can keep it across a navigation that drops the parameter — which is
// where the hand-written client's generic reader earned its keep.
h.test("CMS's own screen global names the case when the URL does not", function () {
  var main = frame(BASE + "Case/uacoOverview.aspx", { iScreenCaseID: CASE });
  h.assertEqual(idsOf(locate(shell(main)), "CASE"), [CASE + ":" + wire("CASE")]);
});

h.test("the screen global wins over a stale parameter", function () {
  var main = frame(BASE + "Case/uacoOverview.aspx?intCaseID=9999999", { iScreenCaseID: CASE });
  h.assertEqual(idsOf(locate(shell(main)), "CASE"), [CASE + ":" + wire("CASE")]);
});

h.test("a screen global of zero is not a case", function () {
  var main = frame(BASE + "Tasks/uatlTaskList.aspx", { iScreenCaseID: 0 });
  h.assertEqual(locate(shell(main)).activeSectionIds(), []);
});

// The exclusions are about which SCREEN we are on, so they come first: the exit
// page carries the previous case in both the URL and the global.
h.test("the excluded screens stay excluded even when the global names a case", function () {
  var main = frame(BASE + "Noexpiry/GlobalInc/uaglCMSOnExit.aspx", { iScreenCaseID: CASE });
  h.assertEqual(locate(shell(main)).activeSectionIds(), []);
});

h.describe("screens that name a case without being on one");

h.test("a destroyed case is excluded, as CMS excludes it", function () {
  h.assertEqual(locate(shell(BASE + "Case/uadsDestroyedCase.aspx?intCaseID=" + CASE)).activeSectionIds(), []);
});

h.test("the exit page is too — it carries the case the session is LEAVING", function () {
  // Seen at login in the captures: uaglCMSOnExit.aspx?intCaseID=<previous case>.
  var href = BASE + "Noexpiry/GlobalInc/uaglCMSOnExit.aspx?intCaseID=2194728";
  h.assertEqual(locate(shell(href)).activeSectionIds(), []);
});

h.test("a sibling frame naming another case cannot mislead us — the point of asking one frame", function () {
  var top = shell(CASE_DETAILS);
  top.frames.push(frame(BASE + "Case/uacoOverview.aspx?intCaseID=9999999"));
  h.assertEqual(idsOf(locate(top), "CASE"), [CASE + ":" + wire("CASE")]);
});

h.describe("nesting — the doll inside the doll");

h.test("an open defendant reports the defendant AND the case around it", function () {
  var m = locate(shell(CASE_DETAILS, [defendantFrame()]));
  h.assertEqual(m.activeSectionIds(), [CASE + ":" + wire("DEFENDANT") + ":88112", CASE + ":" + wire("CASE")]);
});

h.test("a case review reports both, from one frame", function () {
  var m = locate(shell(caseReviewFrame()));
  h.assertEqual(m.activeSectionIds(), [CASE + ":" + wire("CASE_REVIEW"), CASE + ":" + wire("CASE")]);
});

h.test("the case never outranks a finer section — the stripe follows the first", function () {
  var m = locate(shell(CASE_DETAILS, [defendantFrame()]));
  h.assertEqual(m.activeSections()[0].kind, "DEFENDANT");
  h.assertEqual(m.activeSections()[m.activeSections().length - 1].kind, "CASE");
});

h.describe("the witness list");

// The witness tab of the documents screen, with the edit panel open (or a merge or
// delete chosen) and these witness ids ticked.
function witnessTab(ticked, action) {
  var win = frame(BASE + "Case/uacgSelectDocument.aspx?intCaseID=" + CASE, { sCallMode: "witness" }, {
    cboNWitnessMode: "2",
    cboYAction: action || "",
    hidWitnessIdCSV: ticked
  });
  var fields = win.document.getElementById;
  win.document.getElementById = function (id) {
    return id === "tblWitnessDetails" ? { currentStyle: { display: action ? "none" : "block" } } : fields(id);
  };
  return win;
}

h.test("one ticked witness is one section", function () {
  var m = locate(shell(CASE_DETAILS, [witnessTab("501")]));
  h.assertEqual(m.activeSectionIds(), [CASE + ":" + wire("VICTIM_WITNESS") + ":501", CASE + ":" + wire("CASE")]);
});

h.test("several ticked witnesses are a section each — a merge acts on all of them", function () {
  var m = locate(shell(CASE_DETAILS, [witnessTab("501,502", "5")]));
  h.assertEqual(m.activeSectionIds(), [
    CASE + ":" + wire("VICTIM_WITNESS") + ":501",
    CASE + ":" + wire("VICTIM_WITNESS") + ":502",
    CASE + ":" + wire("CASE")
  ]);
});

h.test("none ticked is no witness section", function () {
  var m = locate(shell(CASE_DETAILS, [witnessTab("")]));
  h.assertEqual(m.activeSectionIds(), [CASE + ":" + wire("CASE")]);
});

h.describe("frames we cannot read");

h.test("a cross-origin nested frame is stepped over, not fatal", function () {
  var m = locate(shell(CASE_DETAILS, [foreignFrame(), defendantFrame()]));
  h.assertEqual(m.activeSectionIds(), [CASE + ":" + wire("DEFENDANT") + ":88112", CASE + ":" + wire("CASE")]);
});

h.test("a frameMain we cannot read yields no case rather than throwing", function () {
  h.assertEqual(locate(shell(foreignFrame())).activeSectionIds(), []);
});

h.test("nested frames are walked, not just the first level", function () {
  var outer = frame(BASE + "Case/framePageHolder.aspx");
  outer.frames = [defendantFrame()];
  var m = locate(shell(CASE_DETAILS, [outer]));
  h.assertEqual(idsOf(m, "DEFENDANT"), [CASE + ":" + wire("DEFENDANT") + ":88112"]);
});

h.summarise();
