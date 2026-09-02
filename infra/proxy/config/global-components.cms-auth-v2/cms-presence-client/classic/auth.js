/* ============================================================================
 * Concern 2: LOGIN -> AUTH IFRAME SPAWN
 * ----------------------------------------------------------------------------
 * Independent of the logger above. Watches the CMS login flow from the shell and,
 * when the user has just logged in, spawns the hidden /polaris auth iframe once.
 * That flow (the AD round-trip, a SERVER-SIDE part of this solution — NOT in this
 * file) runs on our own (polaris) origin and, in its final callback, stashes the
 * id-token in POLARIS localStorage. The presence JSONP adapter (also polaris-origin)
 * reads it there same-origin — so there is NO cookie / cross-subdomain hand-off to
 * the CMS domain any more; this file just triggers the flow. See memory
 * reference_cms_polaris_xorigin_zone.
 *
 * Trigger: the shell's frameMain leaving uaulLogin.aspx (login -> app edge). It
 * re-fires if the site returns to login and leaves again. The shell boots ~seconds
 * BEFORE login completes, so we must wait for the edge, not fire on boot.
 *
 * IE MODE / DOCUMENT-MODE 5 — same constraints as concern 1 (no JSON, no arrow
 * functions, var + function declarations, no trailing commas).
 * ==========================================================================*/
(function () {
  var BUILD = "spawn1"; // bump on redeploy to confirm fresh bytes are live (cache!)
  var DEBUG = true; // verbose per-tick logging; window.__ccAuthHandover.setDebug(false) to quiet

  // Auth entry. DELIBERATELY RELATIVE — do NOT run this through CCPOrigin.resolve.
  //
  // /polaris-v2 exists to exfiltrate the CMS session cookies from the UI domain to
  // the implementation domain. It can only read those cookies if the browser sends
  // them, which it only does when the request is SAME-ORIGIN with the CMS page.
  // Point this at another host and the capture silently collects nothing: the flow
  // still runs, the AD round trip still succeeds, and the cookie store ends up empty.
  //
  // Crossing to the implementation domain is the SERVER's job, not this line's:
  // handlePolarisV2 redirects to <implementation origin>/init-v2/?cookies=... , with
  // that origin baked in at deploy time. See BUILD_IMPL_ORIGIN in the njs.
  var POLARIS_PATH = "/polaris-v2";
  var LOGIN_FRAGMENT = "uaulLogin.aspx"; // frameMain is "on login" while its URL contains this
  var MAIN_FRAME = "frameMain"; // the shell frame login + app load into

  var WATCH_INTERVAL = 1000; // ms between login-state checks

  var wasOnLogin = false; // login-edge detector state
  var ticks = 0; // watch-loop counter (diagnostic)
  var watchTimer = null; // the poll interval; cleared after the first spawn (single-shot)

  // Enumerate this window's direct child frames (name = url), tolerating
  // cross-origin children (the spawned auth iframe) which throw on access.
  function listFrames() {
    var out = "";
    try {
      var fr = window.frames;
      var i;
      var nm;
      var hrefx;
      for (i = 0; i < fr.length; i++) {
        nm = "#" + i;
        hrefx = "";
        try {
          nm = fr[i].name || "#" + i;
        } catch (e) {
          nm = "#" + i + "(name?)";
        }
        try {
          hrefx = fr[i].location.href || "";
        } catch (e2) {
          hrefx = "(x-origin)";
        }
        out = out + (out ? ", " : "") + nm + "=" + hrefx;
      }
    } catch (e) {
      return "(window.frames unreadable: " + e + ")";
    }
    return out || "(none)";
  }

  // The shell frame that login/app load into. Same-origin; guarded + logged.
  function mainFrameHref() {
    var f;
    try {
      f = window.frames[MAIN_FRAME];
    } catch (e) {
      return "";
    }
    if (!f) {
      return "";
    }
    try {
      return f.location.href || "";
    } catch (e2) {
      return "";
    }
  }

  // Spawn the hidden auth iframe (fire-and-forget) and remove it once it settles.
  // The AD flow runs inside it and its callback stashes the id-token in polaris
  // localStorage; nothing to read back here.
  function spawnIframe() {
    try {
      var f = document.createElement("iframe");
      f.src = POLARIS_PATH;
      f.style.display = "none";
      f.onload = function () {
        try {
          if (f.parentNode) {
            f.parentNode.removeChild(f);
          }
        } catch (e) { }
      };
      document.documentElement.appendChild(f);
    } catch (e) {
    }
  }

  // Fire on the login -> app edge: frameMain WAS on the login page and now isn't.
  function watch() {
    ticks = ticks + 1;
    var href = mainFrameHref();
    var onLogin = href ? href.indexOf(LOGIN_FRAGMENT) !== -1 : false;
    if (!href) {
      return; // can't read frameMain this tick — keep wasOnLogin as-is
    }
    if (wasOnLogin && !onLogin) {
      spawnIframe();
      // SINGLE-SHOT: stop polling after the first spawn — one auth capture per shell
      // (== per website) lifecycle.
      //
      // (a) This is possibly too simplistic. It does NOT handle re-authentication
      //     within the same shell (log out + back in won't re-spawn), and if a shell
      //     ever loads ALREADY authenticated (no login page shown) the edge never
      //     fires — nothing is captured and, since this clear never runs, the poll
      //     keeps going. Today's "full site reload on login" behaviour means fresh
      //     sessions always pass through the login page so the edge does fire; revisit
      //     if that ever changes.
      // (b) A cleaner design would hook the frameMain element's onload event (no
      //     polling at all) and spawn from there. Not done yet because the reliability
      //     of frame onload in this IE-mode frameset has NOT been proved — the poll is
      //     the known-good mechanism for now.
      if (watchTimer) {
        window.clearInterval(watchTimer);
        watchTimer = null;
      }
    }
    wasOnLogin = onLogin;
  }

  // On-demand state dump: window.__ccAuthHandover.debug()
  function debug() {
  }

  function setDebug(v) {
    DEBUG = !!v;
  }

  // Console handles: force a spawn, dump state, or quiet the logging.
  window.__ccAuthHandover = { runNow: spawnIframe, debug: debug, setDebug: setDebug };
  watchTimer = window.setInterval(watch, WATCH_INTERVAL);
})();
