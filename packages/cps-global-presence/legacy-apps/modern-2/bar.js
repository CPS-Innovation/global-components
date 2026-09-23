/* modern-2/bar.js — the presence indicator, next to the username. MODERN/DCF ONLY.
 *
 * WHY A SECOND IMPLEMENTATION. modern/bar.js draws a strip across the page. This
 * one follows CMS Classic instead: a small icon beside the signed-in user's name in
 * the top right, carrying a head-count, with the roster on hover. Users move
 * between Classic and Modern all day, and an indicator that lives in the same place
 * and behaves the same way in both is one thing to learn rather than two.
 *
 * Both are built; deploy.local.sh chooses which one ships. See build.sh.
 *
 * WHERE IT ANCHORS. The Modern shell puts the signed-in user in the top-right row:
 *
 *   <div class="pull-right">
 *     …Recent Cases… |  …Classic CMS… |
 *     <span class="dropdown" ng-controller="UserController" …>
 *       <span class="glyphicon glyphicon-user icon-style"></span>
 *       {{user.firstNames}} {{user.surname}}
 *     </span>
 *   </div>
 *
 * We insert one span BEFORE that block, so the count reads left of the name. The
 * anchor is [ng-controller="UserController"] — a behavioural attribute the app needs
 * for its own reasons, which makes it a better bet than a class or a position.
 *
 * DOCUMENT MODE 11 here, not 5: querySelector, addEventListener and textContent are
 * all available, unlike in the Classic client.
 */

var CC2_ID = "ccPresenceIndicator"; // the span we insert (icon + count)
var CC2_COUNT_ID = "ccPresenceCount";
var CC2_POPUP_ID = "ccPresencePopup";
var CC2_COUNT_COLOUR = "#350066"; // CPS purple, as Classic uses
var CC2_ANCHOR = '[ng-controller="UserController"]';

var cc2Popup = null;
var cc2Lines = [];

function cc2Anchor() {
  try {
    return document.querySelector(CC2_ANCHOR);
  } catch (e) {
    return null;
  }
}

// The roster as lines of text — one per person, their applications and when they
// arrived. CCPPeople does the collapsing, so a person in two applications is one
// line here exactly as they are one line in the web components.
function cc2Lines_(people) {
  var out = [];
  var i, j, person, parts, app;
  for (i = 0; i < people.length; i++) {
    person = people[i];
    parts = [];
    for (j = 0; j < person.apps.length; j++) {
      app = person.apps[j];
      parts.push(app.appDisplayName + (app.timeEntered ? " since " + CCPJoined.format(app.timeEntered) : ""));
    }
    out.push(CCPPeople.displayName(person) + (parts.length ? " — " + parts.join(", ") : ""));
  }
  return out;
}

function cc2HidePopup() {
  if (cc2Popup && cc2Popup.parentNode) {
    cc2Popup.parentNode.removeChild(cc2Popup);
  }
  cc2Popup = null;
}

// Anchored under the icon and pinned to the right, so it grows down-and-left and is
// never clipped by the viewport edge the indicator sits against.
function cc2ShowPopup(host) {
  var rect, div, i, line;
  cc2HidePopup();
  if (!cc2Lines.length) {
    return;
  }
  try {
    rect = host.getBoundingClientRect();
    div = document.createElement("div");
    div.id = CC2_POPUP_ID;
    div.style.position = "fixed";
    div.style.top = rect.bottom + 4 + "px";
    div.style.right = Math.max(0, document.documentElement.clientWidth - rect.right) + "px";
    div.style.zIndex = "10000";
    div.style.background = "#fdf6e3";
    div.style.border = "1px solid #b0a68c";
    div.style.padding = "6px 8px";
    div.style.font = "12px Arial, sans-serif";
    div.style.color = "#000";
    div.style.maxWidth = "420px";
    div.style.boxShadow = "0 2px 6px rgba(0,0,0,0.3)";
    for (i = 0; i < cc2Lines.length; i++) {
      line = document.createElement("div");
      line.textContent = cc2Lines[i];
      div.appendChild(line);
    }
    document.body.appendChild(div);
    cc2Popup = div;
  } catch (e) {
    cc2Popup = null;
  }
}

/**
 * Draw (or update, or remove) the indicator.
 *
 * @param {Array} people   CCPPeople.collapse output — one entry per person
 * @param {string} status  "" normally; "..." while connecting, "!" on a fatal error,
 *                         shown in place of the count exactly as Classic does
 */
function renderIndicator(people, status) {
  var anchor = cc2Anchor();
  var host = document.getElementById(CC2_ID);
  var count, countEl, icon;

  if (!anchor) {
    return; // the shell has not drawn the user block yet — try again next tick
  }
  // Nobody here and nothing to say: remove rather than draw an empty indicator.
  if (!status && (!people || !people.length)) {
    cc2HidePopup();
    if (host && host.parentNode) {
      host.parentNode.removeChild(host);
    }
    return;
  }

  if (!host) {
    host = document.createElement("span");
    host.id = CC2_ID;
    host.style.marginRight = "8px";
    host.style.cursor = "default";
    icon = document.createElement("span");
    // font-awesome is already loaded by the shell, so this matches the page's own
    // iconography rather than importing an image of our own.
    icon.className = "fa fa-users";
    icon.setAttribute("aria-hidden", "true");
    host.appendChild(icon);
    countEl = document.createElement("span");
    countEl.id = CC2_COUNT_ID;
    countEl.style.marginLeft = "3px";
    countEl.style.fontWeight = "bold";
    countEl.style.color = CC2_COUNT_COLOUR;
    host.appendChild(countEl);
    host.addEventListener("mouseover", function () {
      cc2ShowPopup(host);
    });
    host.addEventListener("mouseout", function () {
      cc2HidePopup();
    });
    anchor.parentNode.insertBefore(host, anchor);
  }

  cc2Lines = status ? [] : cc2Lines_(people);
  count = status ? status : String(people.length);
  countEl = document.getElementById(CC2_COUNT_ID);
  if (countEl) {
    countEl.textContent = "(" + count + ")";
  }
  // A screen reader gets the roster as text; the popup is decoration over it.
  host.setAttribute("role", "text");
  host.setAttribute("aria-label", status ? "Presence: " + status : people.length + " people viewing this case: " + cc2Lines.join("; "));
  if (cc2Popup) {
    cc2ShowPopup(host);
  }
}
