/* classic/dom.js — reading CMS's own state. CLASSIC ONLY, DOCUMENT MODE 5.
 *
 * PURE OBSERVATION. Nothing here wraps, patches or assigns to any CMS function or
 * variable: the detectors read hidden fields, page globals and frame URLs, and
 * that is all. It cannot change CMS behaviour, which is the whole licence for
 * running inside someone else's application.
 *
 * Moved verbatim out of the single-file client. Document mode 5 is why these
 * exist at all — no querySelector, no URL/URLSearchParams, no String.trim.
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

// The contact-recorder id for a person: prefer the per-index witness column,
// else look the person up in the "personId,version,recorderId|..." cache so it
// resolves whichever role row (Victim or Witness) was clicked.
function recorderIdFor(win, personId, idx) {
  var perIdx = splitCsv(win, fieldVal(win, "hidint64OldContactRecorderIdCSV"));
  var v = perIdx[idx];
  if (v && v !== "0") {
    return v;
  }
  var cache = fieldVal(win, "hidContactRecorderWitnessCache");
  if (cache) {
    var rows = cache.split("|");
    var i;
    var cells;
    for (i = 0; i < rows.length; i++) {
      if (!rows[i]) {
        continue;
      }
      cells = rows[i].split(",");
      if (cells[0] === personId) {
        return cells[2];
      }
    }
  }
  return "";
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

