#!/usr/bin/env node
/* bake-config.js — put an environment's LEGACY_UI settings into the legacy clients.
 *
 *   node bake-config.js <config.json> <client.js> [<client.js> ...]
 *
 * Replaces the CCP_CONFIG marker (see legacy/shared/config.js) in each client, in
 * place, with the config's LEGACY_UI section as a JSON object literal. A config
 * without LEGACY_UI bakes {}, the same as unbaked: every gate closed.
 *
 * ONE SCRIPT FOR EVERY DEPLOY PATH. CI (sub-workflow-deploy-script.yml) and the
 * hand deploy (infra/proxy/scripts/deploy.local.sh) both upload the clients to the
 * same blob, so if only one of them baked, the other would quietly overwrite a
 * baked client with an unbaked one. Both call this.
 *
 * FAILS LOUDLY, because a silent failure here is every gate closed in an
 * environment with nothing to say why:
 *   - a client without exactly one marker (already baked, or a build that lost it)
 *   - a LEGACY_UI that is not the documented shape
 *
 * No dependencies: CI runs it on a bare runner before anything is installed.
 */
var fs = require("fs");

var MARKER = "/*@@CCP_CONFIG@@*/ {}";

// Throws rather than exiting, so the checks are testable; the CLI turns it into exit 1.
var fail = function (message) {
  throw new Error("bake-config: " + message);
};

var isPlainObject = function (value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
};

// The FEATURE_FLAG_*_USERS fields the legacy gates understand (legacy/shared/gates.js).
var GATE_FIELDS = ["adGroupIds", "adHocUserObjectIds", "generallyAvailable"];

var checkIdList = function (where, value) {
  if (!Array.isArray(value)) {
    fail(where + " must be a list of ids");
  }
  value.forEach(function (id, i) {
    if (typeof id !== "string" || !id) {
      fail(where + "[" + i + "] must be a non-empty string");
    }
  });
};

var checkGate = function (name, gate) {
  var where = "LEGACY_UI.gates." + name;
  if (!isPlainObject(gate)) {
    fail(where + " must be an object (adGroupIds, adHocUserObjectIds, generallyAvailable)");
  }
  Object.keys(gate).forEach(function (key) {
    if (key === "variants" || key === "variantSalt") {
      // Valid in the web components' shape, but the legacy clients do not bucket:
      // ignoring it would quietly leave out the share it was meant to let in.
      fail(where + "." + key + " is not supported by the legacy clients");
    }
    if (GATE_FIELDS.indexOf(key) === -1) {
      fail(where + "." + key + " is not a gate field (" + GATE_FIELDS.join(", ") + ")");
    }
  });
  if (gate.adGroupIds !== undefined) {
    checkIdList(where + ".adGroupIds", gate.adGroupIds);
  }
  if (gate.adHocUserObjectIds !== undefined) {
    checkIdList(where + ".adHocUserObjectIds", gate.adHocUserObjectIds);
  }
  if (gate.generallyAvailable !== undefined && typeof gate.generallyAvailable !== "boolean") {
    fail(where + ".generallyAvailable must be true or false");
  }
};

/**
 * The LEGACY_UI section, checked for the shape the clients read. Unknown keys are
 * kept (later sections, e.g. button rules, ride through without a change here);
 * known ones must be right.
 * @param {*} config the parsed config.json
 * @returns {Object}
 */
var legacyUi = function (config) {
  var ui = config.LEGACY_UI;
  if (ui === undefined) {
    return {};
  }
  if (!isPlainObject(ui)) {
    fail("LEGACY_UI must be an object");
  }
  if (ui.groups !== undefined) {
    // The first shape (name -> one group id). Nothing reads it any more, so a config
    // still carrying it would deploy with every gate closed.
    fail("LEGACY_UI.groups was replaced by LEGACY_UI.gates (name -> {adGroupIds, adHocUserObjectIds, generallyAvailable})");
  }
  if (ui.gates !== undefined) {
    if (!isPlainObject(ui.gates)) {
      fail("LEGACY_UI.gates must be an object of gate name -> gate");
    }
    Object.keys(ui.gates).forEach(function (name) {
      checkGate(name, ui.gates[name]);
    });
  }
  return ui;
};

var LS = String.fromCharCode(0x2028);
var PS = String.fromCharCode(0x2029);

/**
 * JSON is an ES3 object literal except for two characters JSON allows raw in
 * strings and JavaScript does not: U+2028 and U+2029 end a line in a script.
 * @param {*} value
 * @returns {string}
 */
var asScriptLiteral = function (value) {
  return JSON.stringify(value).split(LS).join("\\u2028").split(PS).join("\\u2029");
};

var bake = function (configPath, clientPaths) {
  var config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (e) {
    fail("cannot read " + configPath + ": " + e.message);
  }
  var literal = asScriptLiteral(legacyUi(config));
  // Check every client before writing any, so a failure leaves none half-baked.
  var sources = clientPaths.map(function (clientPath) {
    var src = fs.readFileSync(clientPath, "utf8");
    var count = src.split(MARKER).length - 1;
    if (count !== 1) {
      fail(clientPath + " carries the CCP_CONFIG marker " + count + " times; expected exactly one (already baked?)");
    }
    return src;
  });
  clientPaths.forEach(function (clientPath, i) {
    fs.writeFileSync(clientPath, sources[i].replace(MARKER, function () {
      return literal;
    }));
    console.log("bake-config: " + clientPath + " <- LEGACY_UI " + literal);
  });
};

if (require.main === module) {
  var args = process.argv.slice(2);
  try {
    if (args.length < 2) {
      fail("usage: node bake-config.js <config.json> <client.js> [<client.js> ...]");
    }
    bake(args[0], args.slice(1));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { MARKER: MARKER, legacyUi: legacyUi, asScriptLiteral: asScriptLiteral, bake: bake };
