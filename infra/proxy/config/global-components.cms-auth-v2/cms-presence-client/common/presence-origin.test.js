/* Unit tests for common/presence-origin.js
 *
 * The case that matters: a script served from one host, injected into a page on
 * another. Relative URLs would resolve against the page — the wrong box — so these
 * assert we take the SCRIPT's origin instead.
 */
var h = require("../test-harness");

function withScripts(tags) {
  return h.load(["common/presence-origin.js"], ["CCPOrigin"], { document: h.fakeDocument(tags) }).CCPOrigin;
}

var MARKER = "cms-presence-client.js";
var PATH = "/global-components/presence-jsonp";

h.describe("CCPOrigin.scriptOrigin");

h.test("finds our own tag among the host page's scripts", function () {
  var o = withScripts([
    { src: "https://cms.example/some/vendor.js" },
    { src: "https://polaris-uat-notprod.cps.gov.uk/global-components/uat/cms-presence-client.js" },
    { src: "https://cms.example/another.js" }
  ]);
  h.assertEqual(o.scriptOrigin(MARKER), "https://polaris-uat-notprod.cps.gov.uk");
});

h.test("ignores query strings and paths, keeping only the origin", function () {
  var o = withScripts([{ src: "https://polaris-uat-notprod.cps.gov.uk/a/b/cms-presence-client.js?v=3" }]);
  h.assertEqual(o.scriptOrigin(MARKER), "https://polaris-uat-notprod.cps.gov.uk");
});

h.test("keeps a non-default port — a mitm rig serves from 127.0.0.1:8080", function () {
  var o = withScripts([{ src: "https://127.0.0.1:8080/global-components/test/cms-presence-client.js" }]);
  h.assertEqual(o.scriptOrigin(MARKER), "https://127.0.0.1:8080");
});

h.test("returns empty when our tag is not there", function () {
  h.assertEqual(withScripts([{ src: "https://cms.example/other.js" }]).scriptOrigin(MARKER), "");
  h.assertEqual(withScripts([]).scriptOrigin(MARKER), "");
});

h.test("ignores inline scripts, which have no src", function () {
  var o = withScripts([{ src: "" }, { src: "https://polaris-uat-notprod.cps.gov.uk/x/cms-presence-client.js" }]);
  h.assertEqual(o.scriptOrigin(MARKER), "https://polaris-uat-notprod.cps.gov.uk");
});

h.describe("CCPOrigin.resolve");

h.test("builds an absolute URL on the host that served us", function () {
  var o = withScripts([{ src: "https://polaris-uat-notprod.cps.gov.uk/global-components/uat/cms-presence-client.js" }]);
  h.assertEqual(o.resolve(MARKER, PATH), "https://polaris-uat-notprod.cps.gov.uk" + PATH);
});

h.test("falls back to the relative path — correct when page and endpoints share an origin", function () {
  h.assertEqual(withScripts([]).resolve(MARKER, PATH), PATH);
});

h.test("works for any of our endpoints, not just the JSONP one", function () {
  var o = withScripts([{ src: "https://polaris-uat-notprod.cps.gov.uk/global-components/uat/cms-auth-v2-client.js" }]);
  h.assertEqual(o.resolve("cms-auth-v2-client.js", "/polaris-v2"), "https://polaris-uat-notprod.cps.gov.uk/polaris-v2");
});

h.summarise();
