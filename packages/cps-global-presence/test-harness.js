/* test-harness.js — the smallest thing that runs these tests.
 *
 * The sources are concatenated ES3/ES5 scripts sharing one scope, not modules, so
 * there is nothing to require(). load() rebuilds that scope exactly as build.js
 * does — same files, same order — and hands back the names you ask for, so the
 * tests exercise the real composition rather than a stand-in.
 *
 * No test framework: the proxy package has no runner of its own (its njs suites
 * are hand-rolled too), and adding one for a handful of files would be more
 * machinery than the thing it tests.
 */
var fs = require("fs");
var path = require("path");

var FLOOR = ["core/util.js", "core/kinds.js"];

/**
 * The files of one bundles.json bundle, in build order, for load(): what runs in
 * the one scope (the kill switch and the IIFE body; not Classic's separate auth
 * IIFE).
 * @param {string} name  "classic" | "modern"
 * @returns {string[]}
 */
function bundle(name) {
  var manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "bundles.json"), "utf8"));
  var b = manifest.bundles[name];
  return [].concat(b.before || [], b.iife || b.esm).reduce(function (out, g) {
    return out.concat(manifest.groups[g].files);
  }, []);
}

/**
 * Build the concatenated scope and pull names out of it.
 * @param {string[]} files  paths relative to this folder, in build order
 * @param {string[]} names  identifiers to return from the built scope
 * @param {{window?: Object, document?: Object}} [env]
 */
function load(files, names, env) {
  env = env || {};
  // Every bundle starts with the floor helpers, so every load does too.
  files = FLOOR.filter(function (f) { return files.indexOf(f) === -1; }).concat(files);
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
  var intervals = [];
  return {
    location: location || { pathname: "/", hash: "" },
    setTimeout: function (fn, ms) {
      timers.push({ fn: fn, ms: ms });
      return timers.length;
    },
    clearTimeout: function () {},
    setInterval: function (fn, ms) {
      intervals.push({ fn: fn, ms: ms });
      return intervals.length;
    },
    clearInterval: function (id) {
      if (id && intervals[id - 1]) {
        intervals[id - 1] = null;
      }
    },
    // Test hooks: the recurring pass (heartbeat/poll) is timer-driven, so tests
    // have to be able to run one.
    __intervals: intervals,
    __tick: function () {
      var i;
      for (i = 0; i < intervals.length; i++) {
        if (intervals[i]) {
          intervals[i].fn();
        }
      }
    },
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
      return { type: "", src: "", parentNode: null, style: {}, id: "", onload: null, onerror: null, onreadystatechange: null, readyState: "" };
    },
    getElementsByTagName: function (tag) {
      // "head" is where lazily-loaded scripts go; everything else in these tests
      // is asking for the page's <script> tags.
      if (String(tag).toLowerCase() === "head") {
        return [{
          appendChild: function (node) {
            appended.push(node);
            return node;
          }
        }];
      }
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

// A KNOWN BUG, pinned: fn asserts the CORRECT behaviour and is expected to fail.
// It passes while the bug is there, and fails once it is fixed, so the fix has
// to flip it to test() rather than leave a stale marker behind.
var knownBugs = 0;

function knownBug(name, fn) {
  var fixed = true;
  var why = "";
  try {
    fn();
  } catch (err) {
    fixed = false;
    why = String(err.message).split("\n").join("\n        ");
  }
  if (fixed) {
    failed = failed + 1;
    console.log("  FAIL  " + name);
    console.log("        now passes: change knownBug() to test()");
  } else {
    passed = passed + 1;
    knownBugs = knownBugs + 1;
    console.log("  bug   " + name);
    console.log("        " + why);
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

var summarised = false;

function report() {
  var rule = new Array(57).join("=");
  console.log("\n" + rule);
  console.log("Results: " + passed + " passed, " + failed + " failed" + (knownBugs ? " (" + knownBugs + " known bug(s) pinned)" : ""));
  console.log(rule);
}

function summarise() {
  summarised = true;
  report();
  process.exit(failed > 0 ? 1 : 0);
}

// THE EXIT CODE MUST NOT DEPEND ON REMEMBERING summarise(). test() catches every
// failure and only counts it, so a file that never called summarise() used to exit
// 0 however many of its tests failed — and test.sh, and CI, read only the exit
// code. Seven files were in that state on 2026-11-06 (none failing, by luck). This
// reports and sets the code for them; an explicit summarise() still works and
// still exits at once.
process.on("exit", function () {
  if (summarised) {
    return;
  }
  report();
  if (failed > 0) {
    process.exitCode = 1;
  }
});

module.exports = {
  load: load,
  bundle: bundle,
  describe: describe,
  test: test,
  knownBug: knownBug,
  assertEqual: assertEqual,
  assertTrue: assertTrue,
  summarise: summarise,
  fakeWindow: fakeWindow,
  fakeDocument: fakeDocument
};
