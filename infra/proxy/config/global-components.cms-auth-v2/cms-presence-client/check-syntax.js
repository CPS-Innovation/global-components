#!/usr/bin/env node
/* check-syntax.js — mechanical proof that a file stays inside a syntax/API floor.
 *
 * Usage: node check-syntax.js <es3|es5> <file> [file...]
 *
 * WHY THIS EXISTS
 * Shared code has to run in BOTH legacy clients. Classic (cms-auth-v2-client.js)
 * is document mode 5 — old JScript — and Modern/DCF are document mode 11. There
 * is no build tool that transpiles down to mode 5: TypeScript REMOVED its ES3
 * target (TS5108), esbuild's floor is a partial es5, and Babel can lower the
 * syntax but not the missing runtime (no JSON, no Array.prototype.forEach, no
 * Object.keys, no String.trim, no addEventListener, no delete-on-window).
 *
 * So common/ is written to the floor by hand — and this proves it, rather than
 * trusting anyone to remember. acorn is already used by build.sh for the ES5
 * gate; acorn-walk comes with it.
 *
 *   es3  syntax at ecmaVersion 3 (rejects const/let, arrow, trailing commas,
 *        getters in object literals) PLUS a denylist of ES5+ runtime APIs.
 *   es5  syntax only — the floor for app-specific code at document mode 11.
 */
var path = require("path");
var fs = require("fs");

var ROOT = path.resolve(__dirname, "../../../../..");
var acorn = require(path.join(ROOT, "node_modules/.pnpm/acorn@8.16.0/node_modules/acorn"));
var walk = require(path.join(ROOT, "node_modules/.pnpm/acorn-walk@8.3.5/node_modules/acorn-walk"));

// Members and globals that document mode 5 does not have. Not exhaustive — it is
// a net for the ones we would actually reach for. Add to it when something slips.
// NOTE on indexOf/lastIndexOf: deliberately NOT banned. String.prototype.indexOf is
// ES1 and used pervasively by the Classic client ("href.indexOf(FRAGMENT) !== -1");
// only the ARRAY form is ES5. A static check cannot tell the two apart from the
// property name alone, and banning both would outlaw the string idiom this code
// is written in. Use CCPSections.indexOfString for arrays — that is what it is for.
var BANNED_MEMBERS = [
  "forEach", "map", "filter", "reduce", "reduceRight",
  "some", "every", "trim", "trimStart", "trimEnd", "includes", "startsWith",
  "endsWith", "keys", "values", "entries", "assign", "freeze", "create",
  "defineProperty", "getPrototypeOf", "setPrototypeOf", "bind", "isArray",
  "now", "querySelector", "querySelectorAll", "addEventListener",
  "removeEventListener", "textContent", "classList", "dataset"
];
var BANNED_GLOBALS = ["JSON", "Promise", "Map", "Set", "Symbol", "WeakMap", "MutationObserver", "Proxy", "Reflect"];

function lineOf(src, index) {
  return src.slice(0, index).split("\n").length;
}

function check(level, file) {
  var src = fs.readFileSync(file, "utf8");
  var problems = [];
  var ast;

  try {
    ast = acorn.parse(src, { ecmaVersion: level === "es3" ? 3 : 5, allowReserved: false });
  } catch (e) {
    var where = e.loc ? " (line " + e.loc.line + ")" : "";
    return [level.toUpperCase() + " syntax: " + e.message.replace(/ \(\d+:\d+\)$/, "") + where];
  }

  // Trailing comma in an ARRAY literal. Legal ES3 grammar, so the parse above
  // accepts it — but JScript 5 counts it as an extra element and puts `undefined`
  // there. A registry that reads `entry.kind` in a loop then throws on the phantom
  // entry, which kills the whole IIFE at load: no client, no error anyone will
  // see, and every screen silently loses presence. Cost a live deployment
  // on 2026-09-01.
  //
  // NOT detectable from the AST: ESTree drops a trailing comma entirely (only a
  // true elision, [1,,2], yields a null element). So we read the source between
  // the last element and the closing bracket.
  walk.simple(ast, {
    ArrayExpression: function (node) {
      var i;
      for (i = 0; i < node.elements.length; i++) {
        if (node.elements[i] === null) {
          problems.push("line " + lineOf(src, node.start) + ": hole in an array literal (elision) — JScript 5 handles these badly");
          return;
        }
      }
      if (!node.elements.length) {
        return;
      }
      var tail = src.slice(node.elements[node.elements.length - 1].end, node.end);
      if (tail.indexOf(",") !== -1) {
        problems.push(
          "line " + lineOf(src, node.elements[node.elements.length - 1].end) +
          ": trailing comma in an array literal — JScript 5 adds a phantom `undefined` element"
        );
      }
    }
  });

  if (level !== "es3") {
    return problems;
  }

  function line(node) {
    return src.slice(0, node.start).split("\n").length;
  }

  walk.simple(ast, {
    MemberExpression: function (node) {
      if (!node.computed && node.property && BANNED_MEMBERS.indexOf(node.property.name) !== -1) {
        problems.push("line " + line(node) + ": ." + node.property.name + " is not available at document mode 5");
      }
    },
    Identifier: function (node) {
      if (BANNED_GLOBALS.indexOf(node.name) !== -1) {
        problems.push("line " + line(node) + ": " + node.name + " does not exist at document mode 5");
      }
    },
    UnaryExpression: function (node) {
      if (node.operator === "delete") {
        problems.push("line " + line(node) + ": delete cannot remove a window expando at document mode 5");
      }
    }
  });

  return problems;
}

var args = process.argv.slice(2);
var level = args.shift();
if (["es3", "es5"].indexOf(level) === -1 || !args.length) {
  console.error("usage: check-syntax.js <es3|es5> <file> [file...]");
  process.exit(2);
}

var failed = 0;
args.forEach(function (file) {
  var problems = check(level, file);
  if (problems.length) {
    failed = failed + 1;
    console.error("FAIL " + level + "  " + path.basename(file));
    problems.forEach(function (p) { console.error("       " + p); });
  } else {
    console.log("ok   " + level + "  " + path.basename(file));
  }
});
process.exit(failed ? 1 : 0);
