/* legacy/origin.js — "which host serves our endpoints?". SHARED, MODE 5 FLOOR.
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
 * THE FIX: IMPL_ORIGIN, baked in at deploy time.
 * The deploy knows the answer. scripts/deploy.local.sh computes it one line from
 * where it substitutes @@SCRIPT_BASE@@ into the nginx conf, and rewrites the line
 * below in the built bundle when — and only when — the implementation lives on
 * another host (IMPL_ENV != ENV).
 *
 * "" MEANS "SAME ORIGIN AS THE PAGE", and is the correct value for every same-host
 * deploy, which includes every CI deploy: the pipeline has no IMPL_ENV concept and
 * each environment serves its own clients. So the committed default is already
 * right for the common case, and a deploy that fails to substitute degrades to
 * correct-for-same-host rather than to a broken URL. That is the opposite of a
 * placeholder, and deliberately so — see WHY NOT AN ENV VAR below.
 *
 * HOW THIS USED TO WORK, and why it changed (2026-11-04)
 * We used to find our own <script> tag in the host page and take its origin,
 * matching tags on a marker — a distinctive part of our own filename. That derived
 * the right answer with no configuration, but it coupled the client to the filename
 * the nginx conf injects. When the published names moved to
 * cms-augmentation/client-{classic,modern}-unstable.js, every marker became stale,
 * and a marker that matches nothing made resolve() fall back to the host page's
 * origin SILENTLY: indistinguishable from correct in the same-origin proxied
 * estate, quietly wrong the moment anything is cross-domain. A rename could not be
 * made safe, only remembered. Baking the origin removes the coupling instead: the
 * blobs can be renamed, and the "-unstable" suffix dropped, with no code change.
 *
 * WHY NOT document.currentScript: it does not exist at document mode 11, let alone
 * mode 5 — which is why the old scan existed at all. Now moot.
 *
 * WHY NOT AN ENV VAR IN THE NGINX CONF: an undefined ${VAR} is left in the output
 * verbatim by the entrypoint's envsubst, so a missing setting yields a literal
 * "${...}" in the injected src — nginx starts, pages serve, and presence silently
 * never appears. The line below is not that: its default is a working value, not a
 * token, so nothing fails silently when the substitution does not happen.
 */

var CCPOrigin = {};

/* The origin serving our endpoints, or "" for "same origin as the host page".
 * REWRITTEN AT DEPLOY TIME for the cross-domain case — deploy.local.sh matches this
 * line exactly and fails the deploy if it is not found exactly once, so keep the
 * spelling and spacing as they are. */
CCPOrigin.IMPL_ORIGIN = "";

/**
 * An absolute URL for one of our endpoints, on the host that owns them.
 * @param {string} path an absolute path, e.g. "/global-components/presence-jsonp"
 * @returns {string} the absolute URL, or `path` unchanged when we are same-origin
 */
CCPOrigin.resolve = function (path) {
  return CCPOrigin.IMPL_ORIGIN ? CCPOrigin.IMPL_ORIGIN + path : path;
};
