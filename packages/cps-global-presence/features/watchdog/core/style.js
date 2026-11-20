/* features/watchdog/core/style.js — the presence stripe's look, for the two legacy clients.
 * SHARED, MODE 5 FLOOR.
 *
 * ONE COLOUR, WRITTEN ONCE. Classic's stripe and the Modern/DCF bar each carried
 * their own literal, and they drifted: #b10e1e in one, #ca3535 in the other, while
 * the web banner took a third route through govuk-frontend. Neither legacy client
 * can load that stylesheet, so the value lives here instead.
 *
 * GDS IS THE SOURCE OF TRUTH. The web banner uses govuk-colour("blue") directly,
 * and style.test.js fails if this value stops matching govuk-frontend's palette, or
 * if the web banner stops using that colour — so a govuk-frontend upgrade that
 * moves the blue breaks the build instead of quietly splitting the three UIs.
 */

var CCPStyle = {};

/** GDS blue, govuk-colour("blue"): the design team's choice (2026-11-20), replacing red. */
CCPStyle.STRIPE_COLOUR = "#1d70b8";
