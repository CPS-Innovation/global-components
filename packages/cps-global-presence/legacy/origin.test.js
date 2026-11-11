/* Unit tests for legacy/origin.js
 *
 * The case that matters: a script served from one host, injected into a page on
 * another. A relative URL would resolve against the PAGE — the wrong box — so the
 * origin of the host that owns our endpoints is baked in at deploy time and these
 * assert resolve() uses it.
 *
 * Until 2026-11-04 the origin was derived in the browser instead, by finding our
 * own <script> tag by a filename marker; those tests went when the marker did.
 * The behaviour they pinned — "fall back to the relative path" — survives as the
 * IMPL_ORIGIN = "" case below, which is the committed default and what every
 * same-host deploy ships.
 */
var h = require("../test-harness");

function withOrigin(origin) {
  var o = h.load(["legacy/origin.js"], ["CCPOrigin"], {}).CCPOrigin;
  o.IMPL_ORIGIN = origin;
  return o;
}

var PATH = "/global-components/presence-jsonp";

h.describe("CCPOrigin.IMPL_ORIGIN");

h.test("ships as empty — the correct value for a same-host deploy, and for all of CI", function () {
  var o = h.load(["legacy/origin.js"], ["CCPOrigin"], {}).CCPOrigin;
  h.assertEqual(o.IMPL_ORIGIN, "");
});

h.describe("CCPOrigin.resolve");

h.test("builds an absolute URL on the host that owns our endpoints", function () {
  h.assertEqual(
    withOrigin("https://polaris-uat-notprod.cps.gov.uk").resolve(PATH),
    "https://polaris-uat-notprod.cps.gov.uk" + PATH
  );
});

h.test("returns the relative path unchanged when we are same-origin with the page", function () {
  h.assertEqual(withOrigin("").resolve(PATH), PATH);
});

h.test("keeps a non-default port — a mitm rig serves from 127.0.0.1:8080", function () {
  h.assertEqual(withOrigin("https://127.0.0.1:8080").resolve(PATH), "https://127.0.0.1:8080" + PATH);
});

h.test("works for any of our endpoints, not just the JSONP one", function () {
  h.assertEqual(
    withOrigin("https://polaris-uat-notprod.cps.gov.uk").resolve("/polaris-presence"),
    "https://polaris-uat-notprod.cps.gov.uk/polaris-presence"
  );
});

h.summarise();
