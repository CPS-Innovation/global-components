// ---------------------------------------------------------------------------
// CMS augmentation — what the proxy adds to the legacy CMS apps.
//
// The conf does the real job, and needs no njs for it: it injects our client
// scripts into CMS Classic (the frameset shell) and CMS Modern / DCF. This file is
// only the TEMPORARY tail that came with the module when it was split out of
// cms-auth-presence on 2026-11-10:
//
//   /global-components/state/preview          handleStatePreview — Polaris's state
//       route plus a JSONP read and a dual-engine ?set= write.
//   /global-components/diagnostic/clear-cookies   handleClearCookies (debug).
//
// Both are going to Polaris's own global-components module (config/main here,
// features/global-components there). Once that ships, delete this file and the
// js_import: the module becomes conf-only — no njs, no settings.
//
// No settings and no deploy-time tokens: nothing here talks to anything but the
// request.
// (The Watchdog adapter that used to live here is global-components.watchdog.)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _base64UrlDecode(str: string): string {
  // base64url -> utf-8. Buffer tolerates missing padding and decodes multibyte
  // text correctly (atob would only give Latin1 bytes).
  return Buffer.from(
    str.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  ).toString("utf8");
}

function _base64UrlEncode(str: string): string {
  // utf-8 -> base64url via Buffer (NOT btoa). btoa throws on any char >= U+0100,
  // and the state payload can hold non-Latin1 text from the CMS/GraphQL diag
  // previews, so btoa("...") blows up with "invalid character (>= U+00FF)".
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function _getCookie(r: NginxHTTPRequest, name: string): string | null {
  const cookies = r.headersIn["Cookie"];
  if (!cookies) return null;
  const match = (cookies as string).match(
    new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"),
  );
  return match ? match[1] : null;
}

function _getQueryParam(r: NginxHTTPRequest, name: string): string | null {
  const v = r.variables["arg_" + name];
  return v !== undefined ? (v as string) : null;
}

function _htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CMS augmentation: ${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    td, th { text-align: left; padding: 8px; border: 1px solid #ddd; word-break: break-all; }
    th { background: #f5f5f5; }
    td:first-child { width: 200px; white-space: nowrap; }
    .pass { color: #2e7d32; font-weight: bold; }
    .fail { color: #c62828; font-weight: bold; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
    a { color: #0066cc; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${body}
</body>
</html>`;
}

function _esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Render an unhandled exception straight to the HTTP response so it is visible
// in the browser (the deployed proxy's logs are not reachable). Never throws.
function _renderException(
  r: NginxHTTPRequest,
  where: string,
  e: unknown,
): void {
  const err = e as { message?: string; stack?: string; name?: string };
  const name = (err && err.name) || "Error";
  const msg = (err && err.message) || String(e);
  const stack = (err && err.stack) || "(no stack available)";
  try {
    ngx.log(
      ngx.ERR,
      "cms-augmentation unhandled in " + where + ": " + name + ": " + msg,
    );
  } catch {
    // ignore logging failures
  }
  try {
    r.headersOut["Content-Type"] = "text/html; charset=utf-8";
    r.return(
      500,
      _htmlPage(
        "Unhandled error in " + where,
        `<p class="fail">${_esc(name)}: ${_esc(msg)}</p>
         <h2>Stack</h2>
         <pre>${_esc(stack)}</pre>`,
      ),
    );
  } catch {
    // response already committed — nothing more we can do
  }
}


// Best-effort "clear every cookie the browser sent". We only see cookie NAMES
// in the request Cookie header (never their Path/Domain), so for each name we
// emit expiring Set-Cookie headers across the likely scopes: host-only (no
// Domain), the exact host, and each parent domain (down to two labels). Path is
// assumed "/" (the common case) — a cookie pinned to a deeper path can't be
// cleared blind. Runs server-side, so HttpOnly cookies are cleared too. Both
// Expires (which old IE honours) and Max-Age=0 are set.
function handleClearCookies(r: NginxHTTPRequest): void {
  const raw = r.headersIn["Cookie"] || "";
  const host = (r.headersIn["Host"] || "").split(":")[0];

  // Unique cookie names from the request header.
  const names: string[] = [];
  const seen: { [k: string]: boolean } = {};
  const parts = raw.split(/; */);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "") {
      continue;
    }
    const eq = parts[i].indexOf("=");
    const name = eq === -1 ? parts[i] : parts[i].substring(0, eq);
    if (name !== "" && !seen[name]) {
      seen[name] = true;
      names.push(name);
    }
  }

  // Domain scopes to attempt: "" = host-only (omit the Domain attribute), the
  // exact host, then each parent domain (drop the leftmost label) down to two
  // labels. (.gov.uk etc. are public suffixes the browser rejects — harmless.)
  const domains: string[] = ["", host];
  let labels = host.split(".");
  while (labels.length > 2) {
    labels = labels.slice(1);
    domains.push("." + labels.join("."));
  }

  const past = "Thu, 01 Jan 1970 00:00:00 GMT";
  const setCookies: string[] = [];
  for (let n = 0; n < names.length; n++) {
    for (let d = 0; d < domains.length; d++) {
      const domainAttr = domains[d] === "" ? "" : "; Domain=" + domains[d];
      setCookies.push(
        names[n] + "=; Path=/; Expires=" + past + "; Max-Age=0" + domainAttr,
      );
    }
  }
  r.headersOut["Set-Cookie"] = setCookies;
  r.headersOut["Cache-Control"] = "no-store";
  r.headersOut["Content-Type"] = "text/html; charset=utf-8";

  const listHtml =
    names.length === 0
      ? "<p>No cookies were sent.</p>"
      : "<ul>" +
        names.map((n) => "<li><code>" + _esc(n) + "</code></li>").join("") +
        "</ul>";

  r.return(
    200,
    _htmlPage(
      "Clear Cookies",
      `<p>Expired <strong>${names.length}</strong> cookie name(s) across ${domains.length} scope(s) ` +
        `(${setCookies.length} Set-Cookie header(s)), Path <code>/</code>.</p>` +
        listHtml +
        `<p>Reload, then check <a href="/global-components/diagnostic">/global-components/diagnostic</a> ` +
        `to confirm what remains. Anything pinned to a deeper Path (not <code>/</code>) can't be cleared blind.</p>`,
    ),
  );
}

// ---------------------------------------------------------------------------
// PREVIEW STATE, VISIBLE FROM IE MODE
//
// WE USURP ONE POLARIS ROUTE HERE, deliberately. The state endpoint belongs to
// main/global-components.conf — `location ~ ^/global-components/state/(.*)$`,
// served by `gloco.handleState` — which lives in the POLARIS repo
// (polaris-terraform/main-terraform) and is deployed by their terraform, not by
// our deploy.local.sh. An exact-match location in our own conf beats their
// regex wherever it is defined (the same trick, and the same reasoning, as the
// `location = /CMS.24.0.01/` block in our .conf), so we can take this one path
// without waiting on them. (The PR to them is in flight: Phase C, see the header.)
//
// WHY, when the cookie read/write below is a copy of theirs: a `fetch` PUT can
// never write the IE-mode cookie jar. The engine is a property of a DOCUMENT
// load — Edge decides it from the `X-InternetExplorerMode` response header on a
// TOP-LEVEL NAVIGATION — so no amount of XHR, and no iframe (which cannot
// change its own mode), can put a cookie where the legacy clients will see it.
// The preview app writes in Edge; Classic and Modern/DCF read WinINet. Same
// cookie name, same path, two jars, and the second one has always been empty.
//
// ONLY /state/preview. The other state keys (settings, auth-hint,
// dismissed-notifications) stay with Polaris's regex, because nothing in the
// IE-mode estate reads them.
//
// ADDITIVE AND REMOVABLE, which is the point. Delete the exact-match location
// from our .conf and Polaris's regex resumes serving this path, with the same
// cookie already in place — no migration, in either direction. If they ever
// take the two behaviours below into `handleState` themselves, we hand the
// route back by deletion and nothing has to be unpicked.
//
// THE COST, stated plainly: this key now diverges from the other three if
// Polaris changes handleState. The GET and PUT below are deliberately a
// faithful copy of theirs for that reason — behaviour identical, so the preview
// app and the web components cannot tell who answered.
// ---------------------------------------------------------------------------

// Must match main/global-components.ts EXACTLY: one name for every state key,
// distinguished only by Path. That is also why the Path below is r.uri and not
// a constant — writing this cookie at any other path would both miss the read
// and risk shadowing a sibling key's copy.
const _STATE_COOKIE_NAME = "cps-global-components-state";
const _STATE_COOKIE_LIFESPAN_MS = 365 * 24 * 60 * 60 * 1000;

// base64url, the same wrapping main uses. Nothing is copied but the two
// one-line calls.
const _wrapState = (plaintext: string): string => _base64UrlEncode(plaintext);
const _unwrapState = (wrapped: string): string | null => {
  try {
    return _base64UrlDecode(wrapped);
  } catch (e) {
    // Corrupt or legacy. null, so a bad cookie reads as "no preview" rather
    // than failing the request.
    return null;
  }
};

/**
 * Write the state cookie for THIS request's engine, at this request's path.
 *
 * `null`/empty clears it, matching main's PUT contract where a body of "null"
 * or "" is how the preview app turns everything off.
 */
function _setStateCookie(r: NginxHTTPRequest, json: string): void {
  const clearing = json === "" || json === "null";
  const expires = clearing
    ? new Date(0)
    : new Date(Date.now() + _STATE_COOKIE_LIFESPAN_MS);
  (r.headersOut as Record<string, string>)["Set-Cookie"] =
    _STATE_COOKIE_NAME +
    "=" +
    (clearing ? "" : _wrapState(json)) +
    "; Path=" +
    r.uri +
    "; Expires=" +
    expires.toUTCString() +
    "; Secure; SameSite=None";
}

/**
 * The preview state as stored, or "null" when there is none to report.
 *
 * STRICTER THAN MAIN'S READ, in one edge case, deliberately. _unwrapState leans
 * on its try/catch to reject a corrupt cookie, but Buffer.from(junk, "base64")
 * does not throw — it silently drops the characters it does not recognise and
 * decodes the rest — so a mangled cookie escapes as mojibake rather than as
 * null. Main has the same hole; it matters more here because this value is also
 * served as JSONP, where the body is EVALUATED and not parsed, so a few stray
 * bytes become a syntax error inside a <script> tag in every CMS page, or worse
 * if they happen to be valid script.
 *
 * So the value is re-serialised from a parse rather than passed through. A
 * well-formed cookie round-trips byte-identically, which is what keeps the
 * contract; anything else collapses to "null", which the clients already read
 * as "no preview".
 */
function _readState(r: NginxHTTPRequest): string {
  const raw = _getCookie(r, _STATE_COOKIE_NAME);
  if (!raw) {
    return "null";
  }
  const unwrapped = _unwrapState(decodeURIComponent(raw));
  if (unwrapped === null) {
    return "null";
  }
  try {
    return JSON.stringify(JSON.parse(unwrapped));
  } catch (e) {
    return "null";
  }
}

/**
 * `/global-components/state/preview`, in four shapes.
 *
 *   PUT                      write or clear      — main's contract, unchanged
 *   GET                      raw JSON            — main's contract, unchanged
 *   GET ?callback=cb         JSONP               — NEW, for document mode 5
 *   GET ?set=…&return=…      dual-engine write   — NEW, as a NAVIGATION
 *
 * THE JSONP READ IS NOT A CONVENIENCE. The IE "access data sources across
 * domains" zone (setting 1406) forbids cross-origin XHR in this estate but not
 * `<script src>` — which is why presence talks JSONP at all. It earns a second
 * keep: a JSONP body is EVALUATED, not parsed, so Classic receives a real
 * object and needs no JSON parser. Document mode 5 has no `JSON`, and a
 * mode-5-safe parser measured 742 bytes gzipped; this costs nothing.
 *
 * It has to live on THIS path, too. The cookie is scoped to it, so it is not
 * sent to /global-components/presence-jsonp — a preview op bolted onto the
 * presence adapter could not read the cookie it was asking about.
 */
async function handleStatePreview(r: NginxHTTPRequest): Promise<void> {
  if (r.method === "PUT") {
    _setStateCookie(r, (r.requestText || "").trim());
    r.headersOut["Content-Type"] = "application/json";
    r.return(200, JSON.stringify({ success: true, path: r.uri }));
    return;
  }

  if (r.method !== "GET") {
    r.headersOut["Content-Type"] = "application/json";
    r.return(405, JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const set = _getQueryParam(r, "set");
  if (set !== null) {
    _handleStatePreviewSet(r, set);
    return;
  }

  const json = _readState(r);

  // JSONP. The callback name is whitelisted for the same reason the presence
  // adapter whitelists its own: it is interpolated into a script body, so
  // anything but an identifier is an injection point.
  const callback = _getQueryParam(r, "callback");
  if (callback) {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(callback)) {
      r.headersOut["Content-Type"] = "application/json";
      r.return(400, JSON.stringify({ error: "bad callback" }));
      return;
    }
    r.headersOut["Content-Type"] = "application/javascript; charset=utf-8";
    r.return(200, callback + "(" + json + ")");
    return;
  }

  r.headersOut["Content-Type"] = "application/json";
  r.return(200, json);
}

/**
 * The navigation that writes BOTH cookie jars.
 *
 * Two passes over the same URL. Each pass writes the cookie for whichever
 * engine is currently rendering, then hands over to the other one; `done`
 * records which engine has already had its turn, so the second pass stops
 * rather than ping-ponging forever.
 *
 * The values travel as a query param because a 302 carries no body. That is
 * also why this is a write on a GET: not RESTful, but forced, and the same
 * shape as the proven OS-host switch in global-components.os-london-dublin-oapps-switch.
 *
 * `configurable` is Edge telling us, per request, that this site may be flipped
 * (the enterprise IE-mode site list, surfaced as
 * X-InternetExplorerModeConfigurable and folded into $ieaction by main's
 * nginx.conf). WHEN IT IS ABSENT WE CANNOT FLIP, and only the current jar gets
 * written — the same limit the OS switch has. That is a silent partial success,
 * so it is logged: "my preview did not apply in Classic" is otherwise
 * indistinguishable from a bug anywhere else in this chain.
 */
function _handleStatePreviewSet(r: NginxHTTPRequest, rawSet: string): void {
  const json = decodeURIComponent(rawSet).trim();
  const returnTo = decodeURIComponent(_getQueryParam(r, "return") || "");
  const done = _getQueryParam(r, "done") || "";

  // Same-host absolute paths only, so this cannot be used to bounce a user off
  // to another origin. Matches the OS switch's guard.
  const safeReturn = /^\/(?!\/)/.test(returnTo) ? returnTo : "/";

  const ieaction = (r.variables["ieaction"] as string) || "";
  const engine = ieaction.indexOf("ie+") === 0 ? "ie" : "edge";
  const configurable = ieaction.indexOf("+configurable+") !== -1;

  _setStateCookie(r, json);

  if (!done && configurable) {
    // Over to the other engine to write its copy of the same cookie.
    r.headersOut["X-InternetExplorerMode"] = engine === "edge" ? "1" : "0";
    r.return(
      302,
      r.uri +
        "?set=" +
        encodeURIComponent(json) +
        "&return=" +
        encodeURIComponent(safeReturn) +
        "&done=" +
        engine,
    );
    return;
  }

  ngx.log(
    ngx.WARN,
    "[presence] preview set engine=" +
      engine +
      " done=" +
      (done || "(first)") +
      " jars=" +
      // The honest answer, not the hoped-for one: a non-configurable site gets
      // ONE jar, and whichever engine wrote it is the only one that will see
      // this preview.
      (configurable ? "both" : engine + " only (site cannot flip)") +
      (json === "" || json === "null" ? " cleared" : ""),
  );

  // Finish in Edge: the preview page lives there.
  if (engine === "ie" && configurable) {
    r.headersOut["X-InternetExplorerMode"] = "0";
  }
  r.return(302, safeReturn);
}

// Wrap each handler so any unhandled throw renders as a readable 500 page
// (with name/message/stack) instead of a blank nginx 500. Works for both sync
// and async handlers — awaiting a non-promise is a no-op.
const _guard =
  (name: string, fn: (r: NginxHTTPRequest) => void | Promise<void>) =>
  async (r: NginxHTTPRequest): Promise<void> => {
    try {
      await fn(r);
    } catch (e) {
      _renderException(r, name, e);
    }
  };

export default {
  handleStatePreview: _guard("handleStatePreview", handleStatePreview),
  handleClearCookies: _guard("handleClearCookies", handleClearCookies),
};
