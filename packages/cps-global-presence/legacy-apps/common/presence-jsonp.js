/* common/presence-jsonp.js — the JSONP transport. SHARED, DOCUMENT MODE 5 FLOOR.
 *
 * <script src> is not gated by the IE cross-origin XHR zone (setting 1406), which
 * is why both legacy clients talk to the presence API this way. The njs adapter
 * (handlePresenceJsonp) turns each GET into the backend's real REST call, lifts
 * the bearer from the presence cookie, and adds X-Watchdog-App-Name — so neither
 * client carries a credential.
 *
 * CALLBACK NAMES ARE POOLED. They must be top-level window properties (the
 * adapter reflects the name verbatim and rejects anything but a bare identifier).
 * At document mode 5 a window expando can be NEITHER deleted (no delete) NOR
 * cleared (assigning undefined leaves the key), so minting a fresh name per call
 * would leak one dead __ccpj_N key on every tick, forever. Reusing names from a
 * free pool bounds the live key count by peak concurrency instead of by uptime.
 * Mode 11 could just delete — but shared code runs at the floor, and the pool
 * costs it nothing.
 */

/**
 * window[name] = value, spelled out because TypeScript objects otherwise: the DOM
 * lib types a string index on Window as a named frame, not an arbitrary value.
 * JSONP callbacks MUST be real top-level globals — the njs adapter reflects the
 * name verbatim and rejects anything but a bare identifier — so this is a
 * deliberate use of the global namespace, not an accident.
 * @param {string} name
 * @param {*} value
 */
function setGlobalCallback(name, value) {
  /** @type {*} */ (window)[name] = value;
}

var CCPJsonp = {};

/**
 * Build the JSONP caller. Returns call(op, params, onData); onData receives the
 * executed object/array, or null when the call timed out.
 * @param {{base: string, appName: string, timeoutMs?: number, log?: function(...*): void}} options
 * @returns {function(string, Object, function(*): void): void}
 */
CCPJsonp.createJsonp = function (options) {
  var base = options.base;
  var appName = options.appName;
  var timeoutMs = options.timeoutMs ? options.timeoutMs : 8000;
  var log = options.log ? options.log : function () {};

  var seq = 0;
  var freeNames = [];

  function acquireName() {
    var n = freeNames.length;
    var name;
    if (n > 0) {
      name = freeNames[n - 1];
      freeNames.length = n - 1;
      return name;
    }
    return "__ccpj_" + seq;
  }

  // Park a shared no-op in a freed slot: a straggler response that fires after
  // cleanup harmlessly calls this instead of a stale per-call handler.
  function noop() {}

  // call(op, params, onData) — onData receives the executed object/array, or null
  // when the call timed out. JSONP has no error event, hence the watchdog.
  return function (op, params, onData) {
    seq = seq + 1;
    var name = acquireName();
    var done = false;
    var script = null;
    var timer = null;

    function cleanup() {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      setGlobalCallback(name, noop);
      freeNames.push(name);
      try {
        if (script && script.parentNode) {
          script.parentNode.removeChild(script);
        }
      } catch (e) {
        // the tag is inert either way
      }
    }

    setGlobalCallback(name, function (data) {
      if (done) {
        return;
      }
      done = true;
      cleanup();
      onData(data);
    });

    var url = base + "?op=" + encodeURIComponent(op);
    var key;
    for (key in params) {
      if (params.hasOwnProperty(key)) {
        url = url + "&" + key + "=" + encodeURIComponent(params[key]);
      }
    }
    // MUST be sent: the adapter defaults a missing appName to "CMS Classic".
    url = url + "&appName=" + encodeURIComponent(appName);
    url = url + "&callback=" + name + "&_=" + seq;

    timer = window.setTimeout(function () {
      if (done) {
        return;
      }
      done = true;
      cleanup();
      log("jsonp timeout", op);
      onData(null);
    }, timeoutMs);

    try {
      script = document.createElement("script");
      script.type = "text/javascript";
      script.src = url;
      document.documentElement.appendChild(script);
    } catch (e2) {
      if (!done) {
        done = true;
        cleanup();
        onData(null);
      }
    }
  };
};
