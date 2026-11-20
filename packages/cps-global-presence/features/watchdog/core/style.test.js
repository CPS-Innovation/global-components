/* Unit tests for features/watchdog/core/style.js
 *
 * The web banner takes its colour from govuk-frontend; the legacy clients take it
 * from CCPStyle. These tests are what keeps the three UIs one colour: they fail if
 * CCPStyle stops matching govuk-frontend's blue, or if the web banner stops using it.
 */
var fs = require("fs");
var path = require("path");
var h = require("../../../test-harness");

var CCPStyle = h.load(["features/watchdog/core/style.js"], ["CCPStyle"]).CCPStyle;

// govuk-frontend is a dependency of the web components, not of this package, so it
// is resolved from there: the same copy the web banner is built with.
var WEB = path.join(__dirname, "../../../../cps-global-components");
var GOVUK = path.dirname(require.resolve("govuk-frontend/package.json", { paths: [WEB] }));
var PALETTE = path.join(GOVUK, "dist/govuk/settings/_colours-palette.scss");
var BANNER_SCSS = path.join(WEB, "src/components/cps-global-pinned-notification/cps-global-pinned-notification.scss");

h.describe("CCPStyle.STRIPE_COLOUR");

h.test("is govuk-frontend's blue, the colour the web banner is built with", function () {
  var match = /"blue":\s*(#[0-9a-fA-F]{3,6})/.exec(fs.readFileSync(PALETTE, "utf8"));
  h.assertTrue(!!match, "found the blue in " + PALETTE);
  h.assertEqual(CCPStyle.STRIPE_COLOUR.toLowerCase(), match[1].toLowerCase());
});

h.test("is the colour the web banner uses", function () {
  var scss = fs.readFileSync(BANNER_SCSS, "utf8");
  h.assertTrue(/background-color:\s*govuk-colour\("blue"\)/.test(scss), "web banner background is govuk-colour(\"blue\")");
  h.assertTrue(/border-color:\s*govuk-colour\("blue"\)/.test(scss), "web banner border is govuk-colour(\"blue\")");
});
