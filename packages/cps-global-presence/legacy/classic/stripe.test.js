/* Unit tests for legacy/classic/stripe.js — the footer arithmetic, because getting
 * it wrong resizes someone else's application. The words are tested in
 * core/view.test.js; the rendering is exercised in CMS, where the document mode is
 * the thing under test.
 */
var h = require("../../test-harness");

var m = h.load(["legacy/classic/dom.js", "legacy/classic/stripe.js"], ["presenceBaseHeightFromRow", "presenceRowsWith"]);

h.describe("the footer baseline");

h.test("is the row's own pixel count when it has one", function () {
  h.assertEqual(m.presenceBaseHeightFromRow("40", 0), 40);
  h.assertEqual(m.presenceBaseHeightFromRow("  40  ", 0), 40);
});

// A proportion is not a pixel count, so the measured height is used instead — and
// presencePrepareFooterResize keeps the ORIGINAL row text, so removing the stripe
// restores the proportion rather than freezing it at today's pixels.
h.test("is the measured height when the row is a proportion", function () {
  h.assertEqual(m.presenceBaseHeightFromRow("15%", 62), 62);
  h.assertEqual(m.presenceBaseHeightFromRow("*", 62), 62);
});

h.test("refuses a proportion we could not measure", function () {
  h.assertEqual(m.presenceBaseHeightFromRow("15%", 0), -1);
});

// -1 means "leave this frameset alone entirely", which is the right answer for a
// frameset that is not the one we were written against.
h.test("refuses a row specification it does not understand", function () {
  h.assertEqual(m.presenceBaseHeightFromRow("40px", 62), -1);
  h.assertEqual(m.presenceBaseHeightFromRow("", 62), -1);
  h.assertEqual(m.presenceBaseHeightFromRow("auto", 62), -1);
});

h.describe("writing one frameset row");

h.test("replaces only the row it was given", function () {
  h.assertEqual(m.presenceRowsWith("28,*,30,40", 3, "63"), "28,*,30,63");
});

// "" is the caller's signal not to write at all: an idempotent render must not
// touch the frameset on every poll.
h.test("declines when the row already says that", function () {
  h.assertEqual(m.presenceRowsWith("28,*,30,63", 3, "63"), "");
});

h.test("declines on a frameset with fewer rows than we expect", function () {
  h.assertEqual(m.presenceRowsWith("28,*,30", 3, "63"), "");
  h.assertEqual(m.presenceRowsWith("", 3, "63"), "");
});

h.summarise();
