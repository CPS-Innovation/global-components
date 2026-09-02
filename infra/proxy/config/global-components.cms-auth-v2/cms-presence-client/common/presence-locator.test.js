/* Unit tests for common/presence-locator.js — identification only.
 *
 * No sessions, no network: a locator's whole job is to turn "where am I" into a
 * list of sections, and these prove the list is right — including the plural and
 * duplicate cases that the single-section locators used to get wrong by
 * construction.
 */
var h = require("../test-harness");

function load() {
  return h.load(["common/presence-sections.js", "common/presence-locator.js"], ["CCPLocator"]).CCPLocator;
}

var CCPLocator = load();

h.describe("CCPLocator.section");

h.test("case-wide kinds carry no subject and no trailing colon", function () {
  h.assertEqual(CCPLocator.section("2148456", "CASE").id, "2148456:CASE");
});

h.test("subject-scoped kinds append theirs", function () {
  var s = CCPLocator.section("2148456", "VICTIM_WITNESS", "98765");
  h.assertEqual(s.id, "2148456:VICTIM_WITNESS:98765");
  h.assertEqual(s.subjectId, "98765");
});

h.test("numbers are accepted and normalised — CMS hands out both", function () {
  var s = CCPLocator.section(2148456, "CASE", null);
  h.assertEqual(s.caseId, "2148456");
  h.assertEqual(s.subjectId, "");
});

h.test("no case means no section, so a detector can just return this", function () {
  h.assertEqual(CCPLocator.section("", "CASE"), null);
  h.assertEqual(CCPLocator.section("2148456", null), null);
});

h.test("the hint travels untouched — it is the app's business, not ours", function () {
  var hint = { popupFrame: "framePage" };
  h.assertEqual(CCPLocator.section("1", "CASE", null, hint).hint, hint);
});

h.describe("CCPLocator.urlDetector");

h.test("pulls the case out of the matching group", function () {
  var d = CCPLocator.urlDetector({ kind: "CASE_REVIEW", pattern: /\/dcf\/[^/]+\/(\d+)/ });
  h.assertEqual(d.detect("https://x.example/dcf/review/124253/guid?wid=MASTER").id, "124253:CASE_REVIEW");
});

h.test("takes a subject group when the section is subject-scoped", function () {
  var d = CCPLocator.urlDetector({
    kind: "DEFENDANT",
    pattern: /case\/(\d+)\/defendant\/(\d+)/,
    subjectIdGroup: 2
  });
  h.assertEqual(d.detect("https://x.example/case/55/defendant/77").id, "55:DEFENDANT:77");
});

h.test("a URL that does not match yields nothing", function () {
  var d = CCPLocator.urlDetector({ kind: "CASE", pattern: /\/viewer\/(\d+)/ });
  h.assertEqual(d.detect("https://x.example/somewhere/else"), null);
});

h.test("a non-URL scope yields nothing rather than throwing", function () {
  var d = CCPLocator.urlDetector({ kind: "CASE", pattern: /(\d+)/ });
  h.assertEqual(d.detect(null), null);
  h.assertEqual(d.detect({ frames: [] }), null);
});

h.describe("CCPLocator.createLocator");

function fixed(kind, sections) {
  return {
    kind: kind,
    detect: function () {
      return sections;
    }
  };
}

var CASE = CCPLocator.section("55", "CASE");
var WITNESS = CCPLocator.section("55", "VICTIM_WITNESS", "9");

h.test("collects from every detector, in order", function () {
  var locator = CCPLocator.createLocator([fixed("CASE", CASE), fixed("VW", WITNESS)]);
  h.assertEqual(locator.ids("scope"), ["55:CASE", "55:VICTIM_WITNESS:9"]);
});

h.test("a detector may return several sections at once", function () {
  var locator = CCPLocator.createLocator([fixed("many", [CASE, WITNESS])]);
  h.assertEqual(locator.ids("scope"), ["55:CASE", "55:VICTIM_WITNESS:9"]);
});

h.test("the same section found twice is reported once", function () {
  var locator = CCPLocator.createLocator([fixed("a", CASE), fixed("b", CASE)]);
  h.assertEqual(locator.ids("scope"), ["55:CASE"]);
});

h.test("detectors that find nothing contribute nothing", function () {
  var locator = CCPLocator.createLocator([fixed("none", null), fixed("case", CASE), fixed("empty", [])]);
  h.assertEqual(locator.ids("scope"), ["55:CASE"]);
});

h.test("a throwing detector is skipped, not fatal — Classic reads live CMS state", function () {
  var boom = {
    kind: "boom",
    detect: function () {
      throw new Error("frame went away mid-read");
    }
  };
  var locator = CCPLocator.createLocator([boom, fixed("case", CASE)]);
  h.assertEqual(locator.ids("scope"), ["55:CASE"]);
});

h.test("nothing active anywhere is an empty list, not null", function () {
  h.assertEqual(CCPLocator.createLocator([fixed("none", null)]).list("scope"), []);
});

h.test("list() keeps the whole section, not just the id", function () {
  var locator = CCPLocator.createLocator([fixed("case", CASE)]);
  h.assertEqual(locator.list("scope")[0].kind, "CASE");
  h.assertEqual(locator.list("scope")[0].caseId, "55");
});

h.summarise();
