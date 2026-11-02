/* Unit tests for classic/stripe.js — the words, and the footer arithmetic.
 *
 * Two things in this file are worth pinning and one is not.
 *
 * THE WORDS, because they are what a caseworker reads, and because the stripe's
 * visibility is decided by them: main.js shows the stripe when the detail text is
 * non-empty, so "nobody is here" has to come back as "" and not as a heading with
 * nothing under it. These went untested while they lived in banner.js.
 *
 * THE FOOTER ARITHMETIC, because getting it wrong resizes someone else's
 * application. Both functions were made pure for exactly that reason, and the
 * cases below are the ones a frameset can actually present: pixels, a proportion,
 * and a row specification we do not recognise — which must mean "don't touch it".
 *
 * NOT the rendering. A fake document would only prove the fake works; the stripe
 * is exercised in CMS, where the document mode is the thing under test. Same
 * reasoning as modern-3/bar.test.js.
 */
var h = require("../../test-harness");

var m = h.load(
  ["common/presence-environment.js", "legacy-apps/classic/dom.js", "legacy-apps/classic/stripe.js"],
  [
    "CCPEnvironment",
    "presenceBuildDetails",
    "presenceCountMembers",
    "presenceSectionLabel",
    "presenceFormatJoined",
    "presenceStripeSummary",
    "presenceBaseHeightFromRow",
    "presenceRowsWith"
  ]
);

var CASE = "2121407";

function member(email, app, joinedAt) {
  return { userEmail: email, sourceApplication: app, joinedAt: joinedAt };
}

// CCPRoster.sections() shape: sectionId -> { caseId, kind, members }.
function sections(entries) {
  var map = {};
  var i;
  for (i = 0; i < entries.length; i++) {
    map[entries[i].id] = {
      caseId: entries[i].caseId,
      kind: entries[i].kind,
      members: entries[i].members
    };
  }
  return map;
}

h.describe("the detail text");

h.test("heads each block with the section name, from the wire kind the roster holds", function () {
  var text = m.presenceBuildDetails(
    CASE,
    sections([
      {
        id: CASE + ":" + m.CCPEnvironment.suffixKind("CASE_REVIEW"),
        caseId: CASE,
        kind: m.CCPEnvironment.suffixKind("CASE_REVIEW"),
        members: [member("ann@cps.gov.uk", "RCMS")]
      }
    ])
  );
  h.assertTrue(text.indexOf("working on Case Review:") !== -1, text);
});

h.test("groups the roster by section, naming the application and when they arrived", function () {
  var text = m.presenceBuildDetails(
    CASE,
    sections([
      {
        id: CASE + ":CASE_REVIEW",
        caseId: CASE,
        kind: "CASE_REVIEW",
        members: [member("ann@cps.gov.uk", "RCMS", "2026-08-21T08:11:53.226+00:00")]
      }
    ])
  );
  h.assertEqual(
    text,
    "Who's working where:\n" +
      "Currently these users are working on Case Review:\n" +
      "ann@cps.gov.uk on RCMS - joined 21 Aug 2026 08:11"
  );
});

h.test("separates sections with a blank line", function () {
  var text = m.presenceBuildDetails(
    CASE,
    sections([
      { id: CASE + ":CASE", caseId: CASE, kind: "CASE", members: [member("ann@cps.gov.uk", "RCMS")] },
      {
        id: CASE + ":DEFENDANT:88112",
        caseId: CASE,
        kind: "DEFENDANT",
        members: [member("bob@cps.gov.uk", "CMS Classic")]
      }
    ])
  );
  h.assertTrue(text.indexOf("\n\nCurrently these users are working on Defendant:") !== -1, text);
});

// An empty section is a real notification — everyone left, and the version bumped
// to say so. Rendering its heading would claim people are there.
h.test("omits a section nobody is in", function () {
  var text = m.presenceBuildDetails(
    CASE,
    sections([
      { id: CASE + ":CASE", caseId: CASE, kind: "CASE", members: [member("ann@cps.gov.uk", "RCMS")] },
      { id: CASE + ":CASE_REVIEW", caseId: CASE, kind: "CASE_REVIEW", members: [] }
    ])
  );
  h.assertEqual(text.indexOf("Case Review"), -1, text);
});

// "" is what main.js reads as "take the stripe away", so this is the visibility
// rule and not just a formatting detail.
h.test("is empty when no section of the case has anybody", function () {
  h.assertEqual(
    m.presenceBuildDetails(CASE, sections([{ id: CASE + ":CASE", caseId: CASE, kind: "CASE", members: [] }])),
    ""
  );
});

h.test("ignores sections belonging to another case", function () {
  var text = m.presenceBuildDetails(
    CASE,
    sections([{ id: "999:CASE", caseId: "999", kind: "CASE", members: [member("ann@cps.gov.uk", "RCMS")] }])
  );
  h.assertEqual(text, "");
});

h.test("says unknown rather than nothing when the API names no application", function () {
  var text = m.presenceBuildDetails(
    CASE,
    sections([{ id: CASE + ":CASE", caseId: CASE, kind: "CASE", members: [member("ann@cps.gov.uk", "")] }])
  );
  h.assertTrue(text.indexOf("ann@cps.gov.uk on unknown") !== -1, text);
});

h.describe("the head-count");

// The stripe counts PEOPLE, not sections: one person in two sections of a case is
// listed twice in the detail, so counting them twice is what matches.
h.test("totals every section of the case", function () {
  var map = sections([
    { id: CASE + ":CASE", caseId: CASE, kind: "CASE", members: [member("ann@cps.gov.uk", "RCMS")] },
    {
      id: CASE + ":CASE_REVIEW",
      caseId: CASE,
      kind: "CASE_REVIEW",
      members: [member("ann@cps.gov.uk", "RCMS"), member("bob@cps.gov.uk", "CMS Classic")]
    },
    { id: "999:CASE", caseId: "999", kind: "CASE", members: [member("cat@cps.gov.uk", "RCMS")] }
  ]);
  h.assertEqual(m.presenceCountMembers(CASE, map), 3);
});

h.test("is zero when there is nobody, and does not count an empty section", function () {
  h.assertEqual(
    m.presenceCountMembers(CASE, sections([{ id: CASE + ":CASE", caseId: CASE, kind: "CASE", members: [] }])),
    0
  );
});

h.describe("the collapsed summary");

h.test("states the head-count", function () {
  h.assertEqual(m.presenceStripeSummary({ text: "...", count: 3 }), "3 users currently working on the case");
});

// Carried over from the deployed client deliberately: this says "1 users". Fixing
// the wording is a change to what a caseworker reads, so it is the user's call and
// not a side effect of the port.
h.test("uses the same plural for one person as the deployed client does", function () {
  h.assertEqual(m.presenceStripeSummary({ text: "...", count: 1 }), "1 users currently working on the case");
});

h.test("falls back to the detail text rather than rendering an empty red bar", function () {
  h.assertEqual(m.presenceStripeSummary({ text: "Who's working where:" }), "Who's working where:");
});

h.test("is empty when there is no state at all", function () {
  h.assertEqual(m.presenceStripeSummary(null), "");
});

h.describe("section labels");

h.test("name the sections a caseworker recognises", function () {
  h.assertEqual(m.presenceSectionLabel("CASE"), "Case");
  h.assertEqual(m.presenceSectionLabel("CASE_REVIEW"), "Case Review");
  h.assertEqual(m.presenceSectionLabel("VICTIM_WITNESS"), "Witness/Victim");
  h.assertEqual(m.presenceSectionLabel("DEFENDANT"), "Defendant");
});

// A kind we do not know is shown as itself: the API can gain sections before this
// client does, and the roster is still worth reading.
h.test("show an unknown kind verbatim, and never render nothing", function () {
  h.assertEqual(m.presenceSectionLabel("WITNESS_STATEMENT"), "WITNESS_STATEMENT");
  h.assertEqual(m.presenceSectionLabel(""), "Section");
  h.assertEqual(m.presenceSectionLabel(null), "Section");
});

// THE KINDS REACHING THIS FUNCTION COME OFF THE WIRE, so they carry the CIN
// suffix while the cases in the function are the documented kinds. Without
// baseKind every heading in the details panel would read "working on CASE_CIN3".
h.test("name the section when the kind arrives suffixed, as the roster holds it", function () {
  h.assertEqual(m.presenceSectionLabel(m.CCPEnvironment.suffixKind("CASE")), "Case");
  h.assertEqual(m.presenceSectionLabel(m.CCPEnvironment.suffixKind("VICTIM_WITNESS")), "Witness/Victim");
});

// Another instance's suffix is NOT ours to strip. It should be impossible, and if
// it ever arrives it should look like the oddity it is rather than be normalised
// into one of our own sections.
h.test("leave another instance's suffix alone", function () {
  h.assertEqual(m.presenceSectionLabel("CASE_CIN9"), "CASE_CIN9");
});

h.describe("joined timestamps");

// Read out of the string, not parsed: document mode 5 cannot Date.parse an ISO
// string reliably, so the wall-clock as sent is what gets shown.
h.test("are formatted from the string as sent", function () {
  h.assertEqual(m.presenceFormatJoined("2026-08-21T08:11:53.226+00:00"), "21 Aug 2026 08:11");
  h.assertEqual(m.presenceFormatJoined("2026-01-05 00:04"), "5 Jan 2026 00:04");
});

h.test("are omitted rather than guessed at when the field is not a timestamp", function () {
  h.assertEqual(m.presenceFormatJoined(""), "");
  h.assertEqual(m.presenceFormatJoined(null), "");
  h.assertEqual(m.presenceFormatJoined("yesterday"), "");
  h.assertEqual(m.presenceFormatJoined(1756000000000), "");
});

h.test("keep a month number we cannot name", function () {
  h.assertEqual(m.presenceFormatJoined("2026-13-21T08:11:00+00:00"), "21 13 2026 08:11");
});

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
