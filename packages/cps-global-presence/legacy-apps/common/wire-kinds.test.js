/* The two legacy clients agree about what goes on the wire.
 *
 * THIS IS THE TEST THAT WAS MISSING. Classic and Modern each used to suffix their
 * own section kinds, in their own constants, and the suffix only does its job when
 * both say the same thing: a client registering "1234:CASE" against an instance
 * speaking "1234:CASE_CIN3" forms its own conflict set of one. There is no error
 * and no empty roster to notice -- simply nobody ever there.
 *
 * That has already happened once, in September, when Classic moved first. It
 * nearly happened again in the other direction: the modular Classic client had
 * never started suffixing at all, and nothing in three green test suites said so,
 * because every suite checked one client against its own expectations.
 *
 * So this file asserts across the two, on the one thing they have to share. It
 * does not care what the suffix IS -- CCPEnvironment owns that -- only that one
 * case, seen from two applications, is one section.
 *
 * Both clients now get the suffix from CCPLocator.section rather than applying it
 * themselves, so this should be hard to break. It is here for the day someone
 * decides to apply it somewhere else.
 */
var h = require("../../test-harness");

var CASE = "2121407";
var BASE = "https://polaris-qa-notprod.cps.gov.uk/CMS.24.0.01/";

// WHICH CMS INSTANCE BOTH CLIENTS ARE ON. Each load below adopts it, because the
// value is discovered at runtime now rather than hardcoded in CCPEnvironment --
// and a suite that left it unknown would compare two clients that had both
// stopped suffixing and call them agreed.
var CMS_ENV = "CIN3";

// ---- Classic: a CMS shell, read through frames --------------------------------

function frame(href, globals) {
  var win = globals || {};
  win.location = { href: href };
  win.frames = [];
  win.document = {
    getElementById: function () {
      return null;
    },
    all: {}
  };
  return win;
}

// frameMain is the screen you are on; the shell is what Classic is injected into.
function classicShell(mainHref) {
  var top = frame(BASE + "uaglCMS.aspx");
  var main = frame(mainHref);
  top.frameMain = main;
  top.frames = [main];
  return top;
}

function classicAt(mainHref) {
  var top = classicShell(mainHref);
  var m = h.load(
    [
      "common/presence-environment.js",
      "legacy-apps/common/presence-sections.js",
      "legacy-apps/common/presence-locator.js",
      "legacy-apps/classic/dom.js",
      "legacy-apps/classic/sections.js"
    ],
    ["activeSections", "activeSectionIds", "CCPEnvironment"],
    { window: top, document: top.document }
  );
  m.CCPEnvironment.adopt(CMS_ENV);
  return m;
}

// ---- Modern: a URL, and nothing else ------------------------------------------

function modernAt(href) {
  var url = new URL(href);
  var win = h.fakeWindow({ href: href, pathname: url.pathname, hash: url.hash });
  var m = h.load(
    [
      "common/presence-environment.js",
      "legacy-apps/common/presence-sections.js",
      "legacy-apps/common/presence-origin.js",
      "legacy-apps/common/presence-locator.js",
      "legacy-apps/modern/sections.js"
    ],
    ["activeSections", "activeSectionIds", "CCPEnvironment"],
    { window: win }
  );
  m.CCPEnvironment.adopt(CMS_ENV);
  return m;
}

// The section of a given kind, from either client. Both report several sections at
// once, and the comparison is per kind.
function idOfKind(m, kind) {
  var sections = m.activeSections();
  var i;
  for (i = 0; i < sections.length; i++) {
    if (sections[i].kind === kind) {
      return sections[i].id;
    }
  }
  return "";
}

h.describe("one case, two applications, one section");

// A caseworker in CMS Classic and a colleague in the CMS Modern viewer, both on
// case 2121407. If these two strings differ, neither can see the other.
h.test("the case section has the same id in Classic and in Modern", function () {
  var classic = classicAt(BASE + "Case/uacdCaseDetails.aspx?intCaseID=" + CASE);
  var modern = modernAt("https://polaris-qa-notprod.cps.gov.uk/viewer/landing#/disclosure/" + CASE);

  var fromClassic = idOfKind(classic, "CASE");
  var fromModern = idOfKind(modern, "CASE");

  h.assertTrue(fromClassic !== "", "Classic reported no case section");
  h.assertTrue(fromModern !== "", "Modern reported no case section");
  h.assertEqual(fromClassic, fromModern);
});

// Case review is reachable from both: the pre-charge screens in Classic, DCF in
// Modern. Same section, so the same id.
h.test("the case review section has the same id in Classic and in Modern", function () {
  var classic = classicAt(BASE + "Case/uapcPreChargeCaseAnalysis.aspx?intCaseID=" + CASE);
  var modern = modernAt("https://polaris-qa-notprod.cps.gov.uk/dcf/review/" + CASE + "/36ef2b44");

  var fromClassic = idOfKind(classic, "CASE_REVIEW");
  var fromModern = idOfKind(modern, "CASE_REVIEW");

  h.assertTrue(fromClassic !== "", "Classic reported no case review section");
  h.assertTrue(fromModern !== "", "Modern reported no case review section");
  h.assertEqual(fromClassic, fromModern);
});

h.describe("and both of them carry the instance");

// Not just equal to each other -- equal to each other AND suffixed. Two clients
// that had both stopped suffixing would pass the tests above and still be isolated
// from the hand-written Classic client that is deployed today.
h.test("the shared id is the suffixed kind, not the bare one", function () {
  var classic = classicAt(BASE + "Case/uacdCaseDetails.aspx?intCaseID=" + CASE);
  h.assertEqual(idOfKind(classic, "CASE"), CASE + ":CASE_" + CMS_ENV);
});

// The kind stays as the API documents it, in both clients, so everything that
// names or applies policy to a section works on one vocabulary.
h.test("the kind each client reports is the documented one, in both", function () {
  var classic = classicAt(BASE + "Case/uacdCaseDetails.aspx?intCaseID=" + CASE);
  var modern = modernAt("https://polaris-qa-notprod.cps.gov.uk/viewer/landing#/disclosure/" + CASE);
  h.assertEqual(idOfKind(classic, "CASE").indexOf(CASE + ":CASE"), 0);
  h.assertEqual(idOfKind(modern, "CASE").indexOf(CASE + ":CASE"), 0);
});

h.summarise();
