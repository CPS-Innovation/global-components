/* cms-presence-client.src.js — presence client for CMS Modern and DCF.
 *
 * The whole deployed script: no vendor code, no Promise polyfill, nothing
 * patched onto the host page. build.sh emits it as ../cms-presence-client.js.
 *
 * !! DOCUMENT MODE 11 (Edge IE mode). The CMS estate is site-listed into IE mode:
 * /viewer/landing sends X-UA-Compatible IE=edge and /dcf/ sends IE=EmulateIE11,
 * both resolving to Trident document mode 11 (confirmed: document.documentMode
 * === 11 in both apps). So NO arrow functions, class, template literals, spread,
 * async/await, fetch, Map/Set or Promise. Mode 11 DOES give us JSON,
 * addEventListener, Object.keys and delete-on-window — a much softer constraint
 * than cms-auth-v2-client.js, which runs in document mode 5.
 *
 * WHY JSONP AND NOT SIGNALR
 * The SignalR client works (see cms-presence-client.signalr.src.js, kept as a
 * reference) but only where the page and the hub share an origin. Unproxied, the
 * host page is on a different origin: SignalR's negotiate step is an XHR, and
 * Windows zone setting 1406 answers a cross-domain XHR with a security dialog.
 * Skipping negotiate removes the client from Azure SignalR Service's delivery
 * path — you can invoke but never receive. JSONP uses <script src>, which the
 * zone does NOT gate, so it works in both topologies; Classic already relies on
 * it and must be supported long-term, so both legacy apps now share one
 * transport. The current apps stay pure SignalR.
 *
 * WHAT IT DOES
 *   1. Works out which app it is in and which case is on screen, from the URL.
 *   2. Holds ONE presence session for that screen's section:
 *        CMS Modern -> "<caseId>:CASE"          (on the case)
 *        DCF        -> "<caseId>:CASE_REVIEW"   (reviewing the case)
 *   3. Heartbeats and polls every 3s; recreates the session on a 410.
 *   4. Reconciles poll deltas by section version and renders a bar naming who
 *      else is here.
 *   5. Re-reconciles when the case changes — Modern is hash-routed, so a case
 *      change never reloads the page.
 *
 * The wire contract mirrors cms-auth-v2-client.js (the Classic client), which is
 * the reference implementation for this API. Ops go through the same njs adapter
 * (handlePresenceJsonp), which lifts the bearer from the presence cookie and adds
 * X-Watchdog-App-Name — so this script carries no credential.
 *
 * Everything is recorded on window.__ccPresence for inspection from the console,
 * which matters here because the IE console cannot be relied on.
 */
(function () {
  "use strict";

  // ---- configuration ------------------------------------------------------

  var JSONP_PATH = "/global-components/presence-jsonp";

  // Reported as the calling application. DCF and CMS Modern are one app in users'
  // minds, so the presence API models them under a single name. MUST be sent: the
  // njs adapter defaults a missing appName to "CMS Classic", which is right for
  // Classic and wrong for us.
  var APP_NAME = "CMS Modern";

  var TICK_MS = 3000; // heartbeat + poll, matching the Classic client
  var TIMEOUT_MS = 8000; // per-call watchdog — JSONP has no error event
  var POLL_MS = 2000; // how often to re-read the URL

  // ---- logging ------------------------------------------------------------

  var messages = [];
  var verbose = false;

  function log() {
    var args = Array.prototype.slice.call(arguments);
    messages.push({ at: new Date().toISOString(), args: args });
    if (messages.length > 200) {
      messages.shift();
    }
    try {
      if (window.console && window.console.log) {
        window.console.log.apply(window.console, ["[cc-presence]"].concat(args));
      }
    } catch (e) {
      // a host app with a hostile console must never break presence
    }
  }

  // ---- where do we call? --------------------------------------------------

  // Proxied, the page and the adapter share an origin and a relative path works.
  // UNPROXIED, the host page is on the CMS domain while we are served from the
  // proxy — a relative path would resolve to the wrong host. So derive the base
  // from our own <script src>, which is by definition the origin that served us.
  // (document.currentScript does not exist at document mode 11, hence the scan.)
  function jsonpBase() {
    try {
      var scripts = document.getElementsByTagName("script");
      var i;
      for (i = 0; i < scripts.length; i++) {
        var src = scripts[i].src || "";
        if (src.indexOf("cms-presence-client.js") !== -1) {
          var match = /^(https?:\/\/[^/]+)/.exec(src);
          if (match) {
            return match[1] + JSONP_PATH;
          }
        }
      }
    } catch (e) {
      // fall through to the relative path
    }
    return JSONP_PATH;
  }

  var BASE = jsonpBase();

  // ---- where are we? ------------------------------------------------------

  // DCF:    /dcf/review/<caseId>/<userGuid>?wid=MASTER
  // Modern: /viewer/landing#/case-summary/<caseId>/<userGuid>
  //         /viewer/landing#/disclosure/<caseId>/...
  // Modern's caseId lives in the hash, which never reaches the server — the only
  // place it can be read is here.
  function readContext() {
    var path = String(window.location.pathname || "");
    var hash = String(window.location.hash || "");
    var match;

    match = /^\/dcf\/([^/]+)\/(\d+)/.exec(path);
    if (match) {
      return { app: "DCF", screen: match[1], caseId: match[2], kind: "CASE_REVIEW" };
    }

    if (path.indexOf("/viewer/") === 0) {
      match = /^#\/([^/?]+)\/(\d+)/.exec(hash);
      if (match) {
        return { app: "CMS Modern", screen: match[1], caseId: match[2], kind: "CASE" };
      }
      return { app: "CMS Modern", screen: hash.replace(/^#\//, "") || "landing", caseId: null, kind: null };
    }

    return { app: null, screen: null, caseId: null, kind: null };
  }

  // Case-wide kinds carry NO subject and NO trailing colon — "544545:CASE", not
  // "544545:CASE:". Matches how the Classic client builds them.
  function sectionIdFor(context) {
    return context.caseId ? context.caseId + ":" + context.kind : null;
  }

  // ---- the JSONP call -----------------------------------------------------

  var seq = 0;

  // onData receives the executed object/array, or null when the call timed out.
  // JSONP has no error event, hence the watchdog.
  function jsonp(op, params, onData) {
    seq = seq + 1;
    var cbName = "__ccpj_" + seq;
    var done = false;
    var script = null;
    var timer = null;

    function cleanup() {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      try {
        // Document mode 11 CAN delete a window expando, so unlike the Classic
        // client (mode 5) we need no free-list of reusable callback names.
        delete window[cbName];
      } catch (e1) {
        window[cbName] = undefined;
      }
      try {
        if (script && script.parentNode) {
          script.parentNode.removeChild(script);
        }
      } catch (e2) {
        // the tag is inert either way
      }
    }

    window[cbName] = function (data) {
      if (done) {
        return;
      }
      done = true;
      cleanup();
      onData(data);
    };

    var url = BASE + "?op=" + encodeURIComponent(op);
    var key;
    for (key in params) {
      if (params.hasOwnProperty(key)) {
        url = url + "&" + key + "=" + encodeURIComponent(params[key]);
      }
    }
    url = url + "&appName=" + encodeURIComponent(APP_NAME);
    url = url + "&callback=" + cbName + "&_=" + seq;

    timer = window.setTimeout(function () {
      if (done) {
        return;
      }
      done = true;
      cleanup();
      if (verbose) {
        log("jsonp timeout", op);
      }
      onData(null);
    }, TIMEOUT_MS);

    try {
      script = document.createElement("script");
      script.type = "text/javascript";
      script.src = url;
      document.documentElement.appendChild(script);
    } catch (e) {
      if (!done) {
        done = true;
        cleanup();
        onData(null);
      }
    }
  }

  // ---- roster: what the server has told us ---------------------------------

  // Keyed by section identity, each entry { caseId, kind, subjectId, version,
  // members }. Poll returns DELTAS and gives no ordering guarantee, so a
  // snapshot replaces the cached roster only when its version is strictly newer.
  // An empty members array at a newer version correctly clears that section.
  var sections = {};

  function sectionKey(section) {
    if (!section) {
      return "";
    }
    var caseId = section.caseId != null ? String(section.caseId) : "";
    var kind = section.kind != null ? String(section.kind) : "";
    var subjectId = section.subjectId != null ? String(section.subjectId) : "";
    var key = caseId + ":" + kind;
    if (subjectId !== "") {
      key = key + ":" + subjectId;
    }
    return key;
  }

  function normaliseMembers(members) {
    var out = [];
    if (!members || typeof members.length !== "number") {
      return out;
    }
    var i;
    for (i = 0; i < members.length; i++) {
      var m = members[i];
      if (m && m.userEmail) {
        out.push({
          userEmail: m.userEmail,
          sourceApplication: m.sourceApplication ? m.sourceApplication : "",
          joinedAt: m.joinedAt ? m.joinedAt : ""
        });
      }
    }
    return out;
  }

  // Apply one poll response. Returns true if anything changed, so we only redraw
  // and log on real news.
  function applyNotifications(data) {
    if (!data || typeof data.length !== "number") {
      return false;
    }
    var changed = false;
    var n;
    for (n = 0; n < data.length; n++) {
      var notif = data[n];
      if (!notif || !notif.payload) {
        continue;
      }
      var snaps = notif.payload.snapshots;
      if (!snaps || typeof snaps.length !== "number") {
        continue;
      }
      var s;
      for (s = 0; s < snaps.length; s++) {
        var snap = snaps[s];
        if (!snap) {
          continue;
        }
        var key = sectionKey(snap.section);
        if (!key) {
          continue;
        }
        var version = snap.version;
        if (typeof version !== "number") {
          version = parseInt(version, 10);
        }
        var current = sections[key];
        if (current && typeof current.version === "number" && !isNaN(version) && version <= current.version) {
          continue; // stale / out-of-order — keep the newer cached roster
        }
        sections[key] = {
          caseId: snap.section && snap.section.caseId != null ? String(snap.section.caseId) : "",
          kind: snap.section && snap.section.kind != null ? String(snap.section.kind) : "",
          subjectId: snap.section && snap.section.subjectId != null ? String(snap.section.subjectId) : "",
          version: version,
          members: normaliseMembers(snap.members)
        };
        changed = true;
      }
    }
    return changed;
  }

  // ONE PERSON, ONE ENTRY. Someone can be in several sections at once — on the
  // case and editing a witness within it — and the UI must say that once, listing
  // their regions, rather than showing them twice.
  function buildRoster() {
    var byUser = {};
    var order = [];
    var keys = Object.keys(sections);
    var i;
    for (i = 0; i < keys.length; i++) {
      var entry = sections[keys[i]];
      var j;
      for (j = 0; j < entry.members.length; j++) {
        var member = entry.members[j];
        var id = String(member.userEmail || "").toLowerCase();
        if (!id) {
          continue;
        }
        if (!byUser[id]) {
          byUser[id] = { userEmail: member.userEmail, regions: [], apps: [] };
          order.push(id);
        }
        byUser[id].regions.push(entry.kind + (entry.subjectId ? ":" + entry.subjectId : ""));
        if (member.sourceApplication && byUser[id].apps.indexOf(member.sourceApplication) === -1) {
          byUser[id].apps.push(member.sourceApplication);
        }
      }
    }
    var people = [];
    for (i = 0; i < order.length; i++) {
      people.push(byUser[order[i]]);
    }
    return people;
  }

  function describeRoster() {
    var people = buildRoster();
    if (!people.length) {
      return "(nobody)";
    }
    var parts = [];
    var i;
    for (i = 0; i < people.length; i++) {
      parts.push(people[i].userEmail + " [" + people[i].regions.join(",") + "]" + (people[i].apps.length ? " via " + people[i].apps.join(",") : ""));
    }
    return parts.join(" | ");
  }

  // ---- UI: the presence bar ------------------------------------------------

  // GOV.UK Design System colours, copied rather than linked — the host apps have
  // their own stylesheets and we are a guest on their page. No external CSS, no
  // class names that could collide, one element, all styles inline.
  var GDS_DARK_BLUE = "#003078"; // govuk-colour("dark-blue")
  var GDS_WHITE = "#ffffff";
  var BAR_ID = "ccPresenceBar";

  // Most specific region wins the wording: someone reviewing a case is also on
  // the case, and "is reviewing" is the more useful thing to say.
  function describePerson(person) {
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
    var app = person.apps.length ? person.apps[0] : APP_NAME;
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

  function renderBar() {
    try {
      var people = buildRoster();
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
        lines.push(describePerson(people[i]));
      }
      bar.textContent = lines.join("  ·  ");
    } catch (e) {
      // never let presentation break the host page
    }
  }

  // ---- the session --------------------------------------------------------

  var sessionId = "";
  var activeSectionId = "";
  var tickTimer = null;
  var stats = { creates: 0, heartbeats: 0, polls: 0, errors: 0, restarts: 0, lastTickAt: null };

  function stopTicking() {
    if (tickTimer) {
      window.clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  function stopSession() {
    stopTicking();
    if (sessionId) {
      log("removing session", sessionId, activeSectionId);
      // Best-effort DELETE on leave. NOT guaranteed on tab-close — the server's
      // TTL is the real backstop, which is why the heartbeat exists at all.
      jsonp("remove", { sid: sessionId }, function () {});
    }
    sessionId = "";
    activeSectionId = "";
    sections = {}; // fresh reconciliation state per session
    removeBar();
  }

  // A 410 on heartbeat means the Watchdog no longer knows this session. Without a
  // session we cannot poll, so tear down and rebuild on the same section.
  function restartSession() {
    var sid = activeSectionId;
    stats.restarts = stats.restarts + 1;
    stopSession();
    if (sid) {
      startSession(sid);
    }
  }

  function tick() {
    try {
      if (!sessionId) {
        return;
      }
      var mine = sessionId; // capture: ignore callbacks whose session was superseded
      stats.lastTickAt = new Date().toISOString();

      jsonp("heartbeat", { sid: mine }, function (data) {
        if (sessionId !== mine) {
          return; // superseded by a restart, stop, or section switch
        }
        if (data === null) {
          return; // transient timeout — just retry on the next tick
        }
        if (data.jsonpError) {
          stats.errors = stats.errors + 1;
          if (data.jsonpError.indexOf("410") > -1) {
            log("heartbeat: session expired (410) — recreating");
            restartSession();
          } else {
            log("heartbeat FAILED", data.jsonpError);
          }
          return;
        }
        stats.heartbeats = stats.heartbeats + 1;
        if (verbose) {
          log("heartbeat ok", "#" + stats.heartbeats);
        }
      });

      jsonp("poll", { sid: mine }, function (data) {
        if (sessionId !== mine) {
          return;
        }
        if (data === null) {
          if (verbose) {
            log("poll: no response (timeout)");
          }
          return;
        }
        if (data.jsonpError) {
          stats.errors = stats.errors + 1;
          log("poll FAILED", data.jsonpError);
          return;
        }
        stats.polls = stats.polls + 1;
        // An empty array applies nothing and leaves the current rosters standing.
        if (applyNotifications(data)) {
          log("roster", activeSectionId, describeRoster());
          renderBar();
        } else if (verbose) {
          log("poll: no change", "#" + stats.polls);
        }
      });
    } catch (e) {
      // a throw here would kill the interval — never let that happen
    }
  }

  function startSession(sectionId) {
    activeSectionId = sectionId;
    log("creating session", sectionId, "as", APP_NAME);
    jsonp("create", { sectionId: sectionId }, function (data) {
      if (activeSectionId !== sectionId) {
        return; // superseded while in flight
      }
      if (data === null || data.jsonpError || !data.sessionId) {
        var why = data === null ? "no response (timeout)" : data.jsonpError || "no sessionId in response";
        stats.errors = stats.errors + 1;
        log("create FAILED", sectionId, why);
        return;
      }
      stats.creates = stats.creates + 1;
      sessionId = data.sessionId;
      log("session", sessionId, "for", sectionId);
      tick();
      tickTimer = window.setInterval(tick, TICK_MS);
    });
  }

  function reconcile() {
    var context = readContext();
    var wanted = sectionIdFor(context);
    if (wanted === activeSectionId || (!wanted && !activeSectionId)) {
      return;
    }
    if (activeSectionId) {
      stopSession();
    }
    if (wanted) {
      startSession(wanted);
    }
  }

  // ---- boot ---------------------------------------------------------------

  window.__ccPresence = {
    messages: messages,
    context: readContext,
    status: function () {
      return {
        base: BASE,
        appName: APP_NAME,
        activeSectionId: activeSectionId,
        sessionId: sessionId,
        tickEveryMs: TICK_MS,
        stats: stats,
        context: readContext()
      };
    },
    roster: buildRoster,
    describeRoster: describeRoster,
    sections: function () {
      return sections;
    },
    reconcile: reconcile,
    leave: stopSession,
    setVerbose: function (on) {
      verbose = !!on;
      log("verbose", verbose ? "on" : "off");
      return verbose;
    }
  };

  log("client loaded", window.location.href, "base=" + BASE);
  reconcile();
  window.setInterval(reconcile, POLL_MS);

  if (window.addEventListener) {
    window.addEventListener("hashchange", reconcile, false);
    // Best-effort tidy-up so the server need not wait out the TTL.
    window.addEventListener("unload", function () {
      stopSession();
    }, false);
  }
})();
