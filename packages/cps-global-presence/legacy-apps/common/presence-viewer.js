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
 */

var CCPViewer = {};

/**
 * @param {{call: function(string, Object, function(*): void): void,
 *          log: function(...*): void}} options
 * @returns {{email: function(): string, oid: function(): string,
 *            refresh: function(): void, known: function(): boolean}}
 */
CCPViewer.createViewer = function (options) {
  var email = "";
  var oid = "";
  var inFlight = false;

  function refresh() {
    if (email || inFlight) {
      return;
    }
    inFlight = true;
    options.call("whoami", {}, function (data) {
      inFlight = false;
      if (!data || data.jsonpError) {
        // Not fatal and not worth shouting about: presence still works, the reader
        // is simply counted among the others until the next attempt.
        options.log("whoami failed", data && data.jsonpError);
        return;
      }
      email = data.userEmail ? String(data.userEmail) : "";
      oid = data.oid ? String(data.oid) : "";
      options.log("whoami", email ? "identified" : "no identity in token");
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
    known: function () {
      return !!email;
    },
    refresh: refresh
  };
};
