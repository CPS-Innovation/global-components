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
 * by the adapter from the Cms-Session-Hint cookie. NOTHING DEPENDS ON IT YET.
 * It is logged, with the elapsed time, to answer one question: registration is
 * synchronous at boot and sectionId travels on create, the first op out, so a
 * value that arrives with whoami arrives too late to build a sectionId from.
 * Deferring that first create would mean a callback restructure (no await at
 * this floor — Promise is banned) and, on failure, the 8s JSONP watchdog rather
 * than an error. The log says what that would really cost before anyone pays it.
 */

var CCPViewer = {};

/**
 * @param {{call: function(string, Object, function(*): void): void,
 *          log: function(...*): void}} options
 * @returns {{email: function(): string, oid: function(): string,
 *            cmsEnv: function(): string, refresh: function(): void,
 *            known: function(): boolean}}
 */
CCPViewer.createViewer = function (options) {
  var email = "";
  var oid = "";
  var cmsEnv = "";
  var inFlight = false;
  // getTime(), not Date.now(): the floor is document mode 5.
  var startedAt = new Date().getTime();

  function sinceStart() {
    return "+" + (new Date().getTime() - startedAt) + "ms";
  }

  function refresh() {
    if (email || inFlight) {
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
      options.log(
        "whoami",
        sinceStart(),
        email ? "identified" : "no identity in token",
        // Any non-zero elapsed above means create has already gone out, so this
        // is what the suffix WOULD have been, not what it was.
        "cmsEnv=" + (cmsEnv ? cmsEnv : "(none — no session hint cookie)")
      );
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
    known: function () {
      return !!email;
    },
    refresh: refresh
  };
};
