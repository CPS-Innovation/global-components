/* Unit tests for common/presence-environment.js
 *
 * The CIN suffix is the difference between joining the room and being invisible in
 * it, and the failure is silent either way -- so the round trip is what matters:
 * what we put on the wire, and what we read back, must agree with the Classic
 * client and must leave the shared tables looking at plain kinds.
 *
 * Since 2026-11-04 the value is DISCOVERED rather than hardcoded, which adds two
 * things worth pinning on top of that: the mapping from a CMS environment label
 * to a suffix (the one rule all three clients share) and the set-once rule that
 * stops a late answer invalidating a roster already keyed under an earlier one.
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

h.describe("CCPEnvironment.suffixFor — the shared mapping");

// The user-facing rule, in the words it was asked for: a CIN instance is
// suffixed because it shares a Watchdog with its siblings; production is not,
// because it has one of its own.
h.test("a CIN instance keeps its own name", function () {
  h.assertEqual(CCPEnvironment.suffixFor("CIN2"), "CIN2");
  h.assertEqual(CCPEnvironment.suffixFor("CIN3"), "CIN3");
  h.assertEqual(CCPEnvironment.suffixFor("CIN5"), "CIN5");
});

h.test("production takes no suffix", function () {
  h.assertEqual(CCPEnvironment.suffixFor("CMS"), "");
});

// (a) of the brief: whoever derived the label may already have normalised a
// suffix-less environment to "", and that must be allowed through rather than
// treated as a mistake.
h.test("an already-normalised empty is accepted, not rejected", function () {
  h.assertEqual(CCPEnvironment.suffixFor(""), "");
  h.assertEqual(CCPEnvironment.suffixFor(null), "");
  h.assertEqual(CCPEnvironment.suffixFor(undefined), "");
});

h.test("case does not matter — the wire form is upper", function () {
  h.assertEqual(CCPEnvironment.suffixFor("cin3"), "CIN3");
  h.assertEqual(CCPEnvironment.suffixFor("cms"), "");
});

// Pattern, not a list: standing up a CIN4 must need no change here.
h.test("an instance nobody has built yet still suffixes", function () {
  h.assertEqual(CCPEnvironment.suffixFor("CIN4"), "CIN4");
  h.assertEqual(CCPEnvironment.suffixFor("CIN17"), "CIN17");
});

// The accepted cost of a total mapping. An unknown label lands in the unsuffixed
// room, which on the shared Watchdog is empty -- presence that finds nobody, not
// presence shown to the wrong people.
h.test("a label we have never seen takes no suffix", function () {
  h.assertEqual(CCPEnvironment.suffixFor("SOMETHINGELSE"), "");
  h.assertEqual(CCPEnvironment.suffixFor("CIN"), "");
  h.assertEqual(CCPEnvironment.suffixFor("CINX"), "");
  h.assertEqual(CCPEnvironment.suffixFor("XCIN3"), "");
});

h.describe("CCPEnvironment.labelFor");

h.test("reads the leading label off a CMS domain", function () {
  h.assertEqual(CCPEnvironment.labelFor("cin3.cps.gov.uk"), "CIN3");
  h.assertEqual(CCPEnvironment.labelFor("cms.cps.gov.uk"), "CMS");
});

h.test("a bare host is the label", function () {
  h.assertEqual(CCPEnvironment.labelFor("cin3"), "CIN3");
});

h.test("nothing in, nothing out", function () {
  h.assertEqual(CCPEnvironment.labelFor(""), "");
  h.assertEqual(CCPEnvironment.labelFor(null), "");
  h.assertEqual(CCPEnvironment.labelFor(undefined), "");
});

h.describe("CCPEnvironment.adopt — known-ness, and set once");

// UNKNOWN IS NOT BLANK. The whole reason CIN starts as null: guessing "" while
// the answer is in flight registers us in a room nobody is in.
h.test("nothing is known until somebody says so", function () {
  withCin(null, function () {
    h.assertEqual(CCPEnvironment.known(), false);
    h.assertTrue(CCPEnvironment.adopt("CIN3"));
    h.assertTrue(CCPEnvironment.known());
    h.assertEqual(CCPEnvironment.CIN, "CIN3");
  });
});

// Known-ness is the CALLER'S assertion: calling adopt at all means "I know what
// this environment is", so an empty label is a legitimate "known, no suffix" --
// a source's own unknown-empty is filtered out before it gets here.
h.test("adopting an empty label is KNOWN, and known to need no suffix", function () {
  withCin(null, function () {
    h.assertTrue(CCPEnvironment.adopt(""));
    h.assertTrue(CCPEnvironment.known());
    h.assertEqual(CCPEnvironment.CIN, "");
  });
});

h.test("production is known too, and is not the same state as unknown", function () {
  withCin(null, function () {
    CCPEnvironment.adopt("CMS");
    h.assertTrue(CCPEnvironment.known());
    h.assertEqual(CCPEnvironment.suffixKind("CASE"), "CASE");
  });
});

h.test("the same answer again is accepted silently", function () {
  withCin(null, function () {
    CCPEnvironment.adopt("CIN3");
    h.assertTrue(CCPEnvironment.adopt("CIN3"));
    h.assertTrue(CCPEnvironment.adopt("cin3"), "and in any case");
    h.assertEqual(CCPEnvironment.CIN, "CIN3");
  });
});

// The roster keys on wire kinds it has already seen and baseKind strips with
// whatever CIN currently says, so a changed value mis-strips everything cached
// under the old one. Refusing is the lesser evil, and it is reported.
h.test("a DIFFERENT answer later is refused, and the first one stands", function () {
  withCin(null, function () {
    CCPEnvironment.adopt("CIN3");
    h.assertEqual(CCPEnvironment.adopt("CIN5"), false);
    h.assertEqual(CCPEnvironment.CIN, "CIN3");
  });
});

h.test("two labels that mean the same suffix do not count as a change", function () {
  withCin(null, function () {
    CCPEnvironment.adopt("CMS");
    h.assertTrue(CCPEnvironment.adopt("SOMETHINGELSE"), "both map to no suffix");
    h.assertEqual(CCPEnvironment.CIN, "");
  });
});

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

// It stays TOTAL while unknown rather than throwing: callers are not meant to get
// here without known(), but a throw inside a guarded observation pass at the mode
// 5 floor is swallowed, which is worse than a plain kind nobody registers.
h.test("an unknown environment yields the plain kind rather than throwing", function () {
  withCin(null, function () {
    h.assertEqual(CCPEnvironment.suffixKind("CASE"), "CASE");
    h.assertEqual(CCPEnvironment.baseKind("CASE_CIN3"), "CASE_CIN3");
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

// The whole chain the web components walk, and the proxy's njs half mirrors:
// a CMS domain from the session hint, to a label, to a suffix, to a wire kind.
h.test("domain to wire kind, end to end", function () {
  withCin(null, function () {
    CCPEnvironment.adopt(CCPEnvironment.labelFor("cin3.cps.gov.uk"));
    h.assertEqual(CCPEnvironment.suffixKind("CASE"), "CASE_CIN3");
  });
  withCin(null, function () {
    CCPEnvironment.adopt(CCPEnvironment.labelFor("cms.cps.gov.uk"));
    h.assertEqual(CCPEnvironment.suffixKind("CASE"), "CASE");
  });
});

h.summarise();
