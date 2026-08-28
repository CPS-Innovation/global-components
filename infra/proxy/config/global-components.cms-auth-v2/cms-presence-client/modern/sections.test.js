/* Unit tests for modern/sections.js — the URL detectors.
 *
 * The URLs below are real ones, taken from HAR captures of the deployed apps —
 * including the trailing user guid that neither app documents.
 */
var h = require("../test-harness");

function at(href) {
  var url = new URL(href);
  var win = h.fakeWindow({ href: href, pathname: url.pathname, hash: url.hash });
  return h.load(
    ["common/presence-sections.js", "common/presence-origin.js", "common/presence-locator.js", "modern/sections.js"],
    ["activeSections", "activeSectionIds", "describeLocation", "resolveJsonpBase"],
    { window: win }
  );
}

h.describe("DCF — always a case review");

h.test("the review screen, with the case id in the path", function () {
  var m = at("https://polaris-qa-notprod.cps.gov.uk/dcf/review/124253/36ef2b44-14eb-4f82-95ee-21f0df1a6ae2?wid=MASTER");
  h.assertEqual(m.activeSectionIds(), ["124253:CASE_REVIEW"]);
  h.assertEqual(m.describeLocation(), { app: "DCF", screen: "review" });
});

h.test("any other DCF screen on a case is still that case's review", function () {
  h.assertEqual(at("https://polaris-qa-notprod.cps.gov.uk/dcf/somethingnew/998877").activeSectionIds(), ["998877:CASE_REVIEW"]);
});

h.describe("CMS Modern — always 'I am on this case'");

h.test("takes the caseId from the HASH, which never reaches the server", function () {
  var m = at("https://polaris-qa-notprod.cps.gov.uk/viewer/landing#/case-summary/2148456/f3faa37d-986c-45a7-833d-0abe36f125f2?wid=MASTER");
  h.assertEqual(m.activeSectionIds(), ["2148456:CASE"]);
  h.assertEqual(m.describeLocation().app, "CMS Modern");
});

h.test("disclosure is the same case, so the same section", function () {
  h.assertEqual(at("https://polaris-qa-notprod.cps.gov.uk/viewer/landing#/disclosure/124253").activeSectionIds(), ["124253:CASE"]);
});

h.test("a screen we have never heard of still reports the case — the screen list is not enumerated", function () {
  h.assertEqual(at("https://polaris-qa-notprod.cps.gov.uk/viewer/landing#/brand-new-screen/777").activeSectionIds(), ["777:CASE"]);
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

h.test("carries the app it was found in, for diagnostics", function () {
  var m = at("https://polaris-qa-notprod.cps.gov.uk/dcf/review/124253/guid");
  h.assertEqual(m.activeSections()[0].hint, { app: "DCF" });
  h.assertEqual(m.activeSections()[0].caseId, "124253");
});

h.describe("resolveJsonpBase");

h.test("uses our own script origin — unproxied, a relative path would hit the CMS host", function () {
  var win = h.fakeWindow({ href: "https://cms.example/viewer/landing", pathname: "/viewer/landing", hash: "" });
  var doc = h.fakeDocument([
    { src: "https://cms.example/some/other.js" },
    { src: "https://polaris.example/global-components/test/cms-presence-client.js" }
  ]);
  var m = h.load(
    ["common/presence-sections.js", "common/presence-origin.js", "common/presence-locator.js", "modern/sections.js"],
    ["resolveJsonpBase"],
    { window: win, document: doc }
  );
  h.assertEqual(m.resolveJsonpBase("/global-components/presence-jsonp"), "https://polaris.example/global-components/presence-jsonp");
});

h.test("falls back to the relative path when our tag cannot be found", function () {
  var win = h.fakeWindow({ href: "https://cms.example/viewer/landing", pathname: "/viewer/landing", hash: "" });
  var doc = h.fakeDocument([{ src: "https://cms.example/other.js" }]);
  var m = h.load(
    ["common/presence-sections.js", "common/presence-origin.js", "common/presence-locator.js", "modern/sections.js"],
    ["resolveJsonpBase"],
    { window: win, document: doc }
  );
  h.assertEqual(m.resolveJsonpBase("/global-components/presence-jsonp"), "/global-components/presence-jsonp");
});

h.summarise();
