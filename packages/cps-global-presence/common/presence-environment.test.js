/* Unit tests for common/presence-environment.js
 *
 * The CIN suffix is the difference between joining the room and being invisible in
 * it, and the failure is silent either way -- so the round trip is what matters:
 * what we put on the wire, and what we read back, must agree with the Classic
 * client and must leave the shared tables looking at plain kinds.
 */
var h = require("../test-harness");

var CCPEnvironment = h.load(["common/presence-environment.js"], ["CCPEnvironment"]).CCPEnvironment;

function withCin(value, body) {
  var previous = CCPEnvironment.CIN;
  CCPEnvironment.CIN = value;
  try {
    body();
  } finally {
    CCPEnvironment.CIN = previous;
  }
}

h.describe("CCPEnvironment.suffixKind");

h.test("puts the instance on the kind, matching the Classic client", function () {
  withCin("CIN3", function () {
    h.assertEqual(CCPEnvironment.suffixKind("CASE"), "CASE_CIN3");
    h.assertEqual(CCPEnvironment.suffixKind("VICTIM_WITNESS"), "VICTIM_WITNESS_CIN3");
  });
});

// sectionIdOf rebuilds an id from a snapshot whose kind is already suffixed.
// Adding another would key the roster under CASE_CIN3_CIN3 and lose the section.
h.test("never doubles a suffix that is already there", function () {
  withCin("CIN3", function () {
    h.assertEqual(CCPEnvironment.suffixKind("CASE_CIN3"), "CASE_CIN3");
  });
});

h.test("blank or absent CIN leaves the plain kinds alone", function () {
  withCin("", function () {
    h.assertEqual(CCPEnvironment.suffixKind("CASE"), "CASE");
  });
  withCin(undefined, function () {
    h.assertEqual(CCPEnvironment.suffixKind("CASE"), "CASE");
  });
});

h.test("nothing in, nothing out", function () {
  withCin("CIN3", function () {
    h.assertEqual(CCPEnvironment.suffixKind(undefined), "");
    h.assertEqual(CCPEnvironment.suffixKind(""), "");
  });
});

h.describe("CCPEnvironment.baseKind");

// The whole point: CCPSectionNames and CCPSectionRules key on the documented
// kinds, and must never need an entry per CMS instance.
h.test("takes our own instance back off", function () {
  withCin("CIN3", function () {
    h.assertEqual(CCPEnvironment.baseKind("CASE_CIN3"), "CASE");
    h.assertEqual(CCPEnvironment.baseKind("VICTIM_WITNESS_CIN3"), "VICTIM_WITNESS");
  });
});

h.test("leaves a plain kind alone", function () {
  withCin("CIN3", function () {
    h.assertEqual(CCPEnvironment.baseKind("CASE"), "CASE");
  });
});

// Another instance's suffix should be impossible -- the isolation is the point.
// If one ever arrives, it should look wrong rather than pass as one of ours.
h.test("does not strip another instance's suffix", function () {
  withCin("CIN3", function () {
    h.assertEqual(CCPEnvironment.baseKind("CASE_CIN2"), "CASE_CIN2");
  });
});

h.test("round trips", function () {
  withCin("CIN3", function () {
    h.assertEqual(CCPEnvironment.baseKind(CCPEnvironment.suffixKind("CASE_REVIEW")), "CASE_REVIEW");
  });
  withCin("", function () {
    h.assertEqual(CCPEnvironment.baseKind(CCPEnvironment.suffixKind("CASE_REVIEW")), "CASE_REVIEW");
  });
});
