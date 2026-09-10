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

// "someone@cps.gov.uk is in the case review — RCMS since 3.38pm"
//
// Assembled entirely from the shared tables, so this reads the same as the pinned
// notification in the web components: CCPSectionNames for where, CCPApps for the
// application, CCPJoined for when. It used to hardcode "is reviewing this case"
// off a CASE_REVIEW prefix test and name only the first of a person's
// applications, with no time at all.
function describePerson(person, fallbackApp) {
  var where = CCPSectionNames.describe(person.sections);
  var apps = [];
  var i, app, since;

  for (i = 0; i < person.apps.length; i++) {
    app = person.apps[i];
    since = CCPJoined.format(app.timeEntered);
    apps.push(since ? app.appDisplayName + " since " + since : app.appDisplayName);
  }
  // The API can report someone with no application at all. Naming the app we are
  // ourselves in would be a guess, so the fallback is only used when we have
  // nothing — better a bare name than a wrong one.
  if (!apps.length && fallbackApp) {
    apps.push(CCPApps.displayName(fallbackApp));
  }

  return person.username +
    (where ? " is in " + where : " is on this case") +
    (apps.length ? " — " + apps.join(", ") : "");
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
