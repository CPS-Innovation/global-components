/* legacy/shared/preview.js — WHICH PREVIEW FLAGS ARE SET.
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
 *   infra/proxy/config/global-components.cms-augmentation.
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
 * ONE FLAG IS READ: caseLockingCountSelf, through countSelf() below, so Classic
 * and Modern share the one rule rather than each spelling it. The rest are
 * carried, logged and exposed on the console handle only.
 *
 * onChange FIRES WHEN AN ANSWER SETTLES. Both clients redraw only when the roster
 * or the section changes, so without it a flag that arrives after the first draw
 * would not show until something else moved.
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
 *          log: function(...*): void,
 *          onChange: (function(): void|undefined)}} options
 * @returns {{flags: function(): Object, known: function(): boolean,
 *            countSelf: function(): boolean, verboseLogging: function(): boolean,
 *            refresh: function(boolean=): void}}
 */
CCPPreview.createPreview = function (options) {
  var flags = {};
  var known = false;
  var inFlight = false;

  // Guarded: a redraw that throws must not be able to leave the flags half-set or
  // stop the caller's loop, and at document mode 5 a host page's DOM is not ours.
  function changed() {
    if (!options.onChange) {
      return;
    }
    try {
      options.onChange();
    } catch (e) {
      // String(e) gives "Error: boom" for an Error and something readable for a
      // thrown non-Error, without assuming a shape the checker cannot see.
      options.log("preview onChange threw", String(e));
    }
  }

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
    // transport: the callback-name pooling in jsonp.js exists for
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
        changed();
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
      changed();
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
    // Whether the reader is counted among the people on the case. ONLY an explicit
    // true counts them — the web components' rule (shouldCountSelfInCaseLocking),
    // so the three UIs agree. Unknown, failed and unset all read as false, which is
    // the production behaviour: a reader alone on a case sees no stripe at all.
    countSelf: function () {
      return flags.caseLockingCountSelf === true;
    },
    // The web components' verboseLogging flag: the legacy clients echo their log
    // to the console when it is on, so one switch serves all three UIs.
    verboseLogging: function () {
      return flags.verboseLogging === true;
    },
    refresh: refresh
  };
};
