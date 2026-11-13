/* core/environment.js -- WHICH CMS INSTANCE'S PRESENCE WE JOIN.
 * SHARED, MODE 5 FLOOR.
 *
 * CIN2, CIN3 and CIN5 are separate CMS instances that share one Watchdog. To stop
 * them seeing each other's presence, every section KIND carries its instance --
 * "1234:CASE_CIN3", "1234:VICTIM_WITNESS_CIN3:5678" -- so each instance forms its
 * own conflict set. Case ids and subject ids are never touched.
 *
 * WE MUST SAY THE SAME THING OR WE ARE NOT IN THE ROOM. A client registering
 * "1234:CASE" against an instance speaking "1234:CASE_CIN3" is isolated exactly as
 * intended -- no error, no empty roster to notice, simply nobody ever there. That
 * is what happened when Classic moved first, and it is why everything below is
 * about never guessing.
 *
 * WHERE THE VALUE COMES FROM, since 2026-11-04. The proxy reads the
 * Cms-Session-Hint cookie, takes the first CMS domain and reports its leading
 * label as cmsEnv: "CIN3" for cin3.cps.gov.uk, "CMS" for cms.cps.gov.uk. The
 * three clients learn it by different routes -- the two legacy clients ask the
 * whoami op, the web components already fetch the hint at boot -- so the ROUTE
 * belongs to each client and the RULE lives here, decided once and tested once.
 * It was a hardcoded "CIN3" in this file and a deploy-time constant in the
 * hand-written Classic client until then.
 *
 * IT CANNOT BE A DEPLOY-TIME VALUE, which is why it is read per session rather
 * than baked into the bundle the way CCPOrigin.IMPL_ORIGIN is. One proxied QA
 * deployment fronts SEVERAL CIN instances -- it is one-to-many -- so there is one
 * injected client, served to all of them, and no constant in it could be right
 * for more than one. The hardcoded value was not a shortcut waiting for a tidier
 * deploy; it was only ever correct for whichever instance we happened to be
 * testing on.
 *
 * UNKNOWN IS NOT BLANK, and that difference is why this is a small module rather
 * than a string. null means nobody has told us yet; "" means somebody has, and
 * that this environment takes no suffix. Treating the first as the second
 * registers us in a room nobody occupies, which on screen is indistinguishable
 * from working presence on a quiet case. So a caller must see known() before it
 * names a section of its own, and hold off while it is false -- the legacy
 * clients re-ask on their next pass, and the web components stay inert.
 *
 * SET ONCE, before the first registration. The roster keys on the wire kinds it
 * has already seen and baseKind strips with whatever CIN currently says, so a
 * value that changed mid-session would mis-strip everything cached under the old
 * one. adopt() therefore takes the first answer and refuses any later
 * disagreement rather than resolving it.
 *
 * THE SUFFIX LIVES ONLY ON THE WIRE. It goes on when we register a section and
 * comes off the moment a kind is read back, so CCPSectionNames and
 * CCPSectionRules keep working on the kinds the API documents and never need a
 * variant per instance.
 */

var CCPEnvironment = {};

/**
 * The suffix in force, or null while we have not been told.
 *
 * null = not yet known. "" = known, and this environment takes no suffix.
 * Assign directly only in tests; production code goes through adopt().
 *
 * @type {string|null}
 */
CCPEnvironment.CIN = null;

/**
 * THE MAPPING: a CMS environment label to the suffix it takes.
 *
 * Pattern-based rather than a list of names, so standing up a CIN4 needs no
 * change here:
 *   "CIN3" -> "CIN3"   a sibling on the shared Watchdog: suffixed, so the
 *                      instances cannot see each other
 *   "CMS"  -> ""       production, on a Watchdog of its own with nothing to
 *                      separate from
 *   ""     -> ""       already normalised by whoever derived it
 *   other  -> ""       see below
 *
 * TOTAL, AND DELIBERATELY FORGIVING. An unrecognised label takes no suffix,
 * which puts it in the unsuffixed room on whichever Watchdog it is pointed at.
 * On the shared one that room is empty, so the cost of a label we have never
 * seen is presence that finds nobody -- not presence shown to the wrong people.
 * The label is logged by every client, so it is visible rather than mysterious.
 *
 * @param {string|null|undefined} label the cmsEnv label; "" and null are allowed
 * @returns {string} the suffix, without its leading underscore
 */
CCPEnvironment.suffixFor = function (label) {
  var text = label ? String(label).toUpperCase() : "";
  return /^CIN[0-9]+$/.test(text) ? text : "";
};

/**
 * The label for a CMS domain: "cin3.cps.gov.uk" -> "CIN3".
 *
 * For the clients that hold the session hint itself rather than a cmsEnv the
 * proxy has already reduced. The proxy derives it the same way in njs, which
 * cannot load this file; its integration tests pin that half.
 *
 * @param {string|null|undefined} domain a CMS domain from the session hint
 * @returns {string} the label, uppercased; "" when there is nothing to read
 */
CCPEnvironment.labelFor = function (domain) {
  var text = domain ? String(domain) : "";
  return text.split(".")[0].toUpperCase();
};

/** Whether anyone has told us which environment this is. */
CCPEnvironment.known = function () {
  return CCPEnvironment.CIN !== null;
};

/**
 * Take a cmsEnv label as the answer. Idempotent, and set-once: a later label
 * that maps to the same suffix is accepted silently, one that does not is
 * REFUSED and the first answer stands (see the header).
 *
 * KNOWN-NESS IS THE CALLER'S ASSERTION, not a property of the value. Calling
 * this at all means "I know what environment this is", so adopt("") is a
 * legitimate "known, and no suffix". A source's own unknown-empty must be
 * filtered out BEFORE it gets here -- the proxy never reports a blank label for
 * an environment it identified, so `if (env) { adopt(env); }` is the whole of it.
 *
 * @param {string|null|undefined} label
 * @returns {boolean} true if the value is now in force, false if it was refused
 */
CCPEnvironment.adopt = function (label) {
  var next = CCPEnvironment.suffixFor(label);
  if (CCPEnvironment.CIN === null) {
    CCPEnvironment.CIN = next;
    return true;
  }
  return CCPEnvironment.CIN === next;
};

/**
 * The kind to put on the wire. Never double-suffixes: a kind that already carries
 * the suffix is returned untouched, because the wire kind read back from a
 * snapshot already has it.
 *
 * An UNKNOWN environment yields the plain kind, the same as a known unsuffixed
 * one. That is not a judgement that the two are the same -- callers must not get
 * this far without known() -- it is this function staying total at the mode 5
 * floor, where a throw inside a guarded observation pass would be swallowed.
 *
 * @param {string|null|undefined} kind the documented kind; null/"" yields ""
 * @returns {string}
 */
CCPEnvironment.suffixKind = function (kind) {
  var suffix;
  if (!kind || !CCPEnvironment.CIN) {
    return kind ? String(kind) : "";
  }
  suffix = "_" + CCPEnvironment.CIN;
  if (CCPUtil.hasSuffix(String(kind).toUpperCase(), suffix.toUpperCase())) {
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
 * @param {string|null|undefined} kind the wire kind; null/"" yields ""
 * @returns {string}
 */
CCPEnvironment.baseKind = function (kind) {
  var suffix, text;
  if (!kind || !CCPEnvironment.CIN) {
    return kind ? String(kind) : "";
  }
  text = String(kind);
  suffix = "_" + CCPEnvironment.CIN;
  if (CCPUtil.hasSuffix(text.toUpperCase(), suffix.toUpperCase())) {
    return text.substring(0, text.length - suffix.length);
  }
  return text;
};
