/* modern/bar.js — the presence bar. MODERN/DCF ONLY.
 *
 * GOV.UK Design System colours, copied rather than linked: the host apps have
 * their own stylesheets and we are a guest on their page. No external CSS, no
 * class names that could collide, one element, all styles inline.
 *
 * Classic renders its own banner inside a CMS frame, so this is not shared.
 */

var GDS_DARK_BLUE = "#003078"; // govuk-colour("dark-blue")
var GDS_WHITE = "#ffffff";
var BAR_ID = "ccPresenceBar";

// Most specific region wins the wording: someone reviewing a case is also on the
// case, and "is reviewing" is the more useful thing to say.
function describePerson(person, fallbackApp) {
  var reviewing = false;
  var i;
  for (i = 0; i < person.regions.length; i++) {
    if (String(person.regions[i]).indexOf("CASE_REVIEW") === 0) {
      reviewing = true;
    }
  }
  if (reviewing) {
    return person.userEmail + " is reviewing this case";
  }
  var app = person.apps.length ? person.apps[0] : fallbackApp;
  return person.userEmail + " is also viewing this case in " + app;
}

function removeBar() {
  try {
    var existing = document.getElementById(BAR_ID);
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  } catch (e) {
    // never let presentation break the host page
  }
}

function renderBar(people, fallbackApp) {
  try {
    if (!people.length) {
      removeBar();
      return;
    }
    var bar = document.getElementById(BAR_ID);
    if (!bar) {
      bar = document.createElement("div");
      bar.id = BAR_ID;
      bar.style.position = "fixed";
      bar.style.bottom = "0";
      bar.style.right = "0";
      bar.style.width = "50%";
      bar.style.zIndex = "2147483000";
      bar.style.boxSizing = "border-box";
      bar.style.padding = "10px 15px";
      bar.style.background = GDS_DARK_BLUE;
      bar.style.color = GDS_WHITE;
      bar.style.font = '16px/1.25 "GDS Transport", arial, sans-serif';
      bar.style.borderTop = "2px solid " + GDS_WHITE;
      document.body.appendChild(bar);
    }
    // textContent, never innerHTML: these strings carry server-supplied email
    // addresses and this page is not ours to inject markup into.
    var lines = [];
    var i;
    for (i = 0; i < people.length; i++) {
      lines.push(describePerson(people[i], fallbackApp));
    }
    bar.textContent = lines.join("  ·  ");
  } catch (e) {
    // never let presentation break the host page
  }
}
