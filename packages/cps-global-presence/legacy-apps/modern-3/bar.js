/* modern-3/bar.js — the pinned notification, in the SPA's clothes. MODERN/DCF ONLY.
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

var CC3_ID = "ccPresenceBanner";
var CC3_CONTENT_ID = "ccPresenceBannerContent";
var CC3_TOGGLE_ID = "ccPresenceBannerToggle";

/* Straight from the compiled stylesheet, so a reader can check them against it. */
var CC3_RED = "#ca3535"; /* govuk-error-colour, via the pinned wrapper */
var CC3_WHITE = "#ffffff";
var CC3_INK = "#0b0c0c"; /* govuk text colour on the white content */
var CC3_FONT = '"GDS Transport", arial, sans-serif';

/* The desktop end of govuk-frontend's two-step scale (>= 40.0625em). These pages
 * are desktop applications in practice, so the larger step is the right one and a
 * media query we cannot express in inline styles is no loss. */
var CC3_FONT_SIZE = "19px";
var CC3_LINE_HEIGHT = "1.3157894737";

var cc3Expanded = false;
var cc3Lines = [];
var cc3Title = "";

/* One line per person, in the same words the web components use — the tables are
 * shared precisely so that two products cannot describe one roster differently. */
function cc3Lines_(people) {
  var out = [];
  var i, j, person, parts, app, since;
  for (i = 0; i < people.length; i++) {
    person = people[i];
    parts = [];
    for (j = 0; j < person.apps.length; j++) {
      app = person.apps[j];
      since = CCPJoined.format(app.timeEntered);
      parts.push(since ? app.appDisplayName + " since " + since : app.appDisplayName);
    }
    out.push(
      CCPPeople.displayName(person) +
        (CCPSectionNames.describe(person.sections) ? " is in " + CCPSectionNames.describe(person.sections) : " is on this case") +
        (parts.length ? " — " + parts.join(", ") : "")
    );
  }
  return out;
}

function cc3RemoveBanner() {
  try {
    var existing = document.getElementById(CC3_ID);
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
    cc3ApplyClearance(0);
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
function cc3ApplyClearance(height) {
  try {
    document.body.style.paddingBottom = height ? height + "px" : "";
  } catch (e) {
    // the host may have opinions about body styles; the bar still works
  }
}

function cc3SetToggleText() {
  var toggle = document.getElementById(CC3_TOGGLE_ID);
  if (toggle) {
    toggle.innerHTML = "";
    toggle.appendChild(document.createTextNode(cc3Expanded ? "Hide details" : "Show details"));
    toggle.setAttribute("aria-expanded", cc3Expanded ? "true" : "false");
  }
}

function cc3PaintContent() {
  var content = document.getElementById(CC3_CONTENT_ID);
  var i, p;
  if (!content) {
    return;
  }
  content.innerHTML = "";
  for (i = 0; i < cc3Lines.length; i++) {
    p = document.createElement("p");
    p.style.margin = i === cc3Lines.length - 1 ? "0" : "0 0 15px 0";
    p.style.color = CC3_INK;
    // textContent, never innerHTML: these strings carry server-supplied email
    // addresses and this page is not ours to inject markup into.
    p.appendChild(document.createTextNode(cc3Lines[i]));
    content.appendChild(p);
  }
  content.style.display = cc3Expanded ? "block" : "none";
}

function cc3Toggle() {
  cc3Expanded = !cc3Expanded;
  cc3SetToggleText();
  cc3PaintContent();
  cc3Measure();
}

function cc3Measure() {
  var banner = document.getElementById(CC3_ID);
  cc3ApplyClearance(banner ? banner.offsetHeight : 0);
}

/**
 * @param {Array} people  CCPPeople.collapse output — one entry per person
 * @param {string} title  the summary line, already worded by the caller
 */
function renderBanner(people, title) {
  try {
    if (!people.length) {
      cc3RemoveBanner();
      return;
    }
    cc3Lines = cc3Lines_(people);
    cc3Title = title;

    var banner = document.getElementById(CC3_ID);
    var header, heading, toggle, content;

    if (!banner) {
      banner = document.createElement("div");
      banner.id = CC3_ID;
      banner.style.position = "fixed";
      banner.style.left = "0";
      banner.style.right = "0";
      banner.style.bottom = "0";
      banner.style.zIndex = "2147483000";
      banner.style.boxSizing = "border-box";
      banner.style.maxHeight = "90vh";
      banner.style.overflowY = "auto";
      banner.style.font = CC3_FONT_SIZE + "/" + CC3_LINE_HEIGHT + " " + CC3_FONT;
      /* border AND background the same colour, as govuk-notification-banner does */
      banner.style.border = "5px solid " + CC3_RED;
      banner.style.backgroundColor = CC3_RED;

      header = document.createElement("div");
      header.id = CC3_ID + "Header";
      /* 2px 20px 5px in the stylesheet; the left padding is what keeps the title
       * off the edge, which is the whole reason this is full width. */
      header.style.padding = "2px 20px 5px";
      header.style.overflow = "hidden"; /* contains the floats — no flexbox here */

      heading = document.createElement("h2");
      heading.id = CC3_ID + "Title";
      heading.style.margin = "0";
      heading.style.float = "left";
      heading.style.fontWeight = "700";
      heading.style.fontSize = CC3_FONT_SIZE;
      heading.style.lineHeight = "1.25";
      heading.style.color = CC3_WHITE;

      toggle = document.createElement("button");
      toggle.id = CC3_TOGGLE_ID;
      toggle.type = "button";
      toggle.style.float = "right";
      toggle.style.background = "none";
      toggle.style.border = "0";
      toggle.style.margin = "0";
      toggle.style.padding = "0";
      toggle.style.font = CC3_FONT_SIZE + "/" + CC3_LINE_HEIGHT + " " + CC3_FONT;
      toggle.style.color = CC3_WHITE;
      toggle.style.cursor = "pointer";
      toggle.style.whiteSpace = "nowrap";
      toggle.style.textDecoration = "underline";
      toggle.setAttribute("aria-controls", CC3_CONTENT_ID);
      toggle.onclick = cc3Toggle;

      content = document.createElement("div");
      content.id = CC3_CONTENT_ID;
      content.style.padding = "15px";
      content.style.backgroundColor = CC3_WHITE;
      content.style.color = CC3_INK;

      header.appendChild(heading);
      header.appendChild(toggle);
      banner.appendChild(header);
      banner.appendChild(content);
      document.body.appendChild(banner);
    }

    heading = document.getElementById(CC3_ID + "Title");
    heading.innerHTML = "";
    heading.appendChild(document.createTextNode(cc3Title));

    cc3SetToggleText();
    cc3PaintContent();
    cc3Measure();
  } catch (e) {
    // never let presentation break the host page
  }
}
