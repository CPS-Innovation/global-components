/* apps/modern/bar.js — the pinned notification, in the SPA's clothes. MODERN/DCF ONLY.
 *
 * A HAND RECREATION, and it has to be. The web components dress this in
 * govuk-frontend, whose v5 dropped IE11; these pages run at document mode 11, so
 * the stylesheet cannot come with us and neither can the components. What follows
 * is the same design rebuilt from its measurements — taken from the compiled
 * govuk-notification-banner and the pinned wrapper that overrides it — in inline
 * styles, because we are a guest on a page whose stylesheet we do not control and
 * have no shadow DOM to hide behind.
 *
 * WHAT MATCHES: the layout, the red header over white content, the 5px border, the
 * type scale and weights, the "Show details" / "Hide details" toggle.
 *
 * WHAT CANNOT: the typeface. govuk-font asks for "GDS Transport" and falls back to
 * arial — the font is not on these pages, and fetching it would be weight and a
 * cross-origin request for a guest script. So the fallback IS the rendering here.
 * Everything else is close; this one is permanent.
 *
 * MODE 11 SUBSTITUTIONS, each forced rather than chosen:
 *   - no CSS custom properties, so the colours are literals
 *   - no flexbox gap and buggy flexbox, so the header row is floated
 *   - no text-decoration-thickness / text-underline-offset, so they are dropped
 */

var BAR_ID = "ccPresenceBanner";
var BAR_CONTENT_ID = "ccPresenceBannerContent";
var BAR_TOGGLE_ID = "ccPresenceBannerToggle";

/* Straight from the compiled stylesheet, so a reader can check them against it. */
var BAR_RED = "#ca3535"; /* govuk-error-colour, via the pinned wrapper */
var BAR_WHITE = "#ffffff";
var BAR_INK = "#0b0c0c"; /* govuk text colour on the white content */
var BAR_FONT = '"GDS Transport", arial, sans-serif';

/* The desktop end of govuk-frontend's two-step scale (>= 40.0625em). These pages
 * are desktop applications in practice, so the larger step is the right one and a
 * media query we cannot express in inline styles is no loss. */
var BAR_FONT_SIZE = "19px";
var BAR_LINE_HEIGHT = "1.3157894737";

var ccExpanded = false;
var ccLines = [];
var ccTitle = "";

/* One line per person, in the web components' own words — assembled by CCPContent
 * rather than rebuilt here.
 *
 * THIS USED TO CLAIM IT ALREADY MATCHED THEM, and it did not: it omitted the
 * trailing full stop, and it said "is on this case" whenever the section was
 * unknown even when the applications were known, where the web component says
 * that only when BOTH are. A comment cannot keep two copies of a sentence in
 * step — which is the whole reason the sentence now has one home. */
function ccLines_(people) {
  var out = [];
  var i, person;
  for (i = 0; i < people.length; i++) {
    person = people[i];
    out.push(
      CCPContent.personLine(
        CCPPeople.displayName(person),
        CCPSectionNames.describe(person.sections),
        CCPContent.where(person.apps, CCPJoined.format)
      )
    );
  }
  return out;
}

function ccRemoveBanner() {
  try {
    var existing = document.getElementById(BAR_ID);
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
    ccApplyClearance(0);
  } catch (e) {
    // never let presentation break the host page
  }
}

/**
 * KEEP THE LAST OF THE PAGE REACHABLE.
 *
 * A fixed bar at the bottom of the viewport hides whatever the page ends with, and
 * scrolling to the bottom does not help — the bar goes down with you. So the
 * document gets padding equal to the bar's height, which turns the covered strip
 * into scrollable space.
 *
 * RE-APPLIED ON EVERY DRAW, because the height changes: showing the details makes
 * the bar taller, hiding them shrinks it again, and a stale padding either leaves a
 * gap or stops clearing the content.
 *
 * ASSUMES THE DOCUMENT SCROLLS. A host that scrolls an inner container keeps its
 * own scrollbar and this padding does nothing there — cosmetic rather than broken,
 * and preferable to guessing at which of the host's elements is the real one.
 */
function ccApplyClearance(height) {
  try {
    document.body.style.paddingBottom = height ? height + "px" : "";
  } catch (e) {
    // the host may have opinions about body styles; the bar still works
  }
}

function ccSetToggleText() {
  var toggle = document.getElementById(BAR_TOGGLE_ID);
  if (toggle) {
    toggle.innerHTML = "";
    toggle.appendChild(document.createTextNode(CCPContent.detailsToggle(ccExpanded)));
    toggle.setAttribute("aria-expanded", ccExpanded ? "true" : "false");
  }
}

function ccPaintContent() {
  var content = document.getElementById(BAR_CONTENT_ID);
  var i, p;
  if (!content) {
    return;
  }
  content.innerHTML = "";
  for (i = 0; i < ccLines.length; i++) {
    p = document.createElement("p");
    p.style.margin = i === ccLines.length - 1 ? "0" : "0 0 15px 0";
    p.style.color = BAR_INK;
    // textContent, never innerHTML: these strings carry server-supplied email
    // addresses and this page is not ours to inject markup into.
    p.appendChild(document.createTextNode(ccLines[i]));
    content.appendChild(p);
  }
  content.style.display = ccExpanded ? "block" : "none";
}

function ccToggle() {
  ccExpanded = !ccExpanded;
  ccSetToggleText();
  ccPaintContent();
  ccMeasure();
}

function ccMeasure() {
  var banner = document.getElementById(BAR_ID);
  ccApplyClearance(banner ? banner.offsetHeight : 0);
}

/**
 * @param {Array} people  CCPPeople.collapse output — one entry per person
 * @param {string} title  the summary line, already worded by the caller
 */
function renderBanner(people, title) {
  try {
    if (!people.length) {
      ccRemoveBanner();
      return;
    }
    ccLines = ccLines_(people);
    ccTitle = title;

    var banner = document.getElementById(BAR_ID);
    var header, heading, toggle, content;

    if (!banner) {
      banner = document.createElement("div");
      banner.id = BAR_ID;
      banner.style.position = "fixed";
      banner.style.left = "0";
      banner.style.right = "0";
      banner.style.bottom = "0";
      banner.style.zIndex = "2147483000";
      banner.style.boxSizing = "border-box";
      banner.style.maxHeight = "90vh";
      banner.style.overflowY = "auto";
      banner.style.font = BAR_FONT_SIZE + "/" + BAR_LINE_HEIGHT + " " + BAR_FONT;
      /* border AND background the same colour, as govuk-notification-banner does */
      banner.style.border = "5px solid " + BAR_RED;
      banner.style.backgroundColor = BAR_RED;

      header = document.createElement("div");
      header.id = BAR_ID + "Header";
      /* 2px 20px 5px in the stylesheet; the left padding is what keeps the title
       * off the edge, which is the whole reason this is full width. */
      header.style.padding = "2px 20px 5px";
      header.style.overflow = "hidden"; /* contains the floats — no flexbox here */

      heading = document.createElement("h2");
      heading.id = BAR_ID + "Title";
      heading.style.margin = "0";
      heading.style.float = "left";
      heading.style.fontWeight = "700";
      heading.style.fontSize = BAR_FONT_SIZE;
      heading.style.lineHeight = "1.25";
      heading.style.color = BAR_WHITE;

      toggle = document.createElement("button");
      toggle.id = BAR_TOGGLE_ID;
      toggle.type = "button";
      toggle.style.float = "right";
      toggle.style.background = "none";
      toggle.style.border = "0";
      toggle.style.margin = "0";
      toggle.style.padding = "0";
      toggle.style.font = BAR_FONT_SIZE + "/" + BAR_LINE_HEIGHT + " " + BAR_FONT;
      toggle.style.color = BAR_WHITE;
      toggle.style.cursor = "pointer";
      toggle.style.whiteSpace = "nowrap";
      toggle.style.textDecoration = "underline";
      toggle.setAttribute("aria-controls", BAR_CONTENT_ID);
      toggle.onclick = ccToggle;

      content = document.createElement("div");
      content.id = BAR_CONTENT_ID;
      content.style.padding = "15px";
      content.style.backgroundColor = BAR_WHITE;
      content.style.color = BAR_INK;

      header.appendChild(heading);
      header.appendChild(toggle);
      banner.appendChild(header);
      banner.appendChild(content);
      document.body.appendChild(banner);
    }

    heading = document.getElementById(BAR_ID + "Title");
    heading.innerHTML = "";
    heading.appendChild(document.createTextNode(ccTitle));

    ccSetToggleText();
    ccPaintContent();
    ccMeasure();
  } catch (e) {
    // never let presentation break the host page
  }
}
