/* legacy/shared/gates.js — named feature gates, in the web components' cohort shape.
 * Shared between Classic and Modern/DCF. MODE 5 FLOOR.
 *
 * Each gate is defined per environment in LEGACY_UI.gates (baked into CCP_CONFIG at
 * deploy time) with a subset of the web components' FEATURE_FLAG_*_USERS shape
 * (featureFlagUsersSchema in packages/cps-global-configuration/src/Config.ts):
 *
 *   "CASE_PRESENCE_GATE_1_CONNECT": {
 *     "adGroupIds": ["12377eca-..."],        the reader is in any of these groups
 *     "adHocUserObjectIds": ["0b1c2d3e-..."], or is one of these people (Entra oid)
 *     "generallyAvailable": true             or everyone: the trump card
 *   }
 *
 * The three are independent ORs, as they are in the web components. `variants`
 * (percentage buckets) is not supported here: bake-config refuses it rather than
 * let it be silently ignored.
 *
 * FAILS CLOSED. A gate the environment does not define, an unbaked bundle (no
 * gates at all), or a definition of the wrong shape is closed. Groups come from
 * whoami's handover-claims cookie and the oid from the presence token, so before
 * whoami answers only generallyAvailable can open a gate.
 *
 * This knows nothing about the Entra rollout or the preview flags: the client
 * combines those with the answer here (see client.js).
 */

var CCPGates = {};

/**
 * @typedef {{adGroupIds?: string[], adHocUserObjectIds?: string[],
 *            generallyAvailable?: boolean}} CCPGateDefinition
 */

/**
 * @param {{definitions?: Object<string, CCPGateDefinition>,
 *          viewer: {inGroup: function(string): boolean, oid: function(): string}}} options
 * @returns {{open: function(string): boolean, why: function(string): string,
 *            names: function(): string[], openNames: function(): string[]}}
 */
CCPGates.createGates = function (options) {
  var viewer = options.viewer;

  // A plain object: not null, not a list (no Array.isArray at document mode 5,
  // hence the length test).
  /**
   * @param {*} value
   * @returns {boolean}
   */
  function isObject(value) {
    return !!value && typeof value === "object" && typeof value.length !== "number";
  }

  /** @type {Object<string, CCPGateDefinition>} */
  var definitions = isObject(options.definitions) ? /** @type {*} */ (options.definitions) : {};

  // Own properties only: CCP_CONFIG is an object literal, so without this a name
  // like "toString" would find Object.prototype's and look defined.
  /**
   * @param {Object} obj
   * @param {string} key
   * @returns {boolean}
   */
  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  /**
   * @param {string} name
   * @returns {?CCPGateDefinition}
   */
  function definition(name) {
    var key = String(name || "");
    if (!key || !hasOwn(definitions, key)) {
      return null;
    }
    return isObject(definitions[key]) ? definitions[key] : null;
  }

  // The strings in a list, lower-cased (GUIDs compare case-insensitively).
  // Anything else yields fewer entries, never more.
  /**
   * @param {*} value
   * @returns {string[]}
   */
  function strings(value) {
    /** @type {string[]} */
    var out = [];
    var i;
    if (!value || typeof value === "string" || typeof value.length !== "number") {
      return out;
    }
    for (i = 0; i < value.length; i++) {
      if (typeof value[i] === "string" && value[i]) {
        out.push(value[i].toLowerCase());
      }
    }
    return out;
  }

  /**
   * Why the gate is open: "generallyAvailable", "group" or "adHoc", most general
   * first. "" means closed.
   * @param {string} name
   * @returns {string}
   */
  function why(name) {
    var d = definition(name);
    var ids, i, oid;
    if (!d) {
      return "";
    }
    if (d.generallyAvailable === true) {
      return "generallyAvailable";
    }
    ids = strings(d.adGroupIds);
    for (i = 0; i < ids.length; i++) {
      if (viewer.inGroup(ids[i])) {
        return "group";
      }
    }
    oid = String(viewer.oid() || "").toLowerCase();
    if (oid && CCPUtil.indexOf(strings(d.adHocUserObjectIds), oid) !== -1) {
      return "adHoc";
    }
    return "";
  }

  /**
   * @param {string} name
   * @returns {boolean}
   */
  function open(name) {
    return why(name) !== "";
  }

  /** @returns {string[]} */
  function names() {
    /** @type {string[]} */
    var out = [];
    var name;
    for (name in definitions) {
      if (hasOwn(definitions, name)) {
        out.push(name);
      }
    }
    return out;
  }

  return {
    open: open,
    why: why,
    // The gates this environment defines.
    names: names,
    // The ones open for this reader: for the console.
    openNames: function () {
      /** @type {string[]} */
      var out = [];
      var all = names();
      var i;
      for (i = 0; i < all.length; i++) {
        if (open(all[i])) {
          out.push(all[i]);
        }
      }
      return out;
    }
  };
};
