/* common/presence-environment.js -- WHICH CMS INSTANCE'S PRESENCE WE JOIN.
 * SHARED, MODE 5 FLOOR.
 *
 * CIN2, CIN3 and CIN5 are separate CMS instances that share one Watchdog. To stop
 * them seeing each other's presence, the Classic client suffixes every section
 * KIND with its instance -- "1234:CASE_CIN3", "1234:VICTIM_WITNESS_CIN3:5678" --
 * so each instance forms its own conflict set. Case ids and subject ids are never
 * touched.
 *
 * WE MUST SAY THE SAME THING OR WE ARE NOT IN THE ROOM. A client registering
 * "1234:CASE" against an instance speaking "1234:CASE_CIN3" is isolated exactly as
 * intended -- no error, no empty roster to notice, simply nobody ever there. That
 * is what happened when Classic moved first.
 *
 * HARDCODED, DELIBERATELY AND TEMPORARILY, to mirror the Classic client, which
 * carries the same constant as a deploy-time setting. It is a property of the CMS
 * instance our proxy fronts, not of our own test/uat/prod split, so neither
 * codebase can currently derive it. Detecting it is future work; until then the
 * value here and the value in the Classic client must be changed together.
 *
 * THE SUFFIX LIVES ONLY ON THE WIRE. It goes on when we register a section and
 * comes off the moment a kind is read back, so CCPSectionNames and
 * CCPSectionRules keep working on the kinds the API documents and never need a
 * variant per instance.
 */

var CCPEnvironment = {};

/** "" (or undefined) means the plain kinds, matching an unsuffixed Classic. */
CCPEnvironment.CIN = "CIN3";

/**
 * The kind to put on the wire. Never double-suffixes: a kind that already carries
 * the suffix is returned untouched, because the wire kind read back from a
 * snapshot already has it.
 *
 * @param {string|undefined} kind
 * @returns {string}
 */
CCPEnvironment.suffixKind = function (kind) {
  var suffix;
  if (!kind || !CCPEnvironment.CIN) {
    return kind ? String(kind) : "";
  }
  suffix = "_" + CCPEnvironment.CIN;
  if (CCPEnvironment.hasSuffix(String(kind).toUpperCase(), suffix.toUpperCase())) {
    return String(kind);
  }
  return String(kind) + suffix;
};

/**
 * The kind as the API documents it, for naming and for policy.
 *
 * ONLY OUR OWN SUFFIX IS STRIPPED. A kind carrying some other instance's suffix is
 * left alone: it should be impossible, and if it ever arrives it should be visible
 * as the oddity it is rather than quietly normalised into one of ours.
 *
 * @param {string|undefined} kind
 * @returns {string}
 */
CCPEnvironment.baseKind = function (kind) {
  var suffix, text;
  if (!kind || !CCPEnvironment.CIN) {
    return kind ? String(kind) : "";
  }
  text = String(kind);
  suffix = "_" + CCPEnvironment.CIN;
  if (CCPEnvironment.hasSuffix(text.toUpperCase(), suffix.toUpperCase())) {
    return text.substring(0, text.length - suffix.length);
  }
  return text;
};

// String.prototype.endsWith does not exist at document mode 5 -- and the floor
// checker denies the name outright, so this cannot borrow it either.
CCPEnvironment.hasSuffix = function (text, suffix) {
  if (suffix.length > text.length) {
    return false;
  }
  return text.substring(text.length - suffix.length) === suffix;
};
