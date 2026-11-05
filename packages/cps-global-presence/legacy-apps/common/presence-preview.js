/* legacy-apps/common/presence-preview.js — WHICH PREVIEW FLAGS ARE SET.
 * Shared between Classic and Modern/DCF. MODE 5 FLOOR.
 *
 * The preview page lets a developer turn features on for themselves. It writes a
 * cookie, and the web components read that cookie over a plain fetch, which works
 * because they run in Edge.
 *
 * NEITHER OF THOSE THINGS IS TRUE HERE. Edge and IE mode keep SEPARATE cookie
 * jars, so the cookie the preview page wrote was never in the jar these clients
 * read — the preview page's own saves are invisible from CMS no matter how they
 * are fetched. And the IE "access data sources across domains" zone (setting
 * 1406) forbids cross-origin XHR in this estate, so there is no fetch to make
 * anyway.
 *
 * So both halves are solved somewhere else, and this module is only the client
 * end of them:
 *
 *   THE WRITE is a NAVIGATION, from the preview page's "Copy these settings to
 *   CMS" button through /global-components/state/preview?set=... The engine is
 *   chosen by an X-InternetExplorerMode response header on a top-level document
 *   load — no fetch can do it, and an iframe cannot change its own mode — so the
 *   route visits BOTH engines, one cookie per pass. See handleStatePreview in
 *   infra/proxy/config/global-components.cms-auth-presence.
 *
 *   THE READ is JSONP, on that same path with ?callback=. <script src> is not
 *   gated by zone 1406, which is the same reason presence talks JSONP at all. It
 *   earns a second keep here: a JSONP body is EVALUATED rather than parsed, so
 *   this file receives a real object. Document mode 5 has no JSON, and a
 *   mode-5-safe parser measured 742 bytes gzipped — this costs nothing.
 *
 * ASKED ONCE, AND CHEAPLY, like CCPViewer: preview flags cannot change without
 * the navigation above, which reloads the page anyway. A failed attempt leaves
 * the flags unknown and the next refresh() tries again.
 *
 * UNKNOWN MEANS EVERYTHING OFF. An absent cookie, a timeout and a corrupt cookie
 * are all reported the same way and all read as "no preview" — the shipped
 * behaviour. A preview flag turning something ON by accident because a call
 * failed would be the worse direction by far.
 *
 * NOTHING READS THIS YET. It is carried, logged and exposed on the console
 * handle so the chain can be seen working end to end before anything depends on
 * it; what the flags should gate is a separate decision from whether they
 * arrive.
 *
 * ONE LIMIT WORTH KNOWING. The cookie is written HOST-ONLY, on whichever host
 * serves the preview page, and read on whichever host CCPOrigin.resolve points
 * at. Those agree in the proxied estate (the CMS page and our endpoints are the
 * same host) and in every same-host deploy. They do NOT agree when a deploy
 * points the clients at another environment's implementation (IMPL_ENV != ENV),
 * and there the read returns nothing rather than something wrong.
 */

var CCPPreview = {};

/**
 * @param {{call: function(string, Object, function(*): void): void,
 *          log: function(...*): void}} options
 * @returns {{flags: function(): Object, known: function(): boolean,
 *            refresh: function(boolean=): void}}
 */
CCPPreview.createPreview = function (options) {
  var flags = {};
  var known = false;
  var inFlight = false;

  /**
   * Ask for the preview state, unless it is already known or a call is out.
   *
   * @param {boolean} [force] ask again even once known
   */
  function refresh(force) {
    if ((known && !force) || inFlight) {
      return;
    }
    inFlight = true;
    // op and appName are sent by the shared transport and IGNORED by this route,
    // which keys only on `callback`. Harmless, and much cheaper than a second
    // transport: the callback-name pooling in presence-jsonp.js exists for
    // reasons particular to document mode 5 (a window expando can be neither
    // deleted nor cleared there) and is not worth reimplementing to save two
    // query parameters.
    options.call("preview", {}, function (data) {
      inFlight = false;
      if (!data) {
        // null is either the transport's timeout signal OR the route's honest
        // answer that no preview is set — the body is literally `cb(null)`.
        // Indistinguishable from here, and deliberately not worth
        // distinguishing: both mean "no preview", which is the shipped
        // behaviour. Logged as one line rather than guessed at.
        known = true;
        flags = {};
        options.log("preview none");
        return;
      }
      if (data.jsonpError) {
        options.log("preview failed", data.jsonpError);
        return;
      }
      known = true;
      flags = data;
      // The names only. Values are booleans and two short enums, so the names
      // are the interesting part, and a list reads better in IEChooser's console
      // than a nested object does.
      var names = [];
      var key;
      for (key in data) {
        if (data.hasOwnProperty(key)) {
          names.push(key);
        }
      }
      options.log("preview", names.length ? names.join(",") : "(empty)");
    });
  }

  refresh();

  return {
    flags: function () {
      return flags;
    },
    known: function () {
      return known;
    },
    refresh: refresh
  };
};
