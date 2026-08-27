/* modern/context.js — which app, which case, which section. MODERN/DCF ONLY.
 *
 * App-specific by nature: Classic reads its section from CMS frame state, we read
 * ours from the URL. Document mode 11, so ES5 is the floor here rather than ES3.
 */

// DCF:    /dcf/review/<caseId>/<userGuid>?wid=MASTER
// Modern: /viewer/landing#/case-summary/<caseId>/<userGuid>
//         /viewer/landing#/disclosure/<caseId>/...
// Modern's caseId lives in the hash, which never reaches the server — here is the
// only place it can be read.
function readContext() {
  var path = String(window.location.pathname || "");
  var hash = String(window.location.hash || "");
  var match;

  match = /^\/dcf\/([^/]+)\/(\d+)/.exec(path);
  if (match) {
    return { app: "DCF", screen: match[1], caseId: match[2], kind: "CASE_REVIEW" };
  }

  if (path.indexOf("/viewer/") === 0) {
    match = /^#\/([^/?]+)\/(\d+)/.exec(hash);
    if (match) {
      return { app: "CMS Modern", screen: match[1], caseId: match[2], kind: "CASE" };
    }
    return { app: "CMS Modern", screen: hash.replace(/^#\//, "") || "landing", caseId: null, kind: null };
  }

  return { app: null, screen: null, caseId: null, kind: null };
}

function sectionIdForContext(context) {
  return CCPSections.sectionId(context.caseId, context.kind);
}

// Where our endpoints live. See CCPOrigin — a relative path would resolve against
// the HOST PAGE, which is the wrong box as soon as the UI and our endpoints are on
// different domains.
function resolveJsonpBase(jsonpPath) {
  return CCPOrigin.resolve("cms-presence-client.js", jsonpPath);
}
