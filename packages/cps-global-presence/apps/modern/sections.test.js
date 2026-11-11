/* Unit tests for modern/sections.js — the URL detectors.
 *
 * The URLs below are real ones, taken from HAR captures of the deployed apps —
 * including the trailing user guid that neither app documents.
 */
var h = require("../../test-harness");

function at(href) {
  var url = new URL(href);
  var win = h.fakeWindow({ href: href, pathname: url.pathname, hash: url.hash });
  var m = h.load(
    ["core/environment.js", "core/sections.js", "legacy/origin.js", "legacy/locator.js", "apps/modern/sections.js"],
    ["activeSections", "activeSectionIds", "describeLocation", "CCPEnvironment"],
    { window: win }
  );
  m.CCPEnvironment.adopt(CMS_ENV);
  return m;
}

// WHICH CMS INSTANCE. The wire ids carry its suffix. The value is DISCOVERED at
// runtime now rather than hardcoded in CCPEnvironment (it comes back with whoami),
// so every load above adopts it and the expected wire form is written out against
// what was adopted -- left unknown, the suffix would be "" and these assertions
// would stop describing the rule at all.
var CMS_ENV = "CIN3";

function wire(kind) {
  return kind + "_" + CMS_ENV;
}

h.describe("DCF — always a case review");

h.test("the review screen, with the case id in the path", function () {
  var m = at("https://polaris-qa-notprod.cps.gov.uk/dcf/review/124253/36ef2b44-14eb-4f82-95ee-21f0df1a6ae2?wid=MASTER");
  h.assertEqual(m.activeSectionIds(), ["124253:" + wire("CASE_REVIEW")]);
  h.assertEqual(m.describeLocation(), { app: "DCF", screen: "review" });
});

h.test("any other DCF screen on a case is still that case's review", function () {
  h.assertEqual(at("https://polaris-qa-notprod.cps.gov.uk/dcf/somethingnew/998877").activeSectionIds(), ["998877:" + wire("CASE_REVIEW")]);
});

h.describe("CMS Modern — always 'I am on this case'");

h.test("takes the caseId from the HASH, which never reaches the server", function () {
  var m = at("https://polaris-qa-notprod.cps.gov.uk/viewer/landing#/case-summary/2148456/f3faa37d-986c-45a7-833d-0abe36f125f2?wid=MASTER");
  h.assertEqual(m.activeSectionIds(), ["2148456:" + wire("CASE")]);
  h.assertEqual(m.describeLocation().app, "CMS Modern");
});

h.test("disclosure is the same case, so the same section", function () {
  h.assertEqual(at("https://polaris-qa-notprod.cps.gov.uk/viewer/landing#/disclosure/124253").activeSectionIds(), ["124253:" + wire("CASE")]);
});

h.test("a screen we have never heard of still reports the case — the screen list is not enumerated", function () {
  h.assertEqual(at("https://polaris-qa-notprod.cps.gov.uk/viewer/landing#/brand-new-screen/777").activeSectionIds(), ["777:" + wire("CASE")]);
});

h.describe("places with no case");

h.test("the dashboard registers nothing", function () {
  var m = at("https://polaris-qa-notprod.cps.gov.uk/viewer/landing#/dashboard");
  h.assertEqual(m.activeSectionIds(), []);
  h.assertEqual(m.describeLocation(), { app: "CMS Modern", screen: "dashboard" });
});

h.test("bare landing, before the router has run", function () {
  var m = at("https://polaris-qa-notprod.cps.gov.uk/viewer/landing");
  h.assertEqual(m.activeSectionIds(), []);
  h.assertEqual(m.describeLocation(), { app: "CMS Modern", screen: "landing" });
});

h.test("Classic is not ours — it has its own client and its own detectors", function () {
  var m = at("https://polaris-qa-notprod.cps.gov.uk/CMS.24.0.01/Case/uacdCaseDetails.aspx?intCaseID=124253");
  h.assertEqual(m.activeSectionIds(), []);
  h.assertEqual(m.describeLocation(), { app: null, screen: null });
});

h.describe("the section, not just its id");

h.test("carries its case", function () {
  var m = at("https://polaris-qa-notprod.cps.gov.uk/dcf/review/124253/guid");
  h.assertEqual(m.activeSections()[0].caseId, "124253");
});

h.summarise();
