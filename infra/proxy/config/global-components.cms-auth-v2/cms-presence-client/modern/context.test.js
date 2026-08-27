/* Unit tests for modern/context.js
 *
 * The URLs below are real ones, taken from HAR captures of the deployed apps —
 * including the trailing user guid that neither app documents.
 */
var h = require("../test-harness");

function at(href) {
  var url = new URL(href);
  var win = h.fakeWindow({ pathname: url.pathname, hash: url.hash });
  return h.load(["common/presence-sections.js", "common/presence-origin.js", "modern/context.js"], ["readContext", "sectionIdForContext", "resolveJsonpBase"], { window: win });
}

h.describe("readContext — DCF");

h.test("recognises the review screen and takes the caseId from the path", function () {
  var m = at("https://polaris-qa-notprod.cps.gov.uk/dcf/review/124253/36ef2b44-14eb-4f82-95ee-21f0df1a6ae2?wid=MASTER");
  h.assertEqual(m.readContext(), { app: "DCF", screen: "review", caseId: "124253", kind: "CASE_REVIEW" });
  h.assertEqual(m.sectionIdForContext(m.readContext()), "124253:CASE_REVIEW");
});

h.describe("readContext — CMS Modern");

h.test("takes the caseId from the HASH, which never reaches the server", function () {
  var m = at("https://polaris-qa-notprod.cps.gov.uk/viewer/landing#/case-summary/2148456/f3faa37d-986c-45a7-833d-0abe36f125f2?wid=MASTER");
  h.assertEqual(m.readContext(), { app: "CMS Modern", screen: "case-summary", caseId: "2148456", kind: "CASE" });
  h.assertEqual(m.sectionIdForContext(m.readContext()), "2148456:CASE");
});

h.test("disclosure is the same case, so the same section", function () {
  var m = at("https://polaris-qa-notprod.cps.gov.uk/viewer/landing#/disclosure/124253");
  h.assertEqual(m.sectionIdForContext(m.readContext()), "124253:CASE");
});

h.test("a screen with no case yields no section — the landing page registers nothing", function () {
  var m = at("https://polaris-qa-notprod.cps.gov.uk/viewer/landing#/dashboard");
  h.assertEqual(m.readContext().caseId, null);
  h.assertEqual(m.sectionIdForContext(m.readContext()), null);
});

h.test("bare landing, before the router has run", function () {
  var m = at("https://polaris-qa-notprod.cps.gov.uk/viewer/landing");
  h.assertEqual(m.readContext(), { app: "CMS Modern", screen: "landing", caseId: null, kind: null });
});

h.describe("readContext — anywhere else");

h.test("Classic is not ours — it has its own client", function () {
  var m = at("https://polaris-qa-notprod.cps.gov.uk/CMS.24.0.01/Case/uacdCaseDetails.aspx?intCaseID=124253");
  h.assertEqual(m.readContext(), { app: null, screen: null, caseId: null, kind: null });
});

h.describe("resolveJsonpBase");

h.test("uses our own script origin — unproxied, a relative path would hit the CMS host", function () {
  var win = h.fakeWindow({ pathname: "/viewer/landing", hash: "" });
  var doc = h.fakeDocument([
    { src: "https://cms.example/some/other.js" },
    { src: "https://polaris.example/global-components/test/cms-presence-client.js" }
  ]);
  var m = h.load(["common/presence-sections.js", "common/presence-origin.js", "modern/context.js"], ["resolveJsonpBase"], { window: win, document: doc });
  h.assertEqual(m.resolveJsonpBase("/global-components/presence-jsonp"), "https://polaris.example/global-components/presence-jsonp");
});

h.test("falls back to the relative path when our tag cannot be found", function () {
  var win = h.fakeWindow({ pathname: "/viewer/landing", hash: "" });
  var doc = h.fakeDocument([{ src: "https://cms.example/other.js" }]);
  var m = h.load(["common/presence-sections.js", "common/presence-origin.js", "modern/context.js"], ["resolveJsonpBase"], { window: win, document: doc });
  h.assertEqual(m.resolveJsonpBase("/global-components/presence-jsonp"), "/global-components/presence-jsonp");
});

h.summarise();
