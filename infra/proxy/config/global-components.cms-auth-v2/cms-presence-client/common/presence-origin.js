/* common/presence-origin.js — "which host serves our endpoints?". SHARED, MODE 5 FLOOR.
 *
 * THE PROBLEM THIS SOLVES
 * A relative URL in an injected script resolves against the DOCUMENT, not against
 * the script. So "/global-components/presence-jsonp" written in a file that was
 * fetched from polaris-uat-notprod, but injected into a CMS page served by
 * polaris-qa-notprod, resolves to QA — the host page's origin — and the call goes
 * to the wrong box. Serving the script from elsewhere changes nothing; the page
 * decides.
 *
 * That matters as soon as the UI and our endpoints are on different hosts, which
 * is the production position: CMS on one domain, our login flow / library / API on
 * another. It also matters for the auth flow specifically, because the callback
 * sets the presence cookie HOST-ONLY — so the auth iframe must land on the same
 * host as the API, or the adapter never sees the cookie.
 *
 * THE FIX
 * Find our own <script> tag and take ITS origin: by definition the host that
 * served us, which is the host that owns our endpoints. Falls back to the relative
 * path, which is correct whenever page and endpoints share an origin (the proxied
 * estate) and is what every caller wants when the tag cannot be found.
 *
 * WHY NOT document.currentScript: it does not exist at document mode 11, let alone
 * mode 5. The scan is the portable answer.
 *
 * WHY NOT AN ENV VAR IN THE NGINX CONF: an undefined ${VAR} is left in the output
 * verbatim by the entrypoint's envsubst, so a missing setting yields a literal
 * "${...}" in the injected src — nginx starts, pages serve, and presence silently
 * never appears. Deriving it needs no configuration at all.
 */

var CCPOrigin = {};

/**
 * The origin of the <script> tag whose src contains `marker`.
 * @param {string} marker a distinctive part of our own script's filename
 * @returns {string} e.g. "https://polaris-uat-notprod.cps.gov.uk", or "" if not found
 */
CCPOrigin.scriptOrigin = function (marker) {
  var scripts, i, src, match;
  try {
    scripts = document.getElementsByTagName("script");
    for (i = 0; i < scripts.length; i++) {
      src = scripts[i].src ? String(scripts[i].src) : "";
      if (src.indexOf(marker) !== -1) {
        match = /^(https?:\/\/[^/]+)/.exec(src);
        if (match) {
          return match[1];
        }
      }
    }
  } catch (e) {
    // a hostile or unusual DOM must not stop the client loading
  }
  return "";
};

/**
 * An absolute URL for one of our endpoints, on whichever host served this script.
 * @param {string} marker a distinctive part of our own script's filename
 * @param {string} path an absolute path, e.g. "/global-components/presence-jsonp"
 * @returns {string} the absolute URL, or `path` unchanged when the tag is not found
 */
CCPOrigin.resolve = function (marker, path) {
  var origin = CCPOrigin.scriptOrigin(marker);
  return origin ? origin + path : path;
};
