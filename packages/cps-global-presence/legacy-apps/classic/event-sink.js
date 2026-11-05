/* classic/event-sink.js — the contact-edit event seam. CLASSIC ONLY.
 *
 * Separate from presence on purpose: presence is "who is in this section", while
 * these events are "this contact's edit panel just opened / closed" — a finer
 * signal, keyed on more than the section id, and the reason the original script
 * existed at all.
 *
 * The HTTP helpers below are still not called. They are the documented route to
 * posting events to an endpoint (set ENDPOINT_URL, uncomment one line in
 * sendEvent) and are kept exactly as they were.
 */

/* ===================================================================
 * OUTPUT SINK — THE ONE PLACE TO CHANGE TO CALL AN ENDPOINT
 * -------------------------------------------------------------------
 * sendEvent() is the single funnel for every event this script produces.
 * It is called exactly twice in the code below (once for "editing", once
 * for "closed"), so changing it changes all reporting.
 *
 * TO START CALLING AN ENDPOINT:
 *   1. set ENDPOINT_URL below (keep it a SAME-ORIGIN relative path)
 *   2. uncomment the postEvent(kind, rec) line inside sendEvent()
 * Nothing else in this file needs to change. postEvent() is written and
 * ready — it just isn't called.
 *
 * Constraints that shaped the helpers (IE mode / document-mode 5):
 *   - No JSON object, so the body is form-encoded by hand, not stringified.
 *   - XMLHttpRequest may be absent; ActiveXObject is the fallback.
 *   - Keep ENDPOINT_URL same-origin, AND under one of the two paths the
 *     presence cookie is scoped to — that cookie is now what authenticates
 *     the call (see postEvent). Old IE needs XDomainRequest for cross-origin
 *     and cannot set request headers on it, so cross-origin was never an
 *     option here either way.
 *   - The "closed" fired from shutdown() happens during unload, where an
 *     async request may be cancelled by the browser (there is no
 *     sendBeacon here). Treat "closed" as best-effort and rely on a
 *     server-side TTL — see the note in the file header.
 * =================================================================== */

var ENDPOINT_URL = ""; // e.g. "/global-components/case-locking/api/cms-contact-view"

// THE SINK. kind is "editing" | "closed"; rec is
// { key, caseId, personId, recorderId, name, role }.
function sendEvent(kind, rec) {
  // Presence is NOT driven from here any more. It follows the sections the
  // locator reports, which is a broader question than "is a contact panel open"
  // — a user can be present on a case with no panel open at all. See main.js.

  // postEvent(kind, rec);   // <-- UNCOMMENT to POST (set ENDPOINT_URL first)

  // Runtime seam: lets a consumer hook in without editing this file.
  // Fully isolated — anything it throws is swallowed and cannot affect CMS.
  var api = window.__ccContactLogger;
  if (api && typeof api.onChange === "function") {
    try {
      api.onChange(kind, rec);
    } catch (e) { }
  }
}

function describe(rec) {
  var msg = "caseId=" + (rec.caseId || "-");
  msg = msg + " personId=" + rec.personId;
  msg = msg + " contactRecorderId=" + (rec.recorderId || "-");
  msg = msg + ' name="' + rec.name + '"';
  if (rec.role) {
    msg = msg + " role=" + rec.role;
  }
  return msg;
}


// ---- HTTP helpers (ready to use; only called if you uncomment above) ----

function newXhr() {
  try {
    if (typeof XMLHttpRequest !== "undefined") {
      return new XMLHttpRequest();
    }
  } catch (e) { }
  try {
    return new ActiveXObject("Microsoft.XMLHTTP");
  } catch (e) { }
  return null;
}

// Form-encoded by hand: there is no JSON object in document-mode 5.
function encodeEvent(kind, rec) {
  var b = "event=" + encodeURIComponent(kind);
  b = b + "&caseId=" + encodeURIComponent(rec.caseId || "");
  b = b + "&personId=" + encodeURIComponent(rec.personId || "");
  b = b + "&contactRecorderId=" + encodeURIComponent(rec.recorderId || "");
  b = b + "&role=" + encodeURIComponent(rec.role || "");
  b = b + "&name=" + encodeURIComponent(rec.name || "");
  return b;
}

// Fire-and-forget POST. Never throws, never blocks, ignores the response.
function postEvent(kind, rec) {
  if (!ENDPOINT_URL) {
    return;
  }
  var xhr = newXhr();
  if (!xhr) {
    return;
  }
  try {
    xhr.open("POST", ENDPOINT_URL, true); // async
    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    // NO Authorization HEADER, deliberately (changed 2026-11-05). This used to read
    // an id token out of localStorage and set it by hand. The credential now travels
    // as the HttpOnly presence cookie the auth callback sets, Path-scoped to
    // /global-components/presence-jsonp and /global-components/case-locking, which
    // the proxy lifts into an Authorization header on the way upstream.
    //
    // So KEEP ENDPOINT_URL UNDER ONE OF THOSE TWO PATHS (the example above is) and
    // the call is authenticated with no work here. A path outside them gets no
    // cookie, and this file cannot fix that: the cookie is HttpOnly, so there is
    // nothing for script to read and re-send.
    xhr.send(encodeEvent(kind, rec));
  } catch (e) { }
}

