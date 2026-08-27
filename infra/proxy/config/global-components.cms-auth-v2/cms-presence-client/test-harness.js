/* test-harness.js — the smallest thing that runs these tests.
 *
 * The sources are concatenated ES3/ES5 scripts sharing one scope, not modules, so
 * there is nothing to require(). load() rebuilds that scope exactly as build.sh
 * does — same files, same order — and hands back the names you ask for, so the
 * tests exercise the real composition rather than a stand-in.
 *
 * No test framework: the proxy package has no runner of its own (its njs suites
 * are hand-rolled too), and adding one for a handful of files would be more
 * machinery than the thing it tests.
 */
var fs = require("fs");
var path = require("path");

/**
 * Build the concatenated scope and pull names out of it.
 * @param {string[]} files  paths relative to this folder, in build order
 * @param {string[]} names  identifiers to return from the built scope
 * @param {{window?: Object, document?: Object}} [env]
 */
function load(files, names, env) {
  env = env || {};
  var src = files
    .map(function (f) {
      return fs.readFileSync(path.join(__dirname, f), "utf8");
    })
    .join("\n");
  var factory = new Function("window", "document", src + "\n; return { " + names.join(", ") + " };");
  return factory(env.window || fakeWindow(), env.document || fakeDocument());
}

// Enough window/document for the code under test, and no more. If a test needs
// more than this, that is a signal the code is reaching further into the host
// page than a guest script should.
function fakeWindow(location) {
  var timers = [];
  return {
    location: location || { pathname: "/", hash: "" },
    setTimeout: function (fn, ms) {
      timers.push({ fn: fn, ms: ms });
      return timers.length;
    },
    clearTimeout: function () {},
    setInterval: function () {
      return 0;
    },
    clearInterval: function () {},
    // Test hooks: inspect scheduled timers, or fire one by index.
    __timers: timers,
    __fire: function (i) {
      timers[i].fn();
    }
  };
}

function fakeDocument(scriptTags) {
  var appended = [];
  return {
    __appended: appended,
    documentElement: {
      appendChild: function (node) {
        appended.push(node);
        return node;
      }
    },
    createElement: function () {
      return { type: "", src: "", parentNode: null, style: {}, id: "" };
    },
    getElementsByTagName: function () {
      return scriptTags || [];
    },
    getElementById: function () {
      return null;
    },
    body: {
      appendChild: function (node) {
        appended.push(node);
        return node;
      }
    }
  };
}

var passed = 0;
var failed = 0;

function describe(name) {
  console.log("\n" + name);
}

function test(name, fn) {
  try {
    fn();
    passed = passed + 1;
    console.log("  ok    " + name);
  } catch (err) {
    failed = failed + 1;
    console.log("  FAIL  " + name);
    console.log("        " + String(err.message).split("\n").join("\n        "));
  }
}

function assertEqual(actual, expected, message) {
  var a = JSON.stringify(actual);
  var e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error((message ? message + "\n" : "") + "expected " + e + "\nactual   " + a);
  }
}

function assertTrue(value, message) {
  assertEqual(!!value, true, message);
}

function summarise() {
  var rule = new Array(57).join("=");
  console.log("\n" + rule);
  console.log("Results: " + passed + " passed, " + failed + " failed");
  console.log(rule);
  process.exit(failed > 0 ? 1 : 0);
}

module.exports = {
  load: load,
  describe: describe,
  test: test,
  assertEqual: assertEqual,
  assertTrue: assertTrue,
  summarise: summarise,
  fakeWindow: fakeWindow,
  fakeDocument: fakeDocument
};
