/* classic/banner.js — the menu-bar presence icon and its hover popup. CLASSIC ONLY.
 *
 * Renders into CMS's own menu bar, and anchors the popup to whichever frame is
 * actually rendering the active section — see presencePopupFrameName, which
 * main.js sets from the primary section's hint. There is deliberately no default
 * host frame: a section that does not declare one shows no popup rather than
 * rendering it somewhere wrong.
 *
 * Moved out of the single-file client. The one change: the tooltip and head-count
 * now read the SHARED roster (CCPRoster) rather than a private cache, so their
 * member fields are the API's own names — userEmail / sourceApplication — instead
 * of the abbreviations the private copy used.
 */

var PRESENCE_BANNER_ID = "ccPresenceBanner";
var PRESENCE_POPUP_ID = "ccPresencePopup"; // the beige hover popup shown under the icon
var PRESENCE_COUNT_ID = "ccPresenceCount"; // the bold "(N)" head-count shown right after the icon
var PRESENCE_COUNT_COLOR = "#350066"; // CPS purple for the "(N)" head-count
var PRESENCE_CONNECTING_TIP = "Connecting to The Watchdog..."; // popup text shown while the session is being set up (pre-first-poll)
var PRESENCE_CONNECTING_DOTS = "..."; // shown in place of the "(N)" head-count while connecting
var PRESENCE_ERROR_TIP = "There was an error connecting to The Watchdog!"; // popup text on a non-recoverable connection error
var PRESENCE_ERROR_MARK = "!"; // shown in place of the "(N)" head-count on a non-recoverable error
// Root-relative path of the meeting icon, referenced the same way as the padlock
// (<HOST>/Noexpiry/Images/uaimcaselock1.gif). The absolute URL is built per-doc in
// presenceIconUrl so it resolves against the menu bar's own CMS origin.
var PRESENCE_ICON_PATH = "../Noexpiry/Images/uaimmeeting.gif";

// Find the CMS yellow menu bar (class="menuBar" — the bar that also hosts the
// "Legal Links" link). It may live in the shell document or in any same-origin
// frame, so walk the whole frame tree. document-mode 5 has no
// getElementsByClassName / querySelector, so scan elements and test className.
function classHas(el, cls) {
  var c = el.className;
  if (!c || typeof c.split !== "function") { return false; }
  var parts = c.split(" "), i;
  for (i = 0; i < parts.length; i++) {
    if (parts[i] === cls) { return true; }
  }
  return false;
}

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

// Returns { win: frameWindow, row: menuBarRow } for the first same-origin frame
// whose document contains the menuBar row, or null. We carry the frame WINDOW
// (not the row's ownerDocument, which is unreliable in document-mode 5) so callers
// reach the row's real document via win.document.
function findMenuBar(win, depth) {
  if (depth > MAXDEPTH) { return null; }
  var doc;
  try { doc = win.document; } catch (e) { return null; } // x-origin frame
  var el = findElByClassInDoc(doc, "menuBar");
  if (el) { return { win: win, row: el }; }
  var frames, i, found;
  try { frames = win.frames; } catch (e2) { return null; }
  for (i = 0; i < frames.length; i++) {
    found = findMenuBar(frames[i], depth + 1);
    if (found) { return found; }
  }
  return null;
}

// Presence indicator: whenever anyone is viewing a supported section, show the
// meeting icon as the LAST cell of the yellow menu bar. The bar is a table ROW
// (<TR class=menuBar>) whose items are <TD class=menu> cells; there is no
// pre-existing element to anchor to (the old cboNShow anchor no longer exists),
// so the ONLY way to place the icon is to append a NEW <TD> at the end of the row.
// On hover the icon shows a custom beige popup (presenceShowPopup) with the roster
// text; the same text is kept on the icon (icon.ccTipText) so each poll just
// refreshes it. Replaces the old per-frame "also viewing" text banner.
function presenceShowBanner(tip, count) {
  var hit = findMenuBar(window, 0);
  if (!hit) { return; }
  var doc = hit.win.document; // real doc of the frame the row lives in
  var row = hit.row;
  try {
    // Reuse the existing icon if we already added it on a previous poll; otherwise
    // insert exactly one new cell and wire the hover popup ONCE. Without the reuse
    // check, every presence update would append another cell / rebind handlers.
    var icon = doc.getElementById(PRESENCE_BANNER_ID);
    if (!icon) {
      var cell = row.insertCell(row.cells.length);
      cell.className = "menu"; // match the other menu cells' styling
      icon = doc.createElement("img");
      icon.id = PRESENCE_BANNER_ID;
      icon.src = PRESENCE_ICON_PATH;
      icon.border = 0;
      icon.style.verticalAlign = "middle";
      icon.style.cursor = "default";
      cell.appendChild(icon);
      // The head-count, shown as bold "(N)" in CPS purple right after the icon.
      // Refreshed on every poll (see below); starts hidden until we have a count.
      var cnt = doc.createElement("span");
      cnt.id = PRESENCE_COUNT_ID;
      cnt.style.marginLeft = "3px";
      cnt.style.fontWeight = "bold";
      cnt.style.color = PRESENCE_COUNT_COLOR;
      cnt.style.verticalAlign = "middle";
      cell.appendChild(cnt);
      // Hover popup (attachEvent — no addEventListener in document-mode 5). The
      // handlers read icon.ccTipText, which we refresh below on every poll, so the
      // popup always shows the latest roster without rebinding.
      try {
        icon.attachEvent("onmouseover", function () { presenceShowPopup(icon); });
        icon.attachEvent("onmouseout", function () { presenceHidePopup(); });
      } catch (eBind) { }
    }

    // Keep the current roster text on the icon for the hover handlers. We do NOT set
    // title/alt — the custom popup replaces the native tooltip. If the popup is open
    // right now, refresh its text in place.
    icon.ccTipText = tip ? tip : "Also viewing this case";
    // Refresh the head-count after the icon: show it verbatim in brackets whether it's
    // the numeric roster size ("(N)") or the connecting placeholder ("(...)"). There is
    // no 0/negative case to guard — a real roster always has >= 1 (you), and the
    // pre-roster connecting state is already handled by passing the "..." placeholder.
    var cntEl = doc.getElementById(PRESENCE_COUNT_ID);
    if (cntEl) { cntEl.innerText = count ? ("(" + count + ")") : ""; }
    if (presencePopupEl) { presenceShowPopup(icon); }
  } catch (e) { }
}

// Absolute position of the icon within its document (viewport rect + scroll).
// ---- Hover popup, anchored to the active section's host frame top-right -----
// The popup is appended to the CONTENT frame that renders the active section and
// pinned to its TOP-RIGHT (top:0, right:0) so it grows DOWN-and-LEFT and is never
// clipped. Which frame that is depends on the page structure and is declared per
// section in SECTION_DETECTORS (popupFrame):
//   - "framePage": frameset pages (e.g. victim/witness) render content in an inner
//     framePage frame; frameMain is a frameset doc whose body never renders.
//   - "frameMain": content pages (e.g. case review) render directly as frameMain's
//     document, so the popup goes into frameMain's own body.
// presencePopupFrameName holds the current section's host frame (set on start). It is
// null when the active section did NOT declare a popupFrame — there is no default, so
// in that case we simply do not render the popup. presencePopupEl tracks the live
// popup so we can remove it.
var presencePopupFrameName = null; // current section's popup host frame; null = don't render
var presencePopupEl = null;

// Find the first same-origin frame named `name` anywhere in the tree, or null.
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

// Show (or refresh) the popup in the active section's host frame, pinned to its
// top-right and growing down-and-left. Text is icon.ccTipText; white-space:pre
// renders the "\n" line breaks. If the active section declared no popup host frame
// (presencePopupFrameName is null) or that frame can't be found / has no renderable
// body, we render NOTHING — there is deliberately no default/fallback host.
function presenceShowPopup(icon) {
  try {
    if (!presencePopupFrameName) { return; } // section didn't declare a popup host frame
    var text = icon.ccTipText || "";
    if (!text) { return; }
    var host = presenceFindFrameByName(window, presencePopupFrameName, 0);
    var hostDoc = null;
    if (host) { try { hostDoc = host.document; } catch (eD) { hostDoc = null; } }
    if (!hostDoc || !hostDoc.body) { return; } // host frame missing / no body -> don't render
    var pop = hostDoc.getElementById(PRESENCE_POPUP_ID);
    if (!pop) {
      pop = hostDoc.createElement("div");
      pop.id = PRESENCE_POPUP_ID;
      pop.style.position = "absolute";
      // Top offset depends on the host frame: framePage renders content at its own
      // top so 0 is fine; frameMain-as-content has the menu/header chrome up top, so
      // push the popup down 50px to clear it. Either way it grows down-and-left.
      pop.style.top = (presencePopupFrameName === POPUP_FRAME_MAIN ? "50px" : "0px");
      pop.style.right = "0px"; // pin top-right -> grows down-and-left
      pop.style.background = "#FFFFB3";
      pop.style.border = "1px solid #8a8a5c";
      pop.style.padding = "6px 8px";
      pop.style.fontFamily = "Arial, sans-serif";
      pop.style.fontSize = "10pt";
      pop.style.fontWeight = "bold";
      pop.style.color = "#000000";
      pop.style.whiteSpace = "pre";
      pop.style.zIndex = "100000";
      (hostDoc.body || hostDoc.documentElement).appendChild(pop);
    }
    presencePopupEl = pop;
    pop.innerText = text; // IE renders \n as line breaks under white-space:pre
    pop.style.display = "";
  } catch (e) { }
}

// Remove the popup wherever it was rendered.
function presenceHidePopup() {
  try {
    if (presencePopupEl && presencePopupEl.parentNode) {
      presencePopupEl.parentNode.removeChild(presencePopupEl);
    }
  } catch (e) { }
  presencePopupEl = null;
}

function presenceRemoveBanner() {
  var hit = findMenuBar(window, 0);
  var doc = hit ? hit.win.document : null;
  if (!doc) { return; }
  try {
    presenceHidePopup(); // drop the hover popup if it's open
    var icon = doc.getElementById(PRESENCE_BANNER_ID);
    if (!icon) { return; }
    // Remove the whole cell we added (the <TD>), not just the <img>. Delete it via
    // the table DOM API (deleteCell) for the same IE-mode reason as insertCell;
    // fall back to removeChild if deleteCell/cellIndex aren't available.
    var cell = icon.parentNode; // the <TD>
    var tr = cell ? cell.parentNode : null; // the <TR>
    if (tr && tr.deleteCell && typeof cell.cellIndex === "number" && cell.cellIndex >= 0) {
      tr.deleteCell(cell.cellIndex);
    } else if (cell && cell.parentNode) {
      cell.parentNode.removeChild(cell);
    } else if (icon.parentNode) {
      icon.parentNode.removeChild(icon);
    }
  } catch (e) { }
}


// Human-readable label for a section kind (used in the by-section tooltip).
function presenceSectionLabel(kind) {
  if (kind === "CASE") { return "Case"; }
  if (kind === "CASE_REVIEW") { return "Case Review"; }
  if (kind === "VICTIM_WITNESS") { return "Witness/Victim"; }
  if (kind === "DEFENDANT") { return "Defendant"; }
  return kind ? kind : "Section";
}

var PRESENCE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Format an ISO-8601 joinedAt ("2026-08-21T08:11:53.226+00:00") as "21 Aug 2026 08:11".
// document-mode 5 cannot reliably Date.parse ISO strings, so we read the fields out
// of the string directly (wall-clock as sent). Returns "" if it isn't a timestamp.
function presenceFormatJoined(iso) {
  if (!iso || typeof iso !== "string") { return ""; }
  var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
  if (!m) { return ""; }
  var monthIdx = parseInt(m[2], 10) - 1;
  var mon = (monthIdx >= 0 && monthIdx < 12) ? PRESENCE_MONTHS[monthIdx] : m[2];
  return parseInt(m[3], 10) + " " + mon + " " + m[1] + " " + m[4] + ":" + m[5];
}

// `sections` is CCPRoster's section map: sectionId -> { caseId, kind, members }.
// Passed in rather than reached for, so the banner has no opinion about where the
// roster lives and can be tested on a literal.
//
// Build the full tooltip text for one case, grouped by section. Format:
//   Who's working where:
//   Currently these users are working on <Section>:
//   <email> on <app> - joined <date>
//   ...
//   <blank line between sections>
// Sections whose roster is empty (everyone left — a valid, version-bumped
// notification) are OMITTED. Returns "" when no section of the case has members.
function presenceBuildTooltip(caseId, sections) {
  var blocks = [];
  var key, sec, members, i, mem, when, lines, line;
  for (key in sections) {
    if (!sections.hasOwnProperty(key)) { continue; }
    sec = sections[key];
    if (!sec || sec.caseId !== caseId) { continue; }
    members = sec.members;
    if (!members || members.length === 0) { continue; } // empty section -> omit
    lines = ["Currently these users are working on " + presenceSectionLabel(sec.kind) + ":"];
    for (i = 0; i < members.length; i++) {
      mem = members[i];
      line = mem.userEmail + " on " + (mem.sourceApplication ? mem.sourceApplication : "unknown");
      when = presenceFormatJoined(mem.joinedAt);
      if (when) { line = line + " - joined " + when; }
      lines[lines.length] = line;
    }
    blocks[blocks.length] = lines.join("\n");
  }
  if (blocks.length === 0) { return ""; }
  return "Who's working where:\n" + blocks.join("\n\n");
}

// Total number of people across ALL sections of one case (sum of the section
// rosters). Drives the "(N)" head-count after the icon. Empty sections contribute
// 0, so this matches how many names presenceBuildTooltip lists.
function presenceCountMembers(caseId, sections) {
  var total = 0, key, sec;
  for (key in sections) {
    if (!sections.hasOwnProperty(key)) { continue; }
    sec = sections[key];
    if (!sec || sec.caseId !== caseId) { continue; }
    if (sec.members && sec.members.length) { total = total + sec.members.length; }
  }
  return total;
}
