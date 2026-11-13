// ---------------------------------------------------------------------------
// global-components.vnext — the ADVANCE copy of changes to Polaris's
// global-components feature (features/global-components/global-components.js).
//
// Everything here is on its way into Polaris's module by PR. Until that PR is
// deployed, this module serves the changed routes; once it is, Polaris's own
// locations win and these go quiet (see the .conf header for how). So:
//
//   - Anything marked COPIED is Polaris's code verbatim, so that a route we take
//     over behaves exactly as theirs for every request we did not mean to change.
//   - Anything marked OURS is the change the PR carries.
//
// Mapping onto the PR is then mechanical: OURS goes into their file, COPIED is
// already there.
//
// COPIED is as of Polaris 6e509401a (2026-10-30), checked 2026-11-13. See the
// README's "Base" section for how to tell whether Polaris has moved since.
// ---------------------------------------------------------------------------

// ---- COPIED from Polaris's global-components.js: state helpers ------------

const STATE_COOKIE_NAME = "cps-global-components-state";
const STATE_COOKIE_LIFESPAN_MS = 365 * 24 * 60 * 60 * 1000;
function _getHeaderValue(r, headerName) {
  return r.headersIn[headerName] || "";
}
function _getCookieValue(r, cookieName) {
  const cookies = _getHeaderValue(r, "Cookie");
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]*)`));
  return match ? match[1] : "";
}
function _maybeDecodeURIComponent(value) {
  // Check if value appears not to be URL-encoded
  // (does not contain %XX patterns)
  if (!/%[0-9A-Fa-f]{2}/.test(value)) {
    return value;
  }
  try {
    return decodeURIComponent(value);
  } catch (e) {
    return value;
  }
}
// OURS: UTF-8 safe. Polaris's btoa/atob pair throws on any character above
// U+00FF, so a PUT carrying non-Latin1 text (the preview payload can hold it,
// from CMS/GraphQL) fails with a 500, and atob hands back Latin1 bytes rather
// than text. Buffer encodes and decodes UTF-8; for ASCII, which is what every
// state value so far has been, the bytes are identical, so existing cookies
// read back unchanged. (cms-augmentation's preview route used Buffer for this
// reason until this module took the state route over.)
// PR: replaces _wrapState/_unwrapState (their _base64UrlEncode/_base64UrlDecode
// are then unused there, as here).
function _wrapState(plaintext) {
  return Buffer.from(plaintext, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function _unwrapState(wrapped) {
  // Buffer does not throw on junk the way atob does (it drops what it cannot
  // read), so reject what atob would have: anything outside base64url, or an
  // impossible length. A corrupt cookie still reads as null.
  const bare = wrapped.replace(/={1,2}$/, "");
  if (!/^[A-Za-z0-9_-]*$/.test(bare) || bare.length % 4 === 1) {
    return null;
  }
  try {
    return Buffer.from(
      wrapped.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
  } catch (e) {
    // If decode fails, return null (corrupted or legacy data)
    return null;
  }
}
function _buildCookieString(name, value, options) {
  let cookie = name + "=" + value;
  if (options === null || options === void 0 ? void 0 : options.Path) {
    cookie += "; Path=" + options.Path;
  }
  if (options === null || options === void 0 ? void 0 : options.Expires) {
    cookie += "; Expires=" + options.Expires.toUTCString();
  }
  if (options === null || options === void 0 ? void 0 : options.Secure) {
    cookie += "; Secure";
  }
  if (options === null || options === void 0 ? void 0 : options.SameSite) {
    cookie += "; SameSite=" + options.SameSite;
  }
  return cookie;
}
function _setCookie(r, name, value, options) {
  const cookie = _buildCookieString(name, value, options);
  // njs headersOut["Set-Cookie"] accepts either string or string[]
  // For multiple cookies, we need to use an array
  const existing = r.headersOut["Set-Cookie"];
  if (existing) {
    if (Array.isArray(existing)) {
      existing.push(cookie);
    } else {
      // Convert single string to array and add new cookie
      r.headersOut["Set-Cookie"] = [existing, cookie];
    }
  } else {
    // First cookie - use string for compatibility
    r.headersOut["Set-Cookie"] = cookie;
  }
}
function _extractDomainFromSessionHint(r) {
  var cookies = r.headersIn["Cookie"] || "";
  var match = cookies.match(/Cms-Session-Hint=([^;]+)/);
  if (!match) return "";
  try {
    var decoded = decodeURIComponent(match[1]);
    var parsed = JSON.parse(decoded);
    var endpoint = parsed.handoverEndpoint || "";
    var domainMatch = endpoint.match(/https?:\/\/([^\/]+)/);
    return domainMatch ? domainMatch[1] : "";
  } catch (e) {
    return "";
  }
}

// ---- OURS: helpers for the additions below ---------------------------------

// The raw (still percent-encoded) query value nginx exposes as $arg_<name>, or
// null when absent.
function _getQueryParam(r, name) {
  const v = r.variables["arg_" + name];
  return v !== undefined ? v : null;
}

// Write (or clear, for "null"/"") the state cookie for THIS request's engine at
// this request's path: exactly what handleState's PUT does, minus the response.
function _writeStateCookie(r, body) {
  if (body === "null" || body === "") {
    _setCookie(r, STATE_COOKIE_NAME, "", {
      Path: r.uri,
      Expires: new Date(0),
      Secure: true,
      SameSite: "None",
    });
    return;
  }
  _setCookie(r, STATE_COOKIE_NAME, _wrapState(body), {
    Path: r.uri,
    Expires: new Date(Date.now() + STATE_COOKIE_LIFESPAN_MS),
    Secure: true,
    SameSite: "None",
  });
}

// The stored state RE-SERIALISED from a parse, or "null". For the JSONP read
// only, whose body is EVALUATED in a <script> in every CMS page: _unwrapState
// does not reject a mangled cookie (atob drops what it cannot read and decodes
// the rest), so passing the bytes through could put a syntax error, or worse,
// into the page. A well-formed cookie round-trips byte-identically. The plain
// GET keeps Polaris's pass-through, unchanged.
function _readStateStrict(r) {
  const cookieValue = _getCookieValue(r, STATE_COOKIE_NAME);
  if (!cookieValue) {
    return "null";
  }
  const unwrapped = _unwrapState(_maybeDecodeURIComponent(cookieValue));
  if (unwrapped === null) {
    return "null";
  }
  try {
    return JSON.stringify(JSON.parse(unwrapped));
  } catch (e) {
    return "null";
  }
}

// GET ?set=<json>&return=<path>: the NAVIGATION that writes BOTH cookie jars.
//
// A fetch PUT can only ever write Edge's jar. The legacy clients (CMS Classic
// at document mode 5, Modern/DCF at 11) run in IE mode and read WinINet's, and
// the engine is chosen by X-InternetExplorerMode on a TOP-LEVEL navigation, so
// no XHR or iframe can cross. Two passes over the same URL, one jar each; `done`
// records which engine has had its turn so the second pass stops. A write on a
// GET, because a 302 carries no body; the same shape as the OS host switch.
//
// Without "configurable" (the enterprise site list, folded into $ieaction by
// nginx.conf) the tab cannot flip and only the current jar is written. That is
// a silent partial success, so it is logged.
function _handleStateSet(r, rawSet) {
  const body = decodeURIComponent(rawSet).trim();
  const returnTo = decodeURIComponent(_getQueryParam(r, "return") || "");
  const done = _getQueryParam(r, "done") || "";

  // Same-host absolute paths only, so this cannot bounce a user off-site.
  const safeReturn = /^\/(?!\/)/.test(returnTo) ? returnTo : "/";

  const ieaction = r.variables["ieaction"] || "";
  const engine = ieaction.indexOf("ie+") === 0 ? "ie" : "edge";
  const configurable = ieaction.indexOf("+configurable+") !== -1;

  _writeStateCookie(r, body);

  if (!done && configurable) {
    r.headersOut["X-InternetExplorerMode"] = engine === "edge" ? "1" : "0";
    r.return(
      302,
      r.uri +
        "?set=" +
        encodeURIComponent(body) +
        "&return=" +
        encodeURIComponent(safeReturn) +
        "&done=" +
        engine,
    );
    return;
  }

  ngx.log(
    ngx.WARN,
    "[state] set " +
      r.uri +
      " engine=" +
      engine +
      " done=" +
      (done || "(first)") +
      " jars=" +
      (configurable ? "both" : engine + " only (site cannot flip)") +
      (body === "" || body === "null" ? " cleared" : ""),
  );

  // Finish in Edge: the pages that start this live there.
  if (engine === "ie" && configurable) {
    r.headersOut["X-InternetExplorerMode"] = "0";
  }
  r.return(302, safeReturn);
}

// ---- COPIED from Polaris, with OURS marked inline: handleState -------------
//
// PR: replaces handleState in global-components.js.
async function handleState(r) {
  // OURS: no response from this route is cacheable. Every answer depends on a
  // cookie (and the ?set= 302s write one), so a cached copy is someone's stale
  // state. Polaris's server block would add no-store, but the location's own
  // add_header (CORS) switches that inheritance off, so the plain GET went out
  // with no Cache-Control at all. Set here, once, so the PR copy carries it.
  r.headersOut["Cache-Control"] = "no-store";
  if (!["GET", "PUT"].includes(r.method)) {
    // Method not allowed
    r.return(405, JSON.stringify({ error: "Method not allowed" }));
    return;
  }
  r.headersOut["Content-Type"] = "application/json";
  if (r.method === "GET") {
    // OURS: GET ?set= — the dual-engine write (see _handleStateSet).
    const set = _getQueryParam(r, "set");
    if (set !== null) {
      _handleStateSet(r, set);
      return;
    }
    // OURS: GET ?callback= — JSONP. The IE "access data sources across domains"
    // zone forbids cross-origin XHR in this estate but not <script src>, and an
    // evaluated body needs no JSON parser (document mode 5 has none). The
    // callback is interpolated into script, so only an identifier gets through.
    const callback = _getQueryParam(r, "callback");
    if (callback !== null) {
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(callback)) {
        r.return(400, JSON.stringify({ error: "bad callback" }));
        return;
      }
      r.headersOut["Content-Type"] = "application/javascript; charset=utf-8";
      // no-store (set above) matters most here: the answer depends on a cookie
      // the client cannot see change, and the legacy clients' cache-buster
      // restarts every page load, so the URL repeats. Without it, IE mode reuses
      // an old script and serves stale flags.
      r.return(200, callback + "(" + _readStateStrict(r) + ")");
      return;
    }
    // Get wrapped state from cookie and unwrap it
    const cookieValue = _getCookieValue(r, STATE_COOKIE_NAME);
    if (!cookieValue) {
      r.return(200, "null");
      return;
    }
    const unwrapped = _unwrapState(_maybeDecodeURIComponent(cookieValue));
    r.return(200, unwrapped !== null ? unwrapped : "null");
    return;
  }
  if (r.method === "PUT") {
    const body = (r.requestText || "").trim();
    // If body is "null" or empty, clear the cookie by setting it to expire in the past
    if (body === "null" || body === "") {
      _setCookie(r, STATE_COOKIE_NAME, "", {
        Path: r.uri,
        Expires: new Date(0), // Expire immediately (clears cookie)
        Secure: true,
        SameSite: "None",
      });
      r.return(
        200,
        JSON.stringify({ success: true, path: r.uri, cleared: true }),
      );
      return;
    }
    // Wrap the body and store in cookie
    const wrapped = _wrapState(body);
    _setCookie(r, STATE_COOKIE_NAME, wrapped, {
      Path: r.uri,
      Expires: new Date(Date.now() + STATE_COOKIE_LIFESPAN_MS), // 1 year
      Secure: true,
      SameSite: "None",
    });
    r.return(200, JSON.stringify({ success: true, path: r.uri }));
    return;
  }
}

// ---- OURS (RNAV-43): CMS Modern navigation page ----------------------------
//
// PR: add to global-components.js, beside handleNavigateCms.
//
// The IE-mode page that moves an already-open CMS Modern tab to a case.
//
// Classic opens Modern with window.open(url, "MODERN_CMS"); window names don't
// resolve across the Edge/IE-mode boundary, hence IE mode. Modern routes on the
// hash, so a URL differing only after /viewer/landing# moves the tab without a
// reload, keeping its session, and the guid-less case route loads the case.
// No MODERN_CMS window means window.open made a blank one (readable, same
// origin as us), which we close; Modern can't be opened without Classic's guid.
function _modernCmsNavigatePage(proto, cmsDomain, caseId) {
  const modernUrl =
    proto + "://" + cmsDomain + "/viewer/landing#/case-summary/" + caseId;
  const closeUrl = "/global-components/navigate-cms?step=close";
  const heading = "Opening case in CMS Modern";

  // ES3 only: this runs in IE mode. An existing Modern tab on another origin
  // makes reading its location throw.
  const script =
    "var w = window.open('', 'MODERN_CMS');" +
    "var href = null;" +
    "try { href = w.location.href; } catch (e) {}" +
    "if (href === 'about:blank') {" +
    "  w.close();" +
    "  document.getElementById('status').innerHTML = 'CMS Modern is not open. Open it from CMS Classic, then try again.';" +
    "} else {" +
    "  w.location.href = '" + modernUrl + "';" +
    "  w.focus();" +
    "  window.location.href = '" + closeUrl + "';" +
    "}";

  return (
    "<!DOCTYPE html>" +
    "<html><head><title>" +
    heading +
    "</title></head>" +
    '<body style="font-family: Arial, sans-serif; margin: 30px;">' +
    '<h1 style="font-size: 24px; font-weight: 700; margin: 0 0 20px 0;">' +
    heading +
    "</h1>" +
    '<div style="border-left: 10px solid #b1b4b6; padding: 15px; margin: 0; clear: both;">' +
    '<p id="status" style="font-size: 16px; margin: 0;">Please do not close this window. It will close automatically.</p>' +
    "</div>" +
    "<script>" +
    script +
    "</script>" +
    "</body></html>"
  );
}

// ---- COPIED from Polaris, with OURS marked inline: handleNavigateCms -------
//
// PR: replaces handleNavigateCms in global-components.js.
function handleNavigateCms(r) {
  var ieaction = r.variables.ieaction || "";
  var step = r.args.step || "";
  var proto = r.headersIn["X-Forwarded-Proto"] || "https";
  var host = r.headersIn["Host"] || "";
  // === CLOSE PHASE ===
  if (step === "close") {
    // If in IE mode with configurable: redirect to self to exit IE mode
    if (ieaction === "ie+configurable+") {
      r.headersOut["X-InternetExplorerMode"] = "0";
      r.return(302, proto + "://" + host + r.uri + "?step=close");
      return;
    }
    // Now in Edge (or non-configurable): close the window
    r.headersOut["Content-Type"] = "text/html";
    r.return(200, "<html><body><script>window.close();</script></body></html>");
    return;
  }
  // === OPEN PHASE ===
  // If non-IE browser with configurable IE mode: extract CMS domain from
  // cookie (only available in Edge, not in IE mode) and pass it as a query
  // param so IE mode can use it.
  if (ieaction === "nonie+configurable+") {
    var domain = _extractDomainFromSessionHint(r);
    if (!domain) {
      r.headersOut["Content-Type"] = "text/html";
      r.return(
        400,
        "<html><body><p>Error: could not determine CMS domain from session.</p></body></html>",
      );
      return;
    }
    var args = r.variables.args || "";
    var separator = args ? "&" : "";
    r.headersOut["X-InternetExplorerMode"] = "1";
    r.return(
      302,
      proto +
        "://" +
        host +
        r.uri +
        "?" +
        args +
        separator +
        "cmsDomain=" +
        encodeURIComponent(domain),
    );
    return;
  }
  // Now in IE mode (or non-configurable): get domain from query param (IE) or cookie (non-configurable)
  var cmsDomain = r.args.cmsDomain || _extractDomainFromSessionHint(r);
  if (!cmsDomain) {
    r.headersOut["Content-Type"] = "text/html";
    r.return(
      400,
      "<html><body><p>Error: could not determine CMS domain from session.</p></body></html>",
    );
    return;
  }
  var caseId = r.args.caseId || "";
  var taskId = r.args.taskId || "";
  // OURS (RNAV-43): target=modern drives CMS Modern instead of Classic.
  if (r.args.target === "modern") {
    // Both are written into script, so only a plain number and a bare host get through
    if (!/^\d+$/.test(caseId) || !/^[a-z0-9.-]+(:\d+)?$/i.test(cmsDomain)) {
      r.headersOut["Content-Type"] = "text/html";
      r.return(
        400,
        "<html><body><p>Error: caseId must be a number and cmsDomain a host.</p></body></html>",
      );
      return;
    }
    r.headersOut["Content-Type"] = "text/html";
    r.return(200, _modernCmsNavigatePage(proto, cmsDomain, caseId));
    return;
  }
  var iframeSrc = taskId
    ? proto +
      "://" +
      cmsDomain +
      "/CMSModern/Navigation/Notification.html?action=activate_task&screen=case_details&wId=MASTER&taskId=" +
      taskId +
      "&caseId=" +
      caseId
    : proto +
      "://" +
      cmsDomain +
      "/CMSModern/Navigation/Notification.html?action=navigate&screen=case_details&wId=MASTER&caseId=" +
      caseId;
  var closeUrl = "/global-components/navigate-cms?step=close";
  var heading = taskId ? "Opening task in CMS" : "Opening case in CMS";
  r.headersOut["Content-Type"] = "text/html";
  r.return(
    200,
    "<!DOCTYPE html>" +
      "<html><head><title>" +
      heading +
      "</title></head>" +
      '<body style="font-family: Arial, sans-serif; margin: 30px;">' +
      '<h1 style="font-size: 24px; font-weight: 700; margin: 0 0 20px 0;">' +
      heading +
      "</h1>" +
      '<div style="border-left: 10px solid #b1b4b6; padding: 15px; margin: 0; clear: both;">' +
      '<p style="font-size: 16px; margin: 0 0 10px 0;">This may take a few seconds.</p>' +
      '<p style="font-size: 16px; margin: 0;">Please do not close this window. It will close automatically when CMS has finished navigating.</p>' +
      "</div>" +
      '<iframe src="' +
      iframeSrc +
      '" style="display:none" onload="window.location.href=\'' +
      closeUrl +
      "'\"></iframe>" +
      "</body></html>",
  );
}

// ---- OURS: swagger -----------------------------------------------------------
//
// PR: add to global-components.js.

function _escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function filterSwaggerBody(r, data, flags) {
  // Point the doc at the route that actually proxies to MDS.
  //
  // WM_MDS_BASE_URL ends in /api/, and this proxy exposes that same surface at
  // /global-components/api/ (see the location block in global-components.conf).
  // So the api segment has to SURVIVE the rewrite: the doc's `servers` url
  // becomes https://<host>/global-components/api, and swagger-ui appends the
  // bare operation paths (/authenticate, ...) to it unchanged.
  //
  // Dropping that segment — as this did until 2026-09-22 — sends "Try it out"
  // to /global-components/authenticate, which matches no location block and
  // 404s. Operation paths are deliberately NOT rewritten: swagger-ui joins them
  // onto the server url itself, so touching them here doubles the prefix.
  const host = r.headersIn["Host"] || r.variables.host;
  const proxyBase = "https://" + host + "/global-components/api";

  // Strip trailing slash from base URL for matching (swagger may not include it)
  const baseUrl = r.variables.gloco_vnext_mds_base_url.replace(/\/$/, "");
  const pattern = new RegExp(_escapeRegExp(baseUrl), "g");

  r.sendBuffer(data.replace(pattern, proxyBase), flags);
}

export default {
  handleState,
  handleNavigateCms,
  filterSwaggerBody,
};
