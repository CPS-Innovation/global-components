/* legacy/classic/stripe.js — the red footer stripe and its details accordion. CLASSIC ONLY.
 *
 * THE ONLY PRESENCE UI IN CLASSIC. It replaced banner.js (a meeting icon appended
 * to the yellow menu bar, with a beige hover popup anchored to whichever frame was
 * rendering the active section). Ported from the deployed hand-written client,
 * where this shape won on two grounds: a hover popup is invisible to anyone not
 * already pointing at the icon, and anchoring it per section meant a section that
 * declared no host frame showed nothing at all.
 *
 * The stripe is in NORMAL FLOW immediately before the action-bar table, so it
 * pushes the Cancel/Save/Done controls down rather than covering them — which is
 * also why the frameset row has to grow by the stripe's height. See
 * presenceResizeFooter: only the footer row is ever touched, and only by the
 * amount the stripe actually measures.
 *
 * SHOWN ONLY ON A SUCCESSFUL POLL. There is deliberately no "connecting" state:
 * the old banner showed the icon the moment a supported section was detected,
 * which put chrome on the page before we knew whether anyone was there. Nothing
 * appears until a roster says so, and any failure takes it away (see
 * presenceConnectionFailed in main.js) rather than leaving a stale roster on
 * screen implying we still know who is present.
 *
 * MODE 5: no classList, no querySelector, no addEventListener, no textContent.
 * Roster text is written with innerText, never innerHTML — names and application
 * names come from the API and are never interpreted as markup.
 */

var PRESENCE_STRIPE_ID = "ccPresenceStripe";
var PRESENCE_STRIPE_HEADER_ID = "ccPresenceStripeHeader";
var PRESENCE_STRIPE_SUMMARY_ID = "ccPresenceStripeSummary";
var PRESENCE_STRIPE_TOGGLE_ID = "ccPresenceStripeToggle";
var PRESENCE_STRIPE_DETAILS_ID = "ccPresenceStripeDetails";
var PRESENCE_STRIPE_COLOR = "#b10e1e"; // GDS/CPS red
var PRESENCE_STRIPE_HEIGHT = 23; // the red header only; the details panel grows

// The footer lives in the action-bar table, which is either frameMain's own
// document or — when frameMain is itself a frameset — the frameActionBar frame
// inside it. PRESENCE_ACTION_BAR_ROW_INDEX is that frame's row in the frameset's
// `rows` list, and is the ONLY row this file ever writes.
var PRESENCE_FRAME_ACTION_BAR = "frameActionBar";
var PRESENCE_ACTION_BAR_ID = "tblCMSActionBar";
var PRESENCE_ACTION_BAR_CLASS = "cmsActionBar"; // fallback: the table is not always given its id
var PRESENCE_ACTION_BAR_ROW_INDEX = 3;

// Only a successful poll populates this. Expansion is kept across polls and
// across a navigation within the same case, so a reader who opened the details
// does not have to reopen them every three seconds.
var presenceStripeState = null; // { summary, text, count }; null = no presence UI
var presenceStripeEl = null;
var presenceStripeExpanded = false;
// Bound to the actual FRAMESET element, not to a frame name: that is what lets us
// put a row back after the user navigates, without resizing whatever page is
// there now.
var presenceFooterResize = null; // { frameset, originalRow, baseHeight, win }

// Consecutive observation passes that had a roster to show and nowhere to put it.
// Not a per-pass warning: a footer that is missing for ONE pass is almost always
// mid-navigation and the next pass fixes it, so the complaint waits until the
// condition has outlived any navigation. Reset by a successful render.
var PRESENCE_UNPLACEABLE_PASSES = 3; // ~9s at main.js's cadence
var presenceUnplaceablePasses = 0;
var presenceStripeWarned = false;

// ---- The words --------------------------------------------------------------
// Moved here from banner.js unchanged: the stripe shows the same roster the hover
// popup used to, so the formatting was never the banner's own.

// THREE OF THIS FILE'S OWN TABLES USED TO LIVE HERE and have been deleted, not
// moved: a section-label table ("Case", "Case Review", "Witness/Victim"), a month
// table, and a date formatter rendering "21 Aug 2026 08:11". Each had a shared
// counterpart that said something different — CCPSectionNames gives "the case",
// "the case review", "a witness or victim", and CCPJoined.format gives
// "3.38pm on 8 September 2026" — so Classic was not a terser version of the other
// two clients, it was a third voice. The shared ones won outright.
//
// What is left below is layout, not language. Every sentence now comes from
// CCPContent.

// ---- Footer geometry --------------------------------------------------------
// Pure, because getting it wrong resizes someone else's application. Both
// functions work on the frameset's `rows` attribute as a string and decide
// nothing about the DOM.

// The pixel height the stripe is added to, read from one row specification.
// `allocatedHeight` is the footer frame's measured height, used when the row is a
// proportion rather than a pixel count. Returns -1 when the row cannot be
// interpreted, which means: leave the frameset alone entirely.
function presenceBaseHeightFromRow(rowText, allocatedHeight) {
  var row = trim(rowText);
  if (/^\d+$/.test(row)) {
    return parseInt(row, 10);
  }
  if (/[%*]/.test(row)) {
    // A percentage or a star is not a pixel count, so measure what it currently
    // resolves to — but the ORIGINAL row text is what gets put back, so the
    // proportion survives the stripe being removed.
    return allocatedHeight > 0 ? allocatedHeight : -1;
  }
  return -1;
}

// `rowsText` with `index` set to `value`. Returns "" when that would change
// nothing, or when the frameset has fewer rows than we expect — the caller takes
// "" as "do not write", so an unfamiliar frameset is never rewritten.
function presenceRowsWith(rowsText, index, value) {
  var rows = String(rowsText).split(",");
  if (rows.length <= index) { return ""; }
  if (rows[index] === value) { return ""; }
  rows[index] = value;
  return rows.join(",");
}

// ---- Where the stripe goes --------------------------------------------------

// Why the lookup below last declined. Every one of its exits was silent, and a
// populated roster that draws nothing looks identical from the console whichever
// one was taken — which is what made the 2026-11-04 investigation DOM archaeology.
// Read it through __ccPresence.stripe(), and see presenceStripeUnplaceable for the
// one case that says so by itself.
var presenceFooterReason = "";

// Resolve the footer and its owning FRAMESET from the live structure on every
// update rather than caching it: CMS replaces these documents under us. Two
// shapes are supported, and nothing is ever inserted into a frameset body —
// a frameset has no rendered body, so appending to one renders nowhere.
function presenceGetFooterTarget() {
  try {
    var main = presenceFindFrameByName(window, FRAME_MAIN, 0);
    if (!main) {
      presenceFooterReason = "no " + FRAME_MAIN;
      return null;
    }
    var doc = main.document;
    if (!doc || !doc.body) {
      presenceFooterReason = FRAME_MAIN + " has no document body yet";
      return null;
    }
    var frameset = null;
    var host = main;
    if (String(doc.body.tagName).toLowerCase() === "frameset") {
      // frameMain is a frameset: the action bar is in its frameActionBar frame,
      // and that frame's row is what has to grow.
      frameset = doc.body;
      host = presenceFindFrameByName(main, PRESENCE_FRAME_ACTION_BAR, 0);
      doc = host ? host.document : null;
      if (!host) {
        presenceFooterReason = FRAME_MAIN + " is a frameset with no " + PRESENCE_FRAME_ACTION_BAR;
        return null;
      }
    }
    if (!doc || !doc.body || String(doc.body.tagName).toLowerCase() === "frameset") {
      presenceFooterReason = "no rendered body to insert into";
      return null;
    }
    var footer = getEl(host, PRESENCE_ACTION_BAR_ID);
    if (!footer) {
      footer = findElByClassInDoc(doc, PRESENCE_ACTION_BAR_CLASS);
    }
    if (!footer || !footer.parentNode) {
      presenceFooterReason = "no " + PRESENCE_ACTION_BAR_ID + " / ." + PRESENCE_ACTION_BAR_CLASS + " in the footer document";
      return null; // no footer to sit above -> no stripe
    }
    presenceFooterReason = "";
    return { doc: doc, footer: footer, frameset: frameset, win: host };
  } catch (e) {
    presenceFooterReason = "threw: " + e;
    return null;
  }
}

// Put back just the footer's original row specification. Every other row,
// including the flexible content row, is left exactly as CMS has it now — even if
// CMS changed it while the stripe was up.
function presenceRestoreFooterRows() {
  var resize = presenceFooterResize;
  presenceFooterResize = null;
  if (!resize) {
    return;
  }
  try {
    var rows = presenceRowsWith(resize.frameset.rows, PRESENCE_ACTION_BAR_ROW_INDEX, resize.originalRow);
    if (rows) {
      resize.frameset.rows = rows;
    }
  } catch (e) { }
}

// Capture the baseline BEFORE the stripe is inserted, and reuse it on every poll
// and toggle — otherwise each update would add the stripe's height to an already
// enlarged row and the footer would creep down the page.
function presencePrepareFooterResize(target) {
  if (presenceFooterResize && presenceFooterResize.frameset === target.frameset) {
    return; // same frameset, baseline still valid
  }
  presenceRestoreFooterRows(); // a different frameset: give the old one its row back
  if (!target.frameset) {
    return; // frameMain is plain HTML -> normal flow is enough, nothing to resize
  }
  try {
    var rows = String(target.frameset.rows).split(",");
    if (rows.length <= PRESENCE_ACTION_BAR_ROW_INDEX) {
      return;
    }
    var frameEl = target.win ? target.win.frameElement : null;
    var baseHeight = presenceBaseHeightFromRow(
      rows[PRESENCE_ACTION_BAR_ROW_INDEX],
      frameEl ? frameEl.offsetHeight : 0
    );
    if (baseHeight < 0) {
      return; // unreadable row -> do not touch this frameset at all
    }
    presenceFooterResize = {
      frameset: target.frameset,
      originalRow: rows[PRESENCE_ACTION_BAR_ROW_INDEX],
      baseHeight: baseHeight,
      win: target.win
    };
  } catch (e) { }
}

// Measure the whole accordion AFTER its text and display have been set — 23px
// collapsed, plus the details panel when expanded — and give the footer row that
// much more than its baseline.
function presenceResizeFooter() {
  if (!presenceFooterResize || !presenceStripeEl) {
    return;
  }
  try {
    var height = Math.max(PRESENCE_STRIPE_HEIGHT, presenceStripeEl.offsetHeight);
    if (!isFinite(height)) {
      return;
    }
    var resize = presenceFooterResize;
    var rows = presenceRowsWith(
      resize.frameset.rows,
      PRESENCE_ACTION_BAR_ROW_INDEX,
      String(resize.baseHeight + height)
    );
    if (rows) {
      resize.frameset.rows = rows;
    }
  } catch (e) { }
}

// Drop the DOM and give the footer its space back, but KEEP the text and the
// expansion: a navigation within the same case re-renders from the same state, so
// the stripe comes back as the reader left it.
function presenceDetachStripe() {
  try {
    if (presenceStripeEl && presenceStripeEl.parentNode) {
      presenceStripeEl.parentNode.removeChild(presenceStripeEl);
    }
  } catch (e) { }
  presenceStripeEl = null;
  presenceRestoreFooterRows();
}

// The stripe goes away for good: no roster, or the connection broke.
function presenceRemoveStripe() {
  presenceStripeState = null;
  presenceStripeExpanded = false;
  presenceDetachStripe();
}

// A click changes the expansion and the space it needs — nothing else. Not the
// text, not the poll cadence, and no call to the API.
function presenceUpdateStripeExpanded(toggle, details) {
  var label = CCPContent.detailsToggle(presenceStripeExpanded);
  if (toggle) {
    if (toggle.innerText !== label) {
      toggle.innerText = label;
    }
    toggle.setAttribute("aria-expanded", presenceStripeExpanded ? "true" : "false");
  }
  if (details) {
    details.style.display = presenceStripeExpanded ? "block" : "none";
  }
  presenceResizeFooter();
}

// Build (once) and refresh (every poll) the accordion. Styles are set inline
// because CMS's stylesheets are not ours to extend and a class we add means
// nothing in their documents.
function presenceRenderStripe() {
  try {
    var state = presenceStripeState;
    var target = presenceGetFooterTarget();
    if (!state || !target) {
      if (state) {
        presenceUnplaceablePasses = presenceUnplaceablePasses + 1;
        presenceStripeUnplaceable();
      }
      presenceDetachStripe(); // keeps state: a missing footer is usually mid-navigation
      return;
    }
    presenceUnplaceablePasses = 0;
    var doc = target.doc;
    var footer = target.footer;
    var stripe = doc.getElementById(PRESENCE_STRIPE_ID);
    if (presenceStripeEl && presenceStripeEl !== stripe) {
      presenceDetachStripe(); // a new host frame, or a new document in the same one
    }
    presencePrepareFooterResize(target);
    var details;
    if (!stripe) {
      stripe = doc.createElement("div");
      stripe.id = PRESENCE_STRIPE_ID;
      stripe.style.margin = "0";
      stripe.style.padding = "0";
      stripe.style.fontFamily = "Arial, sans-serif";
      stripe.style.fontSize = "10pt";

      var header = doc.createElement("div");
      header.id = PRESENCE_STRIPE_HEADER_ID;
      header.style.position = "relative";
      header.style.height = PRESENCE_STRIPE_HEIGHT + "px";
      header.style.lineHeight = PRESENCE_STRIPE_HEIGHT + "px";
      header.style.margin = "0";
      header.style.padding = "0";
      header.style.backgroundColor = PRESENCE_STRIPE_COLOR;
      header.style.color = "#ffffff";
      header.style.fontWeight = "bold";
      header.style.overflow = "hidden";

      var summary = doc.createElement("span");
      summary.id = PRESENCE_STRIPE_SUMMARY_ID;
      summary.style.display = "block";
      summary.style.margin = "0 110px 0 8px"; // reserve room for the details link
      summary.style.whiteSpace = "nowrap";
      summary.style.overflow = "hidden";
      summary.style.textOverflow = "ellipsis";
      header.appendChild(summary);

      var toggle = doc.createElement("a");
      toggle.id = PRESENCE_STRIPE_TOGGLE_ID;
      toggle.href = "#" + PRESENCE_STRIPE_DETAILS_ID;
      toggle.style.position = "absolute";
      toggle.style.right = "8px";
      toggle.style.top = "0px";
      toggle.style.color = "#ffffff";
      toggle.style.textDecoration = "underline";
      toggle.style.whiteSpace = "nowrap";
      toggle.setAttribute("role", "button");
      toggle.setAttribute("aria-controls", PRESENCE_STRIPE_DETAILS_ID);
      // DOM0 handlers: attachEvent cannot cancel an anchor's navigation, and
      // `return false` still does at this document mode. Enter activates the link
      // natively; Space is handled so it behaves like the button we claim it is.
      toggle.onclick = function () {
        presenceStripeExpanded = !presenceStripeExpanded;
        presenceUpdateStripeExpanded(toggle, details);
        return false;
      };
      toggle.onkeydown = function (event) {
        var e = event || (doc.parentWindow ? doc.parentWindow.event : null);
        if (e && e.keyCode === 32) {
          e.returnValue = false;
          return toggle.onclick();
        }
        return true;
      };
      header.appendChild(toggle);
      stripe.appendChild(header);

      details = doc.createElement("div");
      details.id = PRESENCE_STRIPE_DETAILS_ID;
      details.style.backgroundColor = "#ffffff";
      details.style.color = "#000000";
      details.style.border = "1px solid " + PRESENCE_STRIPE_COLOR;
      details.style.borderTop = "0";
      details.style.padding = "6px 8px";
      details.style.whiteSpace = "pre"; // the detail text is "\n"-separated
      details.style.overflow = "auto"; // long roster lines scroll rather than widening the page
      stripe.appendChild(details);
    }
    // Immediately before the footer table, in normal flow, so the action bar is
    // pushed down rather than covered.
    if (stripe.nextSibling !== footer) {
      footer.parentNode.insertBefore(stripe, footer);
    }
    presenceStripeEl = stripe;
    var summaryEl = doc.getElementById(PRESENCE_STRIPE_SUMMARY_ID);
    var toggleEl = doc.getElementById(PRESENCE_STRIPE_TOGGLE_ID);
    var detailsEl = doc.getElementById(PRESENCE_STRIPE_DETAILS_ID);
    var summaryText = state.summary;
    if (summaryEl && summaryEl.innerText !== summaryText) {
      summaryEl.innerText = summaryText;
    }
    if (detailsEl && detailsEl.innerText !== state.text) {
      detailsEl.innerText = state.text; // innerText: never interpret a name as markup
    }
    presenceUpdateStripeExpanded(toggleEl, detailsEl);
  } catch (e) { }
}

// Said ONCE per shell load, and only when there are people on the case and the
// stripe has had nowhere to go for several passes running. Classic ships no
// routine console output, so this is held to the same bar as
// presenceConnectionFailed in main.js: it reports a state the reader can see is
// wrong (presence is working, the page says nothing) and names the reason, rather
// than narrating a loop.
function presenceStripeUnplaceable() {
  if (presenceStripeWarned || presenceUnplaceablePasses < PRESENCE_UNPLACEABLE_PASSES) {
    return;
  }
  presenceStripeWarned = true;
  try {
    if (window.console && window.console.log) {
      window.console.log(
        "There are people on this case but the presence stripe could not be placed: " +
        (presenceFooterReason ? presenceFooterReason : "unknown") +
        ". See window.__ccPresence.stripe()."
      );
    }
  } catch (e) { }
}

// The entry point main.js uses on every successful poll, with a CCPView.
function presenceShowStripe(view) {
  presenceStripeState = { summary: view.summary, text: view.lines.join("\n"), count: view.count };
  presenceRenderStripe();
}

// Re-assert whatever the stripe should currently be showing against the LIVE DOM,
// and nothing more: no new text, no roster, no API call.
//
// It exists because CMS replaces the footer document under us on a navigation that
// changes nothing we observe — same case, same section, same roster — and the
// stripe goes with the document while presenceStripeState survives.
// presenceDetachStripe was already written to keep the state "so the stripe comes
// back as the reader left it", but nothing re-rendered it: the only callers were
// roster changes, so a reader who navigated after the last change lost the stripe
// for good. main.js now calls this every observation pass.
//
// Cheap to repeat: a no-op with no state, and idempotent with it — the DOM is
// reused when it is already right, and presenceRowsWith declines to rewrite a row
// it would not change, so the frameset is not touched on a quiet pass.
function presenceRefreshStripe() {
  if (!presenceStripeState) {
    return;
  }
  presenceRenderStripe();
}

// Triage, for __ccPresence.stripe(). The question this answers is the one that
// cost a day on 2026-11-04: the roster has people in it and the page shows
// nothing — is the stripe not being asked for, or asked for and unplaceable?
//   state null      -> not asked for. The roster is for another case, or empty:
//                      compare __ccPresence.rosterBySection() with sections().
//   state set, inDom false -> asked for and it could not be placed; `reason` says
//                      which lookup failed and `unplaceablePasses` how long for.
//   state set, inDom true  -> it is on the page; if it cannot be seen, the footer
//                      row did not grow (see presenceResizeFooter).
function presenceStripeSnapshot() {
  var el = presenceStripeEl;
  return {
    state: presenceStripeState,
    inDom: !!(el && el.parentNode),
    expanded: presenceStripeExpanded,
    reason: presenceFooterReason,
    unplaceablePasses: presenceUnplaceablePasses,
    resized: !!presenceFooterResize
  };
}
