/* platform/platform.js — what every feature stands on. MODE 5 FLOOR.
 *
 * One of these per page: the log, the JSONP callers, who the reader is (whoami),
 * the preview flags and the named gates. It knows nothing about any feature, and
 * nothing in here depends on features/.
 *
 * Creating it reads the preview flags straight away. whoami is asked by refresh(),
 * which the launcher calls at the start of every pass.
 *
 * inRollout() IS THE ENTRA ROLLOUT'S ONE RULE. Polaris's /init decides who is in it
 * and whoami reports the answer. A reader /init said no to has no presence token and
 * no groups, so only an explicit false counts as outside: null is "not known yet"
 * (or a Polaris without the flag) and changes nothing.
 */

var CCPPlatform = {};

CCPPlatform.JSONP_PATH = "/global-components/presence-jsonp";
// The preview flags are read on the path their cookie is scoped to, which is not
// the presence adapter's.
CCPPlatform.PREVIEW_PATH = "/global-components/state/preview";
CCPPlatform.TIMEOUT_MS = 8000; // per JSONP call

/**
 * @param {{appName: string}} o
 *   appName  sent with every call; the adapter defaults a missing one to "CMS Classic"
 */
CCPPlatform.createPlatform = function (o) {
  // Silent on the console unless asked (verboseLogging, or setConsole on a handle):
  // the page is someone else's, and Classic's is an old document mode.
  var logBuffer = CCPLog.createLog({ prefix: "[cc-presence]", echo: false });
  var log = logBuffer.log;
  var base = CCPOrigin.resolve(CCPPlatform.JSONP_PATH);
  /** @type {Array<function(): void>} */
  var previewListeners = [];

  var call = CCPJsonp.createJsonp({ base: base, appName: o.appName, timeoutMs: CCPPlatform.TIMEOUT_MS, log: log });
  var viewer = CCPViewer.createViewer({ call: call, log: log });
  // CCP_CONFIG is emitted at the top of every legacy bundle (platform/config.js);
  // typeof guards a load that left it out, which then simply has no gates.
  var gates = CCPGates.createGates({
    definitions: typeof CCP_CONFIG !== "undefined" && CCP_CONFIG.gates ? CCP_CONFIG.gates : {},
    viewer: viewer
  });
  // A second caller, so its callback names need their own prefix: two callers
  // sharing one would overwrite each other's window properties.
  var preview = CCPPreview.createPreview({
    call: CCPJsonp.createJsonp({
      base: CCPOrigin.resolve(CCPPlatform.PREVIEW_PATH),
      appName: o.appName,
      timeoutMs: CCPPlatform.TIMEOUT_MS,
      namePrefix: "__ccpp_",
      log: log
    }),
    log: log,
    onChange: function () {
      var i;
      if (preview && preview.verboseLogging()) {
        logBuffer.setEcho(true);
      }
      for (i = 0; i < previewListeners.length; i++) {
        previewListeners[i]();
      }
    }
  });

  return {
    appName: o.appName,
    base: base,
    log: log,
    logBuffer: logBuffer,
    call: call,
    viewer: viewer,
    gates: gates,
    preview: preview,

    /** @returns {boolean} false only when /init explicitly said no (see the header) */
    inRollout: function () {
      return viewer.entraEnabled() !== false;
    },

    /** @param {function(): void} listener  runs whenever a preview answer settles */
    onPreviewChange: function (listener) {
      previewListeners.push(listener);
    },

    refresh: function () {
      viewer.refresh();
    },

    // Who the reader is, for the console handles. The log masks addresses; this does not.
    whoami: function () {
      return {
        email: viewer.email(),
        oid: viewer.oid(),
        known: viewer.known(),
        cmsEnv: viewer.cmsEnv(),
        // Which kind of empty an empty cmsEnv is.
        cmsEnvWhy: viewer.cmsEnvWhy(),
        // Seconds since the presence token was issued: the one to read to see
        // whether Classic's auth replay is working (Modern rides its cookie).
        tokenAge: viewer.tokenAge(),
        tokenExpiresIn: viewer.tokenExpiresIn(),
        claimKeys: viewer.claimKeys(),
        groups: viewer.groups(),
        // Whether an empty list is the truth ("cookie") or a reason there were none.
        groupsFrom: viewer.groupsFrom(),
        // In the Entra rollout (Polaris /init's decision): true, false or null (unknown).
        entraEnabled: viewer.entraEnabled(),
        // The LEGACY_UI gates open for the reader (before the rollout and preview).
        gatesOpen: gates.openNames()
      };
    }
  };
};
