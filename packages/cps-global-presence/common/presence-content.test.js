/* Unit tests for common/presence-content.js — THE WORDS.
 *
 * These are the sentences every presence surface shows, so this file is the place
 * the wording is agreed once. The per-client tests (modern/bar.test.js,
 * classic/stripe.test.js, and the web components' own specs) now assert that each
 * client CALLS this module; what the words actually are is settled here.
 */
var h = require("../test-harness");

var CCPContent = h.load(["common/presence-content.js"], ["CCPContent"]).CCPContent;

h.describe("CCPContent.summary");

// The production wording: a client that filters the reader out reports only others.
h.test("counts other people when the reader is not in the list", function () {
  h.assertEqual(CCPContent.summary(1, false), "1 other person is working on this case");
  h.assertEqual(CCPContent.summary(2, false), "2 other people are working on this case");
  h.assertEqual(CCPContent.summary(7, false), "7 other people are working on this case");
});

// "2 other people" above a list naming you as one of them is a lie, so "other" goes.
h.test("drops 'other' when the reader is one of the people counted", function () {
  h.assertEqual(CCPContent.summary(1, true), "1 person is working on this case");
  h.assertEqual(CCPContent.summary(3, true), "3 people are working on this case");
});

h.test("agrees the verb with the count", function () {
  h.assertEqual(CCPContent.summary(1, false).indexOf(" person is ") !== -1, true);
  h.assertEqual(CCPContent.summary(2, false).indexOf(" people are ") !== -1, true);
});

h.describe("CCPContent.summary and the lock");

// The lock leads, presence follows as a subordinate clause — the order a reader
// needs to decide what to do next.
h.test("puts the lock first and presence second", function () {
  h.assertEqual(
    CCPContent.summary(2, false, true),
    "This case is locked, and 2 other people are currently working on this case"
  );
  h.assertEqual(
    CCPContent.summary(1, false, true),
    "This case is locked, and 1 other person is currently working on this case"
  );
});

// "currently" earns its place only in the compound sentence, where it separates the
// standing state of the case from who happens to be on it right now.
h.test("adds 'currently' only when the lock is in the sentence", function () {
  h.assertEqual(CCPContent.summary(2, false).indexOf("currently"), -1);
  h.assertEqual(CCPContent.summary(2, false, true).indexOf("currently") !== -1, true);
});

h.test("says only the lock when presence has nobody to report", function () {
  h.assertEqual(CCPContent.summary(0, false, true), "This case is locked");
});

// THE LEGACY CLIENTS' CASE. Neither can read the lock, so both omit the argument.
// What they get must be the web component's unlocked sentence, not a reduced one.
h.test("an absent lock reads the same as an unlocked one", function () {
  h.assertEqual(CCPContent.summary(2, false), CCPContent.summary(2, false, false));
  h.assertEqual(CCPContent.summary(2, false, undefined), CCPContent.summary(2, false, false));
});

h.describe("CCPContent.where");

function format(t) {
  return t ? "3.38pm" : "";
}

h.test("names one application and when they arrived in it", function () {
  h.assertEqual(
    CCPContent.where([{ appDisplayName: "RCMS", timeEntered: "t" }], format),
    "RCMS since 3.38pm"
  );
});

h.test("joins several applications", function () {
  h.assertEqual(
    CCPContent.where(
      [
        { appDisplayName: "RCMS", timeEntered: "t" },
        { appDisplayName: "CMS Classic", timeEntered: undefined }
      ],
      format
    ),
    "RCMS since 3.38pm, CMS Classic"
  );
});

// The API can report an application with no time. Naming it without a time says
// less but nothing false; inventing a time would say something false.
h.test("names an application the API gave no time for", function () {
  h.assertEqual(CCPContent.where([{ appDisplayName: "RCMS" }], format), "RCMS");
});

// The widening in esm.d.ts rests on this: the two real formatters disagree about
// how to spell "nothing usable" — CCPJoined.format returns "", the web components'
// formatJoined returns undefined — and neither should have to convert for the other.
h.test("treats both spellings of 'no time' alike", function () {
  var apps = [{ appDisplayName: "RCMS", timeEntered: "t" }];
  var empty = CCPContent.where(apps, function () {
    return "";
  });
  var undef = CCPContent.where(apps, function () {
    return undefined;
  });
  h.assertEqual(empty, "RCMS");
  h.assertEqual(undef, "RCMS");
});

h.test("says nothing when there are no applications", function () {
  h.assertEqual(CCPContent.where([], format), "");
  h.assertEqual(CCPContent.where(undefined, format), "");
});

h.describe("CCPContent.personLine");

h.test("names the section and where they are", function () {
  h.assertEqual(
    CCPContent.personLine("A Name", "the case review", "RCMS since 3.38pm"),
    "A Name is in the case review — RCMS since 3.38pm."
  );
});

h.test("drops the clause it has nothing for", function () {
  h.assertEqual(CCPContent.personLine("A Name", "a defendant", ""), "A Name is in a defendant.");
  h.assertEqual(CCPContent.personLine("A Name", "", "RCMS since 3.38pm"), "A Name — RCMS since 3.38pm.");
});

// The fallback is for a person whose sections AND applications are both unknown —
// not for one we merely have no time for.
h.test("says something sensible when we know nothing but the name", function () {
  h.assertEqual(CCPContent.personLine("A Name", "", ""), "A Name is on this case.");
});

// The trailing full stop is the drift the shared module exists to prevent: Modern
// had quietly stopped ending the sentence while its comment claimed parity with the
// web component. Every branch ends it.
h.test("ends every sentence", function () {
  var cases = [
    CCPContent.personLine("A Name", "the case", "RCMS since 3.38pm"),
    CCPContent.personLine("A Name", "the case", ""),
    CCPContent.personLine("A Name", "", "RCMS since 3.38pm"),
    CCPContent.personLine("A Name", "", "")
  ];
  var i;
  for (i = 0; i < cases.length; i++) {
    h.assertEqual(cases[i].charAt(cases[i].length - 1), ".");
  }
});

h.describe("the toggle");

h.test("offers the action, not the state", function () {
  h.assertEqual(CCPContent.detailsToggle(false), "Show details");
  h.assertEqual(CCPContent.detailsToggle(true), "Hide details");
});

h.describe("the all-clear");

// Only the web component announces this: it holds a live region, so a reader who
// was told someone was here must be told when that stopped being true. The legacy
// clients remove their stripe instead, which is why this is a constant and not a
// function of a count.
h.test("says the banner has gone away, not that it is empty", function () {
  h.assertEqual(CCPContent.ALL_CLEAR, "Nobody else is working on this case now");
});

h.summarise();
