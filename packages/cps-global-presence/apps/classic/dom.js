/* apps/classic/dom.js — reading CMS's own state. CLASSIC ONLY, DOCUMENT MODE 5.
 *
 * PURE OBSERVATION. Nothing here wraps, patches or assigns to any CMS function or
 * variable: the detectors read hidden fields, page globals and frame URLs, and
 * that is all. It cannot change CMS behaviour, which is the whole licence for
 * running inside someone else's application.
 *
 * Document mode 5 is why these exist at all — no querySelector, no
 * URL/URLSearchParams, no String.trim.
 */

// How deep to recurse into nested frames before giving up. CMS nests several
// levels; this is a guard against a cycle, not a real limit.
var MAXDEPTH = 64;


function trim(s) {
  return String(s == null ? "" : s).replace(/^\s+|\s+$/g, "");
}

// Resolve a hidden field by id, tolerating document-mode-5 quirks.
function getEl(win, id) {
  var d = win.document;
  var el = null;
  if (d.getElementById) {
    el = d.getElementById(id);
  }
  if (!el && d.all) {
    el = d.all[id];
  }
  return el;
}

function fieldVal(win, id) {
  var el = getEl(win, id);
  return el ? el.value : "";
}

// Split a CSV hidden field the same way the page does, when we can.
function splitCsv(win, s) {
  try {
    if (typeof win.trimAndSplit === "function") {
      return win.trimAndSplit(s);
    }
  } catch (e) { }
  return String(s == null ? "" : s).split(",");
}

// Reproduce customClickedRow's row->slot-index math from the selected row.
// Pinned to CMS 24.0.01's victim/witness/alt-contact layout (3 slots each).
function indexForRow(win, row) {
  if (!row) {
    return -1;
  }
  var types = splitCsv(win, fieldVal(win, "hidContactType"));
  var nDef = 0;
  var nVic = 0;
  var i;
  for (i = 0; i < types.length; i++) {
    if (types[i] === "Def") {
      nDef++;
    } else if (types[i] === "Victim") {
      nVic++;
    }
  }
  var r = row.rowIndex;
  if (row.ContactType === "Victim") {
    return (r - 1) * 3 + nDef;
  }
  return (nVic + r - 1) * 3 + nDef;
}

// Extract a query-string parameter from a URL string. document-mode 5 has no
// URL / URLSearchParams, so we split by hand. Returns "" when the param is absent
// (and tolerates a value that fails to decode). Matching is case-sensitive, so the
// caller must pass the exact CMS param name (e.g. "intCaseID").
function queryParam(url, name) {
  if (!url) { return ""; }
  var q = url.indexOf("?");
  if (q < 0) { return ""; }
  var qs = url.substring(q + 1);
  var hash = qs.indexOf("#");
  if (hash >= 0) { qs = qs.substring(0, hash); }
  var pairs = qs.split("&");
  var i, kv, val;
  for (i = 0; i < pairs.length; i++) {
    kv = pairs[i].split("=");
    if (kv[0] === name) {
      val = kv.length > 1 ? kv[1] : "";
      try { return decodeURIComponent(val); } catch (e) { return val; }
    }
  }
  return "";
}

// Find, within win's subtree (win itself included), the href of the first
// same-origin frame whose location contains `fragment`, or "" if none. Used by
// section readers whose caseId lives in a frame's URL rather than in a global.
function frameHrefContaining(win, fragment, depth) {
  if (depth > MAXDEPTH) { return ""; }
  var href = "";
  try { href = win.location.href; } catch (e) { href = ""; } // x-origin frame
  if (href && href.indexOf(fragment) !== -1) { return href; }
  var frames, i, found;
  try { frames = win.frames; } catch (e2) { return ""; }
  for (i = 0; i < frames.length; i++) {
    found = frameHrefContaining(frames[i], fragment, depth + 1);
    if (found) { return found; }
  }
  return "";
}


// ---- Finding things CMS did not label ---------------------------------------
// These were in banner.js, which the footer stripe replaced. They are plain
// observation helpers with no opinion about what is being rendered, so they
// belong here with the rest of the mode-5 reading code.

// document mode 5 has no classList, so compare the whole token list by hand.
function classHas(el, cls) {
  var c = el.className;
  if (!c || typeof c.split !== "function") { return false; }
  var parts = c.split(" "), i;
  for (i = 0; i < parts.length; i++) {
    if (parts[i] === cls) { return true; }
  }
  return false;
}

// First element in `doc` carrying `cls`, or null. No getElementsByClassName and
// no querySelector at this floor, so this is a scan of every element: used only
// as a fallback for an element CMS did not give an id (the action bar table).
function findElByClassInDoc(doc, cls) {
  var all = null;
  try {
    all = doc.all ? doc.all : (doc.getElementsByTagName ? doc.getElementsByTagName("*") : null);
  } catch (e) { return null; }
  if (!all) { return null; }
  var i;
  for (i = 0; i < all.length; i++) {
    if (classHas(all[i], cls)) { return all[i]; }
  }
  return null;
}

// First same-origin frame named `name` anywhere under `win`, or null. The
// same-origin probe is the document access: a cross-origin frame throws, and a
// frame we cannot read is a frame we cannot render into.
function presenceFindFrameByName(win, name, depth) {
  if (depth > MAXDEPTH) { return null; }
  var frames;
  try { frames = win.frames; } catch (e) { return null; } // x-origin
  var i, f, nm, found;
  for (i = 0; i < frames.length; i++) {
    f = frames[i];
    nm = "";
    try { nm = f.name; } catch (e2) { nm = ""; }
    if (nm === name) {
      try { if (f.document) { return f; } } catch (e3) { } // same-origin probe
    }
    found = presenceFindFrameByName(f, name, depth + 1);
    if (found) { return found; }
  }
  return null;
}
