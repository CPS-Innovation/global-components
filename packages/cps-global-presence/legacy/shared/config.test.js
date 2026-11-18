/* Unit tests for legacy/shared/config.js — the deploy-time settings.
 *
 * The file is one line of code, so these are about the contract with CI: the
 * marker is there exactly once, an unbaked build reads as {}, and a baked one
 * reads as the object CI substituted.
 */
var fs = require("fs");
var path = require("path");
var h = require("../../test-harness");

var MARKER = "/*@@CCP_CONFIG@@*/ {}";
var SOURCE = fs.readFileSync(path.join(__dirname, "config.js"), "utf8");

// What CI does: swap the marker for the environment's LEGACY_UI as JSON.
function baked(legacyUi) {
  return SOURCE.split(MARKER).join(JSON.stringify(legacyUi));
}

function run(src) {
  return new Function(src + "\n; return CCP_CONFIG;")();
}

h.describe("CCP_CONFIG");

h.test("carries the CI marker exactly once", function () {
  h.assertEqual(SOURCE.split(MARKER).length - 1, 1);
});

h.test("unbaked, it is an empty object, so every named group gate fails closed", function () {
  var m = h.load(["legacy/shared/config.js"], ["CCP_CONFIG"]);
  h.assertEqual(m.CCP_CONFIG, {});
});

h.test("baked, it is the object CI substituted", function () {
  var ui = { groups: { CASE_PRESENCE_SHOW_UI: "1e5874e3-1c88-4506-8b9f-4f469acc1a42" } };
  h.assertEqual(run(baked(ui)), ui);
});

h.test("an empty LEGACY_UI bakes to the same as unbaked", function () {
  h.assertEqual(run(baked({})), {});
});

h.test("both legacy bundles load it", function () {
  ["classic", "modern"].forEach(function (name) {
    h.assertTrue(h.bundle(name).indexOf("legacy/shared/config.js") !== -1, name);
  });
});
