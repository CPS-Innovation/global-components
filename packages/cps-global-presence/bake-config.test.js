/* Unit tests for bake-config.js — LEGACY_UI into the legacy clients at deploy time.
 *
 * Every deploy path runs this on the real bundles, so the tests are about the two
 * ways it can go wrong silently: a client that ends up unbaked (or baked twice),
 * and a config whose shape the clients would misread. Both must fail loudly.
 */
var fs = require("fs");
var os = require("os");
var path = require("path");
var h = require("./test-harness");
var bakeConfig = require("./bake-config");

var GNAV = "12377eca-b463-4a6c-80ea-95f678f09591";

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bake-config-"));
}

function writeJson(dir, value) {
  var p = path.join(dir, "config.json");
  fs.writeFileSync(p, typeof value === "string" ? value : JSON.stringify(value));
  return p;
}

// A client shaped like a built bundle: the marker line from legacy/shared/config.js.
function writeClient(dir, name, body) {
  var p = path.join(dir, name);
  fs.writeFileSync(p, body !== undefined ? body : "var X = 1;\nvar CCP_CONFIG = " + bakeConfig.MARKER + ";\nvar Y = 2;\n");
  return p;
}

function ccpConfigOf(clientPath) {
  return new Function(fs.readFileSync(clientPath, "utf8") + "\n; return CCP_CONFIG;")();
}

function throwsWith(fn, fragment) {
  try {
    fn();
  } catch (e) {
    h.assertTrue(e.message.indexOf(fragment) !== -1, "message should mention '" + fragment + "': " + e.message);
    return;
  }
  throw new Error("expected a failure mentioning '" + fragment + "'");
}

// bake() logs each file it writes; keep the test output to the results.
function quietly(fn) {
  var log = console.log;
  console.log = function () {};
  try {
    return fn();
  } finally {
    console.log = log;
  }
}

h.describe("bake-config — baking");

h.test("puts LEGACY_UI into every client named", function () {
  var d = tmp();
  var ui = { gates: { CASE_PRESENCE_GATE_1_CONNECT: { adGroupIds: [GNAV] } } };
  var cfg = writeJson(d, { ENVIRONMENT: "test", LEGACY_UI: ui });
  var a = writeClient(d, "a.js");
  var b = writeClient(d, "b.js");
  quietly(function () {
    bakeConfig.bake(cfg, [a, b]);
  });
  h.assertEqual(ccpConfigOf(a), ui);
  h.assertEqual(ccpConfigOf(b), ui);
});

h.test("a config without LEGACY_UI bakes {}, the same as unbaked", function () {
  var d = tmp();
  var cfg = writeJson(d, { ENVIRONMENT: "prod" });
  var a = writeClient(d, "a.js");
  quietly(function () {
    bakeConfig.bake(cfg, [a]);
  });
  h.assertEqual(ccpConfigOf(a), {});
  h.assertTrue(fs.readFileSync(a, "utf8").indexOf(bakeConfig.MARKER) === -1, "the marker is consumed");
});

h.test("leaves the rest of the client untouched", function () {
  var d = tmp();
  var cfg = writeJson(d, { LEGACY_UI: {} });
  var a = writeClient(d, "a.js");
  quietly(function () {
    bakeConfig.bake(cfg, [a]);
  });
  h.assertEqual(fs.readFileSync(a, "utf8"), "var X = 1;\nvar CCP_CONFIG = {};\nvar Y = 2;\n");
});

h.test("keeps sections it does not know, so later ones need no change here", function () {
  var d = tmp();
  var ui = { gates: {}, buttons: { items: [] } };
  var a = writeClient(d, "a.js");
  quietly(function () {
    bakeConfig.bake(writeJson(d, { LEGACY_UI: ui }), [a]);
  });
  h.assertEqual(ccpConfigOf(a), ui);
});

h.test("a $ in a value is written literally, not read as a replace pattern", function () {
  var d = tmp();
  var ui = { gates: { A: { adGroupIds: ["$&$1$$"] } } };
  var a = writeClient(d, "a.js");
  quietly(function () {
    bakeConfig.bake(writeJson(d, { LEGACY_UI: ui }), [a]);
  });
  h.assertEqual(ccpConfigOf(a), ui);
});

h.test("U+2028 and U+2029 are escaped, because they end a line in a script", function () {
  var out = bakeConfig.asScriptLiteral({ a: "x" + String.fromCharCode(0x2028) + String.fromCharCode(0x2029) });
  h.assertTrue(out.indexOf(String.fromCharCode(0x2028)) === -1 && out.indexOf(String.fromCharCode(0x2029)) === -1, out);
  h.assertEqual(new Function("return " + out)().a.length, 3);
});

h.describe("bake-config — failing loudly");

h.test("a client without the marker fails", function () {
  var d = tmp();
  var a = writeClient(d, "a.js", "var CCP_CONFIG = {};\n");
  throwsWith(function () {
    bakeConfig.bake(writeJson(d, {}), [a]);
  }, "0 times");
});

h.test("baking twice fails rather than silently doing nothing", function () {
  var d = tmp();
  var cfg = writeJson(d, { LEGACY_UI: { gates: { A: { generallyAvailable: true } } } });
  var a = writeClient(d, "a.js");
  quietly(function () {
    bakeConfig.bake(cfg, [a]);
  });
  throwsWith(function () {
    bakeConfig.bake(cfg, [a]);
  }, "already baked");
});

h.test("a client with the marker twice fails", function () {
  var d = tmp();
  var a = writeClient(d, "a.js", bakeConfig.MARKER + "\n" + bakeConfig.MARKER + "\n");
  throwsWith(function () {
    bakeConfig.bake(writeJson(d, {}), [a]);
  }, "2 times");
});

h.test("one bad client means none is written", function () {
  var d = tmp();
  var good = writeClient(d, "good.js");
  var bad = writeClient(d, "bad.js", "no marker here\n");
  var before = fs.readFileSync(good, "utf8");
  throwsWith(function () {
    bakeConfig.bake(writeJson(d, { LEGACY_UI: {} }), [good, bad]);
  }, "bad.js");
  h.assertEqual(fs.readFileSync(good, "utf8"), before);
});

h.test("an unreadable config fails", function () {
  var d = tmp();
  var a = writeClient(d, "a.js");
  throwsWith(function () {
    bakeConfig.bake(writeJson(d, "{ not json"), [a]);
  }, "cannot read");
});

h.test("LEGACY_UI that is not an object fails", function () {
  [[], "x", 1, null].forEach(function (ui) {
    throwsWith(function () {
      bakeConfig.legacyUi({ LEGACY_UI: ui });
    }, "LEGACY_UI must be an object");
  });
});

h.test("the old groups shape fails, naming its replacement", function () {
  throwsWith(function () {
    bakeConfig.legacyUi({ LEGACY_UI: { groups: { CASE_PRESENCE_GATE_1_CONNECT: GNAV } } });
  }, "replaced by LEGACY_UI.gates");
});

h.test("gates that are not an object fail", function () {
  [[], "x", null].forEach(function (gates) {
    throwsWith(function () {
      bakeConfig.legacyUi({ LEGACY_UI: { gates: gates } });
    }, "LEGACY_UI.gates must be an object");
  });
});

h.test("a gate that is not an object fails, naming the gate", function () {
  [GNAV, [GNAV], true, null].forEach(function (gate) {
    throwsWith(function () {
      bakeConfig.legacyUi({ LEGACY_UI: { gates: { CASE_PRESENCE_GATE_1_CONNECT: gate } } });
    }, "LEGACY_UI.gates.CASE_PRESENCE_GATE_1_CONNECT must be an object");
  });
});

h.test("ids that are not a list of non-empty strings fail", function () {
  ["adGroupIds", "adHocUserObjectIds"].forEach(function (field) {
    [GNAV, [42], [""], [null]].forEach(function (ids) {
      var gate = {};
      gate[field] = ids;
      throwsWith(function () {
        bakeConfig.legacyUi({ LEGACY_UI: { gates: { G: gate } } });
      }, "LEGACY_UI.gates.G." + field);
    });
  });
});

h.test("generallyAvailable must be a real boolean", function () {
  ["true", 1, null].forEach(function (ga) {
    throwsWith(function () {
      bakeConfig.legacyUi({ LEGACY_UI: { gates: { G: { generallyAvailable: ga } } } });
    }, "generallyAvailable must be true or false");
  });
});

// Valid for the web components, but ignoring it here would quietly leave out the
// share it was meant to let in.
h.test("variants and variantSalt fail: the legacy clients do not bucket", function () {
  ["variants", "variantSalt"].forEach(function (key) {
    var gate = { adGroupIds: [GNAV] };
    gate[key] = key === "variants" ? { on: 10 } : "salt";
    throwsWith(function () {
      bakeConfig.legacyUi({ LEGACY_UI: { gates: { G: gate } } });
    }, "G." + key + " is not supported");
  });
});

h.test("an unknown gate field fails rather than being ignored", function () {
  throwsWith(function () {
    bakeConfig.legacyUi({ LEGACY_UI: { gates: { G: { adGroupId: [GNAV] } } } });
  }, "G.adGroupId is not a gate field");
});

h.test("every supported field together passes", function () {
  var ui = { gates: { G: { adGroupIds: [GNAV], adHocUserObjectIds: [GNAV], generallyAvailable: false } } };
  h.assertEqual(bakeConfig.legacyUi({ LEGACY_UI: ui }), ui);
});

h.describe("bake-config — the real configs");

// Every environment's config must bake, or its deploy fails at the last step.
h.test("every configuration/config.*.json passes the shape check", function () {
  var dir = path.join(__dirname, "..", "..", "configuration");
  fs.readdirSync(dir).filter(function (f) {
    return /^config\..+\.json$/.test(f) && !/\.notification\.json$/.test(f);
  }).forEach(function (f) {
    bakeConfig.legacyUi(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  });
});

// The names client.js asks about (CCPClient.GATE_1_CONNECT / GATE_2_SHOW_UI).
h.test("QA maps both presence gates", function () {
  var cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "configuration", "config.test.json"), "utf8"));
  var gates = bakeConfig.legacyUi(cfg).gates;
  h.assertEqual(gates.CASE_PRESENCE_GATE_1_CONNECT, { adGroupIds: [GNAV] });
  h.assertEqual(gates.CASE_PRESENCE_GATE_2_SHOW_UI, { adGroupIds: [GNAV] });
});

h.test("the marker matches the one the bundles carry", function () {
  var src = fs.readFileSync(path.join(__dirname, "legacy", "shared", "config.js"), "utf8");
  h.assertEqual(src.split(bakeConfig.MARKER).length - 1, 1);
});
