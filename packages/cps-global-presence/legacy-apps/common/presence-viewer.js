/* legacy-apps/common/presence-viewer.js — WHO IS READING THIS PAGE.
 * Shared between Classic and Modern/DCF. MODE 5 FLOOR.
 *
 * The legacy clients have no idea who the user is. The presence token is an
 * HttpOnly cookie scoped to the proxy, so the page cannot read it, and nothing
 * else on a CMS page carries the address the presence API reports people under.
 * That is why every roster included the reader: not a bug in the rendering, an
 * absence of the fact.
 *
 * The whoami op closes it. It is the one JSONP op the proxy answers itself rather
 * than forwarding — it decodes the cookie it is already sending as a bearer token
 * and returns the claim, never the token.
 *
 * ASKED ONCE, AND CHEAPLY. The answer cannot change without a new page load, so
 * this caches it and refresh() is a no-op once known. A failed attempt leaves the
 * viewer unknown and the next refresh() tries again — the reconcile timer is
 * already calling it, so a whoami that loses a race with the cookie recovers on
 * the next tick instead of leaving self-filtering off for the session.
 *
 * UNKNOWN MEANS FILTER NOBODY. See CCPPeople.others: showing one person too many
 * beats hiding everyone, so nothing here ever guesses at an identity.
 *
 * IT ALSO CARRIES cmsEnv — which CMS environment this session belongs to, read
 * by the adapter from the Cms-Session-Hint cookie. SINCE 2026-11-04 THE CIN
 * SUFFIX COMES FROM IT, so this is now on the critical path: no registration
 * happens until it has arrived (see CCPEnvironment, and the guards in each
 * main.js). That cost nothing in the end — the observation loop was already
 * re-asserting what it wants every pass, so "not yet" simply means the next
 * pass, and no callback restructure was needed to defer the first create.
 *
 * cmsEnvWhy says which of the empties an empty cmsEnv is: nobody wrote the hint,
 * it is corrupt, the writer could not fill it, or it carried no CMS domain. It
 * drives nothing and exists to be read off a console when presence does not
 * start, because all four look the same from here and want different people.
 */

var CCPViewer = {};

/**
 * How many answered whoami calls to spend waiting for an environment we did not
 * get first time, before accepting that there is not one to get.
 *
 * The identity has always been allowed to arrive late — the reconcile timer is
 * calling refresh() anyway, so a whoami that lost a race with the cookie
 * recovered on the next pass. The environment needs the same grace for the same
 * reason, but it cannot be open-ended: presence does not register without one,
 * so an absent session hint would otherwise mean a whoami every three seconds
 * for as long as the tab is open, forever, to be told the same thing. Ten passes
 * is half a minute, which is a lost race; a minute is a missing cookie.
 */
CCPViewer.ENV_ATTEMPTS = 10;

/**
 * @param {{call: function(string, Object, function(*): void): void,
 *          log: function(...*): void}} options
 * @returns {{email: function(): string, oid: function(): string,
 *            cmsEnv: function(): string, cmsEnvWhy: function(): string,
 *            refresh: function(): void, known: function(): boolean}}
 */
CCPViewer.createViewer = function (options) {
  var email = "";
  var oid = "";
  var cmsEnv = "";
  var cmsEnvWhy = "";
  var envAttempts = 0;
  var inFlight = false;
  // getTime(), not Date.now(): the floor is document mode 5.
  var startedAt = new Date().getTime();

  function sinceStart() {
    return "+" + (new Date().getTime() - startedAt) + "ms";
  }

  // Both facts have to arrive before there is nothing left to ask for. The
  // identity could be left to turn up whenever; the environment is what presence
  // waits on, so it gets a bounded retry of its own rather than the first
  // answer's silence standing for the session.
  function settled() {
    return !!email && (!!cmsEnv || envAttempts >= CCPViewer.ENV_ATTEMPTS);
  }

  function refresh() {
    if (settled() || inFlight) {
      return;
    }
    inFlight = true;
    options.call("whoami", {}, function (data) {
      inFlight = false;
      if (!data) {
        // null is the transport's timeout signal, and JSONP has no error event —
        // so this line is the ONLY evidence that the 8s watchdog fired. Worth
        // separating from a server-side error: gating anything on whoami would
        // pay this wait, and a failure rate is the thing we cannot guess at.
        options.log("whoami timed out", sinceStart());
        return;
      }
      if (data.jsonpError) {
        // Not fatal and not worth shouting about: presence still works, the reader
        // is simply counted among the others until the next attempt.
        options.log("whoami failed", data.jsonpError, sinceStart());
        return;
      }
      email = data.userEmail ? String(data.userEmail) : "";
      oid = data.oid ? String(data.oid) : "";
      cmsEnv = data.cmsEnv ? String(data.cmsEnv) : "";
      cmsEnvWhy = data.cmsEnvWhy ? String(data.cmsEnvWhy) : "";
      if (!cmsEnv) {
        envAttempts = envAttempts + 1;
      }
      options.log(
        "whoami",
        sinceStart(),
        email ? "identified" : "no identity in token",
        // The elapsed time above is how long presence waited to register: this
        // is the value the suffix is built from, and nothing is named until it
        // arrives. An empty one means nothing registers at all, so the reason
        // is on the same line.
        "cmsEnv=" + (cmsEnv ? cmsEnv : "(none)"),
        "why=" + (cmsEnvWhy ? cmsEnvWhy : "(not reported)")
      );
      // Said ONCE, on the pass that stops asking, because this is the line that
      // explains a client which never registered anything at all.
      if (!cmsEnv && envAttempts === CCPViewer.ENV_ATTEMPTS) {
        options.log("no CMS environment after " + envAttempts + " attempts — presence will not register");
      }
    });
  }

  refresh();

  return {
    email: function () {
      return email;
    },
    oid: function () {
      return oid;
    },
    cmsEnv: function () {
      return cmsEnv;
    },
    cmsEnvWhy: function () {
      return cmsEnvWhy;
    },
    known: function () {
      return !!email;
    },
    refresh: refresh
  };
};
