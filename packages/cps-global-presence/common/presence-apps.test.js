/* Unit tests for common/presence-apps.js
 *
 * The table this covers is the reason the client code is shared at all: Classic,
 * Modern/DCF and the web components must translate the API's vocabulary the same
 * way, so it is written down once.
 */
var h = require("../test-harness");

var loaded = h.load(["common/presence-apps.js"], ["CCPApps"]);
var CCPApps = loaded.CCPApps;

h.describe("CCPApps.displayName");

h.test("maps the backend's vocabulary to what users call the product", function () {
  h.assertEqual(CCPApps.displayName("Work Management App"), "RCMS");
  h.assertEqual(CCPApps.displayName("Case Review App"), "RCMS");
  h.assertEqual(CCPApps.displayName("Casework App"), "RCMS");
});

// The absence of a mapping is the normal case, not an oversight: Classic and
// Modern are different applications to users and already carry the right names.
h.test("passes through a name that needs no mapping", function () {
  h.assertEqual(CCPApps.displayName("CMS Classic"), "CMS Classic");
  h.assertEqual(CCPApps.displayName("CMS Modern"), "CMS Modern");
  h.assertEqual(CCPApps.displayName("Something New"), "Something New");
});

h.test("is empty when the API sends no application, so the clause can be omitted", function () {
  h.assertEqual(CCPApps.displayName(undefined), "");
  h.assertEqual(CCPApps.displayName(""), "");
});
