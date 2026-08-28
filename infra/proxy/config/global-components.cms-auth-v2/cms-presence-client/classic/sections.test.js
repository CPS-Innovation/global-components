/* Unit tests for classic/sections.js — the frame readers.
 *
 * Classic has no addressable state, so these build the thing it actually reads: a
 * nested frameset where each frame has a URL, some page globals and some hidden
 * fields. The URLs and field names are the real ones from CMS 24.0.01.
 *
 * The case that earns its own test is TWO sections at once, because the original
 * returned the first match and stopped — a user on a case review with a witness
 * panel open was reported as being in one place when they were in two.
 */
var h = require("../test-harness");

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

function shell(children) {
  var top = frame(BASE + "uaglCMS.aspx");
  top.frames = children;
  return top;
}

function locate(top) {
  var m = h.load(
    ["common/presence-sections.js", "common/presence-locator.js", "classic/dom.js", "classic/sections.js"],
    ["activeSections", "activeSectionIds"],
    { window: top, document: top.document }
  );
  return m;
}

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

h.test("is found in a nested frame and is case-wide — no subject", function () {
  var m = locate(shell([caseReviewFrame()]));
  h.assertEqual(m.activeSectionIds(), [CASE + ":CASE_REVIEW"]);
});

h.test("the charge-decision page is the SAME section, so the two rosters merge", function () {
  var m = locate(shell([chargeDecisionFrame()]));
  h.assertEqual(m.activeSectionIds(), [CASE + ":CASE_REVIEW"]);
});

h.test("both review pages open at once still name one section, not two", function () {
  var m = locate(shell([caseReviewFrame(), chargeDecisionFrame()]));
  h.assertEqual(m.activeSectionIds(), [CASE + ":CASE_REVIEW"]);
});

h.test("carries the frame the banner should anchor its popup to", function () {
  var m = locate(shell([caseReviewFrame()]));
  h.assertEqual(m.activeSections()[0].hint.popupFrame, "frameMain");
});

h.describe("defendant");

h.test("is subject-scoped on the party id", function () {
  var m = locate(shell([defendantFrame()]));
  h.assertEqual(m.activeSectionIds(), [CASE + ":DEFENDANT:88112"]);
});

h.test("is ignored unless the panel is actually in edit mode", function () {
  var f = frame(
    BASE + "Case/uadcDefsCharges.aspx?intCaseID=" + CASE,
    { sMode: "editDefendant", iScreenCaseID: CASE },
    { hidInEditMode: "N", hidPartyID: "88112" }
  );
  h.assertEqual(locate(shell([f])).activeSectionIds(), []);
});

h.test("a party id of 0 is not a defendant", function () {
  var f = frame(
    BASE + "Case/uadcDefsCharges.aspx?intCaseID=" + CASE,
    { sMode: "editDefendant", iScreenCaseID: CASE },
    { hidInEditMode: "Y", hidPartyID: "0" }
  );
  h.assertEqual(locate(shell([f])).activeSectionIds(), []);
});

h.describe("more than one section at once");

h.test("a case review AND an open defendant are both reported", function () {
  var m = locate(shell([caseReviewFrame(), defendantFrame()]));
  h.assertEqual(m.activeSectionIds(), [CASE + ":CASE_REVIEW", CASE + ":DEFENDANT:88112"]);
});

h.test("detector order decides the primary — the banner follows the first", function () {
  // Registry order is victim/witness, case review, defendant: whichever frames
  // exist, the earlier detector wins the banner.
  var m = locate(shell([defendantFrame(), caseReviewFrame()]));
  h.assertEqual(m.activeSections()[0].kind, "CASE_REVIEW");
});

h.describe("frames we cannot read");

h.test("a cross-origin frame is stepped over, not fatal", function () {
  var m = locate(shell([foreignFrame(), caseReviewFrame()]));
  h.assertEqual(m.activeSectionIds(), [CASE + ":CASE_REVIEW"]);
});

h.test("a frameset with nothing of ours in it yields nothing", function () {
  var m = locate(shell([frame(BASE + "Case/uacdCaseDetails.aspx?intCaseID=" + CASE)]));
  h.assertEqual(m.activeSectionIds(), []);
});

h.test("nested frames are walked, not just the first level", function () {
  var outer = frame(BASE + "Case/frameset.aspx");
  outer.frames = [caseReviewFrame()];
  h.assertEqual(locate(shell([outer])).activeSectionIds(), [CASE + ":CASE_REVIEW"]);
});

h.summarise();
