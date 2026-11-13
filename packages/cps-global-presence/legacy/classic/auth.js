/* ============================================================================
 * Concern 2: LOGIN -> AUTH IFRAME SPAWN, AND THE REPLAY THAT KEEPS IT ALIVE
 * ----------------------------------------------------------------------------
 * Independent of the logger above. Watches the CMS login flow from the shell and
 * spawns a hidden auth iframe: once when the user logs in, and again every
 * REPLAY_INTERVAL for as long as the shell lives. That flow (the AD round-trip, a
 * SERVER-SIDE part of this solution — NOT in this file) runs on our own origin and
 * ends by setting the presence cookie, HttpOnly and Path-scoped to our two API
 * routes, which the adapter lifts into an Authorization header. This file only
 * triggers it; nothing is read back here, and nothing can be — see WHY WE CANNOT
 * TELL below.
 *
 * Trigger: the shell's frameMain leaving uaulLogin.aspx (login -> app edge). The
 * shell boots ~seconds BEFORE login completes, so we must wait for the edge rather
 * than fire on boot.
 *
 * WHY A REPLAY AT ALL, added 2026-11-05. The flow has no refresh token to fall back
 * on: it asks AD for the presence audience up front and keeps only the access token
 * that comes back, so there is nothing to exchange later. A fresh token therefore
 * means running the whole silent round trip again — and that is cheap, because
 * prompt=none needs no interaction when the AD session is live. The access token
 * lasts of the order of an hour; the cookie carrying it is currently set to much
 * longer, which has been masking the absence of this replay rather than solving it.
 *
 * THIS ALSO FIXES THE OLD SINGLE-SHOT. The spawn used to stop the poll after the
 * first fire, so re-authenticating inside one shell (log out, log back in) captured
 * nothing. The poll now runs for the life of the shell, so that edge fires every
 * time, and the replay covers the case where the edge never fires at all because
 * the shell loaded already authenticated.
 *
 * WHY WE CANNOT TELL WHETHER IT WORKED, from in here. The silent round trip can
 * fail — an expired AD session, or AADSTS16000 for a user with more than one
 * identity — and a hidden iframe cannot prompt, so it fails invisibly. onload fires
 * either way; the frame ends cross-origin, and at document mode 5 there is no
 * postMessage and no readable contentDocument, so there is no channel out of it.
 * The answer is not to build one: the presence adapter's whoami op reports
 * tokenExpiresIn from the cookie the flow sets, so the question "did it work" is
 * asked of the SERVER, after the fact, by whoever is watching. A replay that is
 * failing shows up there as a number that stops going back up.
 *
 * IE MODE / DOCUMENT-MODE 5 — same constraints as concern 1 (no JSON, no arrow
 * functions, var + function declarations, no trailing commas, and no Date.now).
 * ==========================================================================*/
(function () {
  if (CMS_WATCHDOG_ENABLED !== true) {
    return; // no login watcher, no auth iframe, no __ccAuthHandover handle
  }


  // Auth entry: Polaris's own /init flow (drop2), in its hidden-iframe mode.
  // DELIBERATELY RELATIVE — do NOT run this through CCPOrigin.resolve.
  //
  // /polaris captures the CMS session cookies and hands them to /init, which runs a
  // silent Entra round trip and, because of terminal=iframe, ends by setting the
  // presence cookie (cms-auth-presence-token) on /global-components/presence-jsonp and
  // /global-components/case-locking, then renders a frameable terminal page instead of
  // carrying on to r. It also writes Cms-Session-Hint. The capture only works if the
  // browser sends the CMS cookies, i.e. SAME-ORIGIN with the CMS page; point this at
  // another host and it silently collects nothing.
  //
  // No r: like the CMS P button's plain /polaris links, /init makes one up
  // (/auth-refresh-inbound?<the other args>, Polaris _argsShim), and in iframe mode it
  // is never followed anyway.
  //
  // Replaced /polaris-presence (our namespaced copy of the flow) on 2026-11-09. See
  // Polaris drop2 QUIRKS E8 — this file's replay below is the "re-run every ~55 min"
  // harness it asks for.
  var POLARIS_PATH = "/polaris?terminal=iframe";
  var LOGIN_FRAGMENT = "uaulLogin.aspx"; // frameMain is "on login" while its URL contains this
  var MAIN_FRAME = "frameMain"; // the shell frame login + app load into

  var WATCH_INTERVAL = 1000; // ms between login-state checks

  // How long after a spawn before we replay it.
  //
  // A CONSTANT WITH HEADROOM, not the token's real lifetime, because this file
  // cannot see the token: it is in an HttpOnly cookie. The lifetime is of the order
  // of an hour and is not promised, so 45 minutes leaves room for a 60-minute token
  // and for a replay that fails and has to wait for the next pass. Too eager costs a
  // silent round trip nobody notices; too slow costs presence, which is why the
  // error is on the eager side.
  //
  // THE RIGHT VALUE IS ON THE SERVER, as whoami's tokenExpiresIn, and the intent is
  // for this to be driven from that rather than guessed. It is a constant today so
  // that the replay can be deployed and watched on its own, before anything depends
  // on the number being correct.
  var REPLAY_INTERVAL = 45 * 60 * 1000;

  var wasOnLogin = false; // login-edge detector state
  var ticks = 0; // watch-loop counter (diagnostic)
  var spawns = 0; // how many times we have spawned (diagnostic)
  var watchTimer = null; // the poll interval; runs for the life of the shell
  var lastSpawn = 0; // ms epoch of the last spawn; 0 = never

  // Date.now does not exist at document mode 5 — and check-syntax.js denies the
  // name outright, so it cannot be borrowed either.
  function now() {
    return new Date().getTime();
  }

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
  // The AD flow runs inside it and its callback sets the presence cookie; nothing is
  // read back here, and onload says only "it stopped", not "it worked".
  //
  // lastSpawn is stamped BEFORE the frame is attached, and is stamped even if
  // attaching throws. It is the replay CLOCK, not a record of success: if this fails
  // we want the next attempt one interval away, not one second away on every tick
  // thereafter.
  function spawnIframe() {
    lastSpawn = now();
    spawns = spawns + 1;
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

  // Two reasons to spawn, checked every tick for the life of the shell.
  //
  // THE REPLAY IS CHECKED FIRST, and OUTSIDE the frameMain guard below, on purpose.
  // The token expires on its own schedule whether or not the shell happens to be
  // readable this second; hanging the replay off a successful frame read would let an
  // unreadable shell quietly stop it, which is the failure we are trying to remove
  // rather than relocate.
  //
  // It is gated on lastSpawn being set, so a shell that has never spawned does not
  // start replaying — until the login edge fires there is no session to refresh, and
  // guessing would mean a round trip per interval against nothing.
  function watch() {
    ticks = ticks + 1;

    if (lastSpawn && now() - lastSpawn >= REPLAY_INTERVAL) {
      spawnIframe();
    }

    var href = mainFrameHref();
    var onLogin = href ? href.indexOf(LOGIN_FRAGMENT) !== -1 : false;
    if (!href) {
      return; // can't read frameMain this tick — keep wasOnLogin as-is
    }
    // Fire on the login -> app edge: frameMain WAS on the login page and now isn't.
    //
    // NO LONGER SINGLE-SHOT (changed 2026-11-05). This used to clear the poll after
    // the first spawn, one capture per shell lifecycle, which meant logging out and
    // back in inside the same shell captured nothing. The poll now runs for the life
    // of the shell so the edge fires every time.
    //
    // A cleaner design would hook the frameMain element's onload event and spawn from
    // there, with no polling at all. Still not done: the reliability of frame onload
    // in this IE-mode frameset has never been proved, and the poll is known-good.
    if (wasOnLogin && !onLogin) {
      spawnIframe();
    }
    wasOnLogin = onLogin;
  }

  // On-demand state dump: window.__ccAuthHandover.debug()
  //
  // Returns rather than logs, because the console in this estate is reached through
  // IEChooser and cannot be attached before the tab boots — so a line printed at
  // spawn time is gone by the time anyone can read it. This is how you check the
  // replay is alive; pair it with the adapter's whoami tokenExpiresIn to see whether
  // it is achieving anything.
  function debug() {
    return {
      path: POLARIS_PATH,
      ticks: ticks,
      spawns: spawns,
      wasOnLogin: wasOnLogin,
      mainFrame: mainFrameHref() || "(unreadable)",
      frames: listFrames(),
      replayIntervalMs: REPLAY_INTERVAL,
      // ms until the next replay, or -1 when nothing has spawned yet and the
      // replay clock has therefore not started.
      replayInMs: lastSpawn ? REPLAY_INTERVAL - (now() - lastSpawn) : -1
    };
  }

  // Console handles: force a spawn, or dump state.
  window.__ccAuthHandover = { runNow: spawnIframe, debug: debug };
  watchTimer = window.setInterval(watch, WATCH_INTERVAL);
})();
