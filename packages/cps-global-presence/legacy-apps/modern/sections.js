/* modern/sections.js — which sections CMS Modern and DCF are showing. MODERN/DCF ONLY.
 *
 * These two apps are the easy case: the address IS the context. In DCF you are
 * reviewing a case; in the viewer you are on one. There is no frame state to
 * interrogate and nothing to observe — so every detector here is a URL pattern,
 * and the whole file is a list of them.
 *
 * Contrast Classic, whose sections live in nested frames and hidden fields, and
 * which therefore needs detectors that read live DOM. Both feed the same
 * CCPLocator and produce the same section shape; only the finding differs.
 *
 * TO SUPPORT A NEW SECTION: add a detector to the list. If it can be recognised
 * from the URL, that is all there is to it.
 */

// DCF:    /dcf/review/<caseId>/<userGuid>?wid=MASTER
// Modern: /viewer/landing#/case-summary/<caseId>/<userGuid>
//         /viewer/landing#/disclosure/<caseId>
//
// Modern's caseId lives in the HASH, which never reaches the server — the page is
// the only place it can be read. The screen segment is deliberately not
// enumerated: every viewer screen that names a case is a view OF that case, so a
// new one starts reporting presence without a code change.
var MODERN_DETECTORS = [
  CCPLocator.urlDetector({
    kind: "CASE_REVIEW",
    pattern: /\/dcf\/[^/]+\/(\d+)/,
    hint: { app: "DCF" }
  }),
  CCPLocator.urlDetector({
    kind: "CASE",
    pattern: /\/viewer\/[^#]*#\/[^/?]+\/(\d+)/,
    hint: { app: "CMS Modern" }
  })
];

var modernLocator = CCPLocator.createLocator(MODERN_DETECTORS);

function currentUrl() {
  return String(window.location.href || "");
}

/** Every section the current address puts us in. */
function activeSections() {
  return modernLocator.list(currentUrl());
}

/** The same, as ids — what the session layer wants. */
function activeSectionIds() {
  return modernLocator.ids(currentUrl());
}

// Diagnostics only: which app and screen we think we are on, including the cases
// where that yields no section at all (the dashboard, the bare landing page).
// Nothing depends on this — it exists so a console can answer "why no presence?".
function describeLocation() {
  var path = String(window.location.pathname || "");
  var hash = String(window.location.hash || "");
  var match = /^\/dcf\/([^/]+)/.exec(path);
  if (match) {
    return { app: "DCF", screen: match[1] };
  }
  if (path.indexOf("/viewer/") === 0) {
    return { app: "CMS Modern", screen: hash.replace(/^#\//, "") || "landing" };
  }
  return { app: null, screen: null };
}

// Where our endpoints live. See CCPOrigin — a relative path would resolve against
// the HOST PAGE, which is the wrong box as soon as the UI and our endpoints are on
// different domains.
function resolveJsonpBase(jsonpPath) {
  return CCPOrigin.resolve("cms-presence-client.js", jsonpPath);
}
