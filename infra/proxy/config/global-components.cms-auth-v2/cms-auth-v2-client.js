/* frame-lister.js
 * Every 10 seconds, walks every frame/iframe through all levels of nested
 * framesets and logs the ones whose path matches a maintained fragment list.
 *
 * The domain and the first path chunk are stripped before matching/logging:
 *   https://polaris-qa-notprod.cps.gov.uk/CMS.24.0.01/User/uaccContactDetails.aspx?x
 *   ->  /User/uaccContactDetails.aspx?x
 * (Stripping is generic — scheme + host + first segment — so it is not tied to
 * a particular environment host or CMS version.) A frame is only logged if that
 * remaining path contains one of FRAGMENTS.
 *
 * Written for IE mode / document mode 5 (IE event model only, no modern JS; no
 * Array.indexOf, so membership is a manual loop). Assumes all frames are
 * same-origin with the host page.
 *
 * Leak-safe: takes no persistent references to DOM elements. Each pass walks
 * window.frames with locals only, so nothing is retained between runs. The
 * one timer is cleared on page unload.
 */
(function () {
  var MAXDEPTH = 64; // insurance against pathological nesting
  var INTERVAL = 10000; // ms between snapshots

  // Path fragments of interest. A frame is logged only if its path (after the
  // domain + first chunk are stripped) contains one of these. Maintain this list.
  var FRAGMENTS = ["uaccContactDetails.aspx"];

  var timer;

  function log(msg) {
    if (typeof console !== "undefined" && console.log) {
      console.log(msg);
    }
  }

  // Strip scheme + host + first path segment, returning the rest (path + query).
  // Returns "" if there is nothing after the first chunk (or no path at all).
  //   https://host/CMS.24.0.01/User/foo.aspx?x  ->  /User/foo.aspx?x
  function stripPrefix(url) {
    var s = url,
      scheme = s.indexOf("://"),
      slash,
      next;
    if (scheme !== -1) {
      s = s.substring(scheme + 3); // drop "scheme://"
    }
    slash = s.indexOf("/"); // first slash ends the host
    if (slash === -1) {
      return "";
    }
    s = s.substring(slash); // "/CMS.24.0.01/User/foo.aspx?x"
    next = s.indexOf("/", 1); // slash after the first path chunk
    if (next === -1) {
      return "";
    }
    return s.substring(next); // "/User/foo.aspx?x"
  }

  // Manual membership test (Array.indexOf is absent in document mode 5).
  function matchesFragment(path) {
    var i;
    for (i = 0; i < FRAGMENTS.length; i++) {
      if (path.indexOf(FRAGMENTS[i]) !== -1) {
        return true;
      }
    }
    return false;
  }

  // Walk the frame tree from a given window, collecting { depth, url } for the
  // frames whose stripped path matches FRAGMENTS. Recurses into every frame.
  function listFrames(win, depth, out) {
    win = win || window;
    depth = depth || 0;
    out = out || [];
    if (depth > MAXDEPTH) {
      return out;
    }

    var frames = win.frames,
      i,
      url,
      rest;
    for (i = 0; i < frames.length; i++) {
      url = "(unreadable)";
      try {
        url = frames[i].location.href;
      } catch (e) {} // same-origin: reads real URL
      rest = stripPrefix(url);
      if (rest && matchesFragment(rest)) {
        out[out.length] = { depth: depth, url: rest };
      }
      listFrames(frames[i], depth + 1, out); // recurse into this frame
    }
    return out;
  }

  function snapshot() {
    var out = listFrames(),
      i;
    if (out.length === 0) {
      return; // nothing of interest — stay quiet
    }
    log("--- frame snapshot ---");
    for (i = 0; i < out.length; i++) {
      log(Array(out[i].depth + 1).join("  ") + out[i].url); // indent by depth
    }
  }

  function start() {
    if (timer) {
      return;
    } // already running
    snapshot(); // fire once immediately
    timer = window.setInterval(snapshot, INTERVAL);
  }

  function stop() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  // Expose start/stop/snapshot so you can drive it from the console if needed.
  window.__frameLister = { start: start, stop: stop, snapshot: snapshot };

  // Clean up the timer when the page unloads.
  window.attachEvent("onunload", stop);

  start();
})();
