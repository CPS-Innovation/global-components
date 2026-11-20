// ---------------------------------------------------------------------------
// /launch-vca — open the Victims Case Application logged in — EXPERIMENTAL
//
// One URL that takes a user with a live CMS session straight into VCA, as if a
// "V" button had been pressed. It needs no Cms-Session-Hint: VCA users may never
// press P or C, so a hint may never have been written.
//
// The page finds a live CMS session the way polaris-ui's in-situ reauth does: a
// <script> tag per CMS handover endpoint, tried in order, each running the full
// /polaris → /init → /auth-refresh-inbound chain and ending on the JSONP
// /auth-refresh-termination?cb=<fn>, which answers {isSuccess, failReason}. The
// first success wins, and the page navigates to that endpoint with r = the OS
// handover on VCA's host, landing on VCA. See README.md beside this file.
//
// Probes carry skip-entra=1: /init's drop2 Entra round trip ends on an HTML page
// that a <script> tag cannot load (ERR_BLOCKED_BY_ORB). That needs the Polaris
// patch in infra/proxy/polaris-pending/auth-handover.drop2.entra/skip-entra.patch;
// without it, a live session reads as "failed to load" wherever Entra is on. The
// real launch has no flag, so it goes through Entra (and the MDS deposit).
//
// Removable: one exact-match location, nothing else depends on it.
// ---------------------------------------------------------------------------

// Per Polaris host: the environment its handover bundle is served for, VCA's
// OutSystems host (VCA stays on outsystemsenterprise.com, it is NOT moving to the
// oapps front door), and the CMS handover endpoints to probe, in order. The first
// follows the session hint, falling back to the environment's default CMS.
// cin2/4/5 have no /polaris of their own; they are reached through this proxy's.
const ENVIRONMENTS = {
  "polaris-qa-notprod.cps.gov.uk": {
    env: "test",
    vcaHost: "cps-tst.outsystemsenterprise.com",
    probeEndpoints: ["/auth-refresh-outbound", "https://cin3.cps.gov.uk/polaris", "/polaris"],
  },
};

// Per probe. A probe is the whole handover chain, including a CMS session lookup.
const PROBE_TIMEOUT_MS = 15000;

function _environmentFor(r) {
  const host = (r.headersIn["Host"] || "").split(":")[0].toLowerCase();
  return Object.prototype.hasOwnProperty.call(ENVIRONMENTS, host) ? { polarisHost: host, config: ENVIRONMENTS[host] } : undefined;
}

// The OS handover on VCA's host, landing on VCA's root (its default screen).
// Same shape and encoding as Polaris's /launch targets: src raw, the nested r encoded.
function _handoverUrl(polarisHost, config) {
  const src = "https://" + polarisHost + "/global-components/" + config.env + "/auth-handover.js";
  const landing = "https://" + config.vcaHost + "/VictimsCaseApplication/";
  return (
    "https://" + config.vcaHost + "/Casework_Patterns/auth-handover.html?src=" + src + "&stage=os-cookie-return&r=" + encodeURIComponent(landing)
  );
}

// JSON that is safe inside an inline <script>: no "<" can close the element.
function _scriptJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

// The page's script. ES3 on purpose: the page may open in IE mode.
const CLIENT_SCRIPT = [
  "(function (cfg) {",
  "  var statusEl = document.getElementById('status');",
  "  var continueEl = document.getElementById('continue');",
  "  var retryEl = document.getElementById('retry');",
  "  var logEl = document.getElementById('log');",
  "  function setText(el, text) {",
  "    if (typeof el.textContent === 'string') {",
  "      el.textContent = text;",
  "    } else {",
  "      el.innerText = text;",
  "    }",
  "  }",
  "  function log(endpoint, outcome) {",
  "    var li = document.createElement('li');",
  "    setText(li, endpoint + ': ' + outcome);",
  "    logEl.appendChild(li);",
  "  }",
  "  function probeUrl(endpoint, cb) {",
  "    return endpoint + '?skip-entra=1&r=' + encodeURIComponent(",
  "      '/auth-refresh-inbound?fail-correlation-id=null&polaris-ui-url=' +",
  "        encodeURIComponent('/auth-refresh-termination?cb=' + cb));",
  "  }",
  "  function launch(endpoint) {",
  "    var url = endpoint + '?r=' + encodeURIComponent(cfg.handover);",
  "    continueEl.href = url;",
  "    continueEl.style.display = '';",
  "    if (cfg.stay) {",
  "      setText(statusEl, 'Found your CMS session.');",
  "      return;",
  "    }",
  "    setText(statusEl, 'Found your CMS session. Opening Victims Case Application\\u2026');",
  "    window.location.replace(url);",
  "  }",
  "  function noneFound() {",
  "    setText(statusEl, 'We could not find a CMS session in this browser. Log in to CMS, then try again.');",
  "    retryEl.style.display = '';",
  "  }",
  "  function tryEndpoint(i) {",
  "    if (i >= cfg.endpoints.length) {",
  "      noneFound();",
  "      return;",
  "    }",
  "    var endpoint = cfg.endpoints[i];",
  "    var cb = 'launchVca_' + new Date().getTime() + '_' + i;",
  "    var script = document.createElement('script');",
  "    var done = false;",
  "    var timer;",
  "    function finish(isSuccess, outcome) {",
  "      if (done) {",
  "        return;",
  "      }",
  "      done = true;",
  "      clearTimeout(timer);",
  "      window[cb] = function () {};",
  "      log(endpoint, outcome);",
  "      if (isSuccess) {",
  "        launch(endpoint);",
  "      } else {",
  "        tryEndpoint(i + 1);",
  "      }",
  "    }",
  "    window[cb] = function (result) {",
  "      var ok = !!(result && result.isSuccess === true);",
  "      finish(ok, ok ? 'found' : 'no session (' + ((result && result.failReason) || 'unknown') + ')');",
  "    };",
  "    script.onerror = function () {",
  "      finish(false, 'failed to load');",
  "    };",
  // A script that loads but never calls back (not JSONP: an error page) fires
  // onload after it runs. A real callback runs first, so this is a no-op then.
  "    script.onload = function () {",
  "      finish(false, 'no answer');",
  "    };",
  "    timer = setTimeout(function () {",
  "      finish(false, 'timed out');",
  "    }, cfg.timeoutMs);",
  "    script.src = probeUrl(endpoint, cb);",
  "    document.getElementsByTagName('head')[0].appendChild(script);",
  "  }",
  "  tryEndpoint(0);",
  "})(LAUNCH_VCA);",
].join("\n");

function _page(clientConfig) {
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta http-equiv="X-UA-Compatible" content="IE=edge">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Opening Victims Case Application</title>",
    "<style>",
    "body { font-family: Arial, sans-serif; color: #0b0c0c; margin: 40px 16px; max-width: 640px; }",
    "h1 { font-size: 28px; }",
    "a { color: #1d70b8; }",
    "#log { color: #505a5f; font-size: 14px; margin-top: 40px; }",
    "</style>",
    "</head>",
    "<body>",
    "<h1>Victims Case Application</h1>",
    '<p id="status">Looking for your CMS session…</p>',
    '<p><a id="continue" href="#" style="display: none">Continue to Victims Case Application</a></p>',
    '<p><a id="retry" href="" style="display: none">Try again</a></p>',
    '<ul id="log"></ul>',
    "<script>",
    "var LAUNCH_VCA = " + _scriptJson(clientConfig) + ";",
    CLIENT_SCRIPT,
    "</script>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

// GET /launch-vca[?stay=1]
//   200 the launch page for this Polaris host's environment. stay=1 finds the
//   session but shows the link instead of following it (for checking the trial).
//   404 on a host with no environment here; 405 for anything but GET/HEAD.
function handleLaunchVca(r) {
  r.headersOut["Cache-Control"] = "no-store";
  if (r.method !== "GET" && r.method !== "HEAD") {
    r.headersOut["Content-Type"] = "text/plain; charset=utf-8";
    r.return(405, "Method not allowed\n");
    return;
  }
  const found = _environmentFor(r);
  if (!found) {
    r.headersOut["Content-Type"] = "text/plain; charset=utf-8";
    r.return(404, "/launch-vca is not configured for this host\n");
    return;
  }
  r.headersOut["Content-Type"] = "text/html; charset=utf-8";
  r.return(
    200,
    _page({
      endpoints: found.config.probeEndpoints,
      handover: _handoverUrl(found.polarisHost, found.config),
      timeoutMs: PROBE_TIMEOUT_MS,
      stay: r.args["stay"] === "1",
    }),
  );
}

export default {
  handleLaunchVca,
  ENVIRONMENTS,
  PROBE_TIMEOUT_MS,
};
