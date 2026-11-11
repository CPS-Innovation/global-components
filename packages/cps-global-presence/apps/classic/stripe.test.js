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
 * reasoning as modern/bar.test.js.
 */
var h = require("../../test-harness");

var m = h.load(
  [
    "core/environment.js",
    "core/apps.js",
    "core/section-names.js",
    "core/joined.js",
    "core/people.js",
    "core/content.js",
    "apps/classic/dom.js",
    "apps/classic/stripe.js"
  ],
  [
    "CCPEnvironment",
    "CCPPeople",
    "presenceBuildDetails",
    "presenceStripeSummary",
    "presenceBaseHeightFromRow",
    "presenceRowsWith"
  ]
);

var CASE = "2121407";

// WHICH CMS INSTANCE. The kinds reaching these functions come off the WIRE, so
// they carry its suffix; the value is discovered at runtime now rather than
// hardcoded in CCPEnvironment, so the suite establishes it -- without this the
// suffix would be "" and every assertion below would pass vacuously.
m.CCPEnvironment.adopt("CIN3");

function member(email, app, joinedAt) {
  return { userEmail: email, sourceApplication: app, joinedAt: joinedAt };
}

// A member record as CCPRoster.members() hands it to the shared collapse: the
// section comes along, already debased of its CIN suffix, and isCurrent says
// whether it is the one in front of the reader. isCurrent is false throughout
// here — the definite forms ("this witness or victim") are covered where the
// naming table itself is tested.
// LOCAL wall clock, today, as the API would express it. CCPJoined.format renders
// in the reader's zone and omits the date for today, so this keeps the expectations
// below to a bare time and makes them the same in BST and GMT. An absolute UTC
// string would read as 8.11am in winter and 9.11am in summer.
function todayAt(hh, mi) {
  var now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mi).toISOString();
}

function memberIn(email, app, joinedAt, kind) {
  return {
    userEmail: email,
    sourceApplication: app,
    joinedAt: joinedAt,
    sections: [{ kind: kind, isCurrent: false }]
  };
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

// COLLAPSED BY THE CALLER, so these build their input the way main.js does — through
// the shared reduction — rather than hand-rolling its output. That makes the wiring
// part of what is under test: a change to collapse's shape shows up here.
function people(members, viewer) {
  return m.CCPPeople.collapse(members, viewer);
}

h.test("one sentence per person, in the web components' words", function () {
  var text = m.presenceBuildDetails(
    people([memberIn("ann@cps.gov.uk", "RCMS", todayAt(8, 11), "CASE_REVIEW")])
  );
  h.assertEqual(text, "ann@cps.gov.uk is in the case review — RCMS since 8.11am.");
});

// THE HEADINGS ARE GONE, and that is the point of the change rather than a detail
// of it. This used to read "Who's working where:" over "Currently these users are
// working on Case Review:" — Classic's own register, matching neither other client.
// The section is now named inside the sentence, where the web component puts it.
h.test("no longer heads blocks with a section name", function () {
  var text = m.presenceBuildDetails(
    people([memberIn("ann@cps.gov.uk", "RCMS", "", "CASE_REVIEW")])
  );
  h.assertEqual(text.indexOf("Who's working where"), -1, text);
  h.assertEqual(text.indexOf("Currently these users"), -1, text);
  h.assertEqual(text.indexOf("Case Review"), -1, "the old label register is gone: " + text);
});

// One line each, newline separated — the stripe renders plain text.
h.test("one line per person", function () {
  var text = m.presenceBuildDetails(
    people([
      memberIn("ann@cps.gov.uk", "RCMS", "", "CASE"),
      memberIn("bob@cps.gov.uk", "CMS Classic", "", "DEFENDANT")
    ])
  );
  h.assertEqual(text.split("\n").length, 2, text);
});

// The same person in two sections of a case is ONE line naming both — the old
// client listed them once per section, because it never collapsed.
h.test("a person in two sections is one line, naming both", function () {
  var text = m.presenceBuildDetails(
    people([
      memberIn("ann@cps.gov.uk", "RCMS", "", "CASE"),
      memberIn("ann@cps.gov.uk", "RCMS", "", "CASE_REVIEW")
    ])
  );
  h.assertEqual(text.split("\n").length, 1, text);
  h.assertTrue(text.indexOf("the case") !== -1, text);
  h.assertTrue(text.indexOf("the case review") !== -1, text);
});

// "" is what main.js reads as "take the stripe away", so this is the visibility
// rule and not a formatting detail.
h.test("is empty when nobody is on the case", function () {
  h.assertEqual(m.presenceBuildDetails([]), "");
  h.assertEqual(m.presenceBuildDetails(null), "");
});

// The old client printed "on unknown" here. The web component says nothing about
// an application it was told nothing about, and the person is still reported.
h.test("says nothing about an application the API did not name", function () {
  var text = m.presenceBuildDetails(people([memberIn("ann@cps.gov.uk", "", "", "CASE")]));
  h.assertEqual(text.indexOf("unknown"), -1, text);
  h.assertTrue(text.indexOf("ann@cps.gov.uk") !== -1, text);
});

h.test("marks the reader, so the summary's wording can be checked against it", function () {
  var text = m.presenceBuildDetails(
    people([memberIn("ann@cps.gov.uk", "RCMS", "", "CASE")], "ann@cps.gov.uk")
  );
  h.assertTrue(text.indexOf("(current user)") !== -1, text);
});

h.describe("the collapsed summary");

// IT USED TO SAY "3 users currently working on the case", and "1 users" for one.
// The test that pinned that said fixing it was "the user's call and not a side
// effect of the port" — the call has now been made: all three clients say what the
// web component says.
h.test("says what the web components say", function () {
  h.assertEqual(
    m.presenceStripeSummary({ text: "...", count: 3 }),
    "3 other people are working on this case"
  );
});

// The old wording's worst line: a reader alone on a case was told "1 users
// currently working on the case".
h.test("is grammatical for one person", function () {
  h.assertEqual(
    m.presenceStripeSummary({ text: "...", count: 1 }),
    "1 other person is working on this case"
  );
});

// "other" is a lie when the list below names the reader, so it goes.
h.test("drops \"other\" once the reader is one of them", function () {
  h.assertEqual(
    m.presenceStripeSummary({ text: "...", count: 3, includesSelf: true }),
    "3 people are working on this case"
  );
  h.assertEqual(
    m.presenceStripeSummary({ text: "...", count: 1, includesSelf: true }),
    "1 person is working on this case"
  );
});

// An unanswered whoami leaves includesSelf absent, and the reader is then counted
// among the others. One person too many is the safe direction; the opposite would
// hide a colleague.
h.test("an absent includesSelf reads as not-the-reader", function () {
  h.assertEqual(
    m.presenceStripeSummary({ text: "...", count: 2 }),
    "2 other people are working on this case"
  );
});

h.test("falls back to the detail text rather than rendering an empty red bar", function () {
  h.assertEqual(m.presenceStripeSummary({ text: "ann@cps.gov.uk is on this case." }), "ann@cps.gov.uk is on this case.");
});

h.test("is empty when there is no state at all", function () {
  h.assertEqual(m.presenceStripeSummary(null), "");
});

// SECTION LABELS AND JOINED TIMESTAMPS had their own describes here, covering
// presenceSectionLabel ("Case Review", "Witness/Victim") and presenceFormatJoined
// ("21 Aug 2026 08:11"). Both functions are gone, not moved: CCPSectionNames and
// CCPJoined said different things, and the shared versions won. Their behaviour is
// covered by core/section-names.test.js and core/joined.test.js.

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
