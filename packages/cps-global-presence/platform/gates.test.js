/* Unit tests for platform/gates.js — named gates in the web components' cohort shape.
 *
 * The gates decide who gets Watchdog in the legacy clients, so the tests are mostly
 * about failing closed: every way a definition can be missing or wrong must leave
 * the gate shut. The three ways in (generallyAvailable, adGroupIds,
 * adHocUserObjectIds) are independent ORs, as in the web components.
 */
var h = require("../test-harness");

var GNAV = "12377eca-b463-4a6c-80ea-95f678f09591";
var OTHER = "aaaaaaaa-0000-0000-0000-000000000000";
var OID = "0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0";

// A viewer with these groups and this oid; definitions as LEGACY_UI.gates.
function gates(definitions, groups, oid) {
  var m = h.load(["platform/gates.js"], ["CCPGates"]);
  var have = (groups || []).map(function (g) {
    return g.toLowerCase();
  });
  return m.CCPGates.createGates({
    definitions: definitions,
    viewer: {
      inGroup: function (id) {
        return have.indexOf(String(id).toLowerCase()) !== -1;
      },
      oid: function () {
        return oid || "";
      }
    }
  });
}

h.describe("the three ways in");

h.test("generallyAvailable opens it for everyone, even with no groups or identity", function () {
  var g = gates({ G: { generallyAvailable: true } });
  h.assertTrue(g.open("G"));
  h.assertEqual(g.why("G"), "generallyAvailable");
});

h.test("a member of any adGroupIds is in", function () {
  var g = gates({ G: { adGroupIds: [OTHER, GNAV] } }, [GNAV]);
  h.assertTrue(g.open("G"));
  h.assertEqual(g.why("G"), "group");
});

h.test("one of adHocUserObjectIds is in", function () {
  var g = gates({ G: { adHocUserObjectIds: [OID] } }, [], OID);
  h.assertEqual(g.why("G"), "adHoc");
});

h.test("group ids and oids compare without case", function () {
  h.assertTrue(gates({ G: { adGroupIds: [GNAV.toUpperCase()] } }, [GNAV]).open("G"), "group");
  h.assertTrue(gates({ G: { adHocUserObjectIds: [OID.toUpperCase()] } }, [], OID).open("G"), "oid");
});

h.test("they are ORs: the most general reason is reported", function () {
  var g = gates({ G: { generallyAvailable: true, adGroupIds: [GNAV], adHocUserObjectIds: [OID] } }, [GNAV], OID);
  h.assertEqual(g.why("G"), "generallyAvailable");
  h.assertEqual(gates({ G: { adGroupIds: [GNAV], adHocUserObjectIds: [OID] } }, [GNAV], OID).why("G"), "group");
});

h.describe("failing closed");

h.test("in none of the groups and not listed: closed", function () {
  var g = gates({ G: { adGroupIds: [GNAV], adHocUserObjectIds: [OID] } }, [OTHER], "someone-else");
  h.assertTrue(!g.open("G"));
  h.assertEqual(g.why("G"), "");
});

h.test("generallyAvailable false, or anything but true, opens nothing", function () {
  [false, "true", 1, null].forEach(function (ga) {
    h.assertTrue(!gates({ G: { generallyAvailable: /** @type {*} */ (ga) } }).open("G"), String(ga));
  });
});

h.test("a gate the environment does not define is closed", function () {
  h.assertTrue(!gates({ G: { generallyAvailable: true } }).open("OTHER"));
});

h.test("no definitions at all (an unbaked bundle) closes everything", function () {
  [undefined, null, {}, [], "G"].forEach(function (defs) {
    h.assertTrue(!gates(/** @type {*} */ (defs), [GNAV], OID).open("G"), JSON.stringify(defs));
  });
});

h.test("a definition that is not an object is closed", function () {
  [true, "x", [GNAV], null].forEach(function (d) {
    h.assertTrue(!gates({ G: /** @type {*} */ (d) }, [GNAV]).open("G"), JSON.stringify(d));
  });
});

h.test("malformed lists yield fewer matches, never more", function () {
  h.assertTrue(!gates({ G: { adGroupIds: /** @type {*} */ (GNAV) } }, [GNAV]).open("G"), "a string is not a list");
  h.assertTrue(!gates({ G: { adGroupIds: /** @type {*} */ ([42, "", null]) } }, [GNAV]).open("G"), "junk entries");
});

h.test("no oid never matches an adHoc list, even one with an empty entry", function () {
  h.assertTrue(!gates({ G: { adHocUserObjectIds: [""] } }, [], "").open("G"));
});

h.test("Object.prototype names are not gates", function () {
  var g = gates({}, [GNAV]);
  h.assertTrue(!g.open("toString") && !g.open("hasOwnProperty"));
});

h.test("an empty or missing name is closed", function () {
  var g = gates({ "": { generallyAvailable: true } });
  h.assertTrue(!g.open("") && !g.open(/** @type {*} */ (undefined)));
});

h.describe("for the console");

h.test("names lists what the environment defines; openNames what is open for the reader", function () {
  var g = gates({ A: { adGroupIds: [GNAV] }, B: { adGroupIds: [OTHER] }, C: { generallyAvailable: true } }, [GNAV]);
  h.assertEqual(g.names(), ["A", "B", "C"]);
  h.assertEqual(g.openNames(), ["A", "C"]);
});

h.test("both legacy bundles load it", function () {
  ["classic", "modern"].forEach(function (name) {
    h.assertTrue(h.bundle(name).indexOf("platform/gates.js") !== -1, name);
  });
});

h.summarise();
