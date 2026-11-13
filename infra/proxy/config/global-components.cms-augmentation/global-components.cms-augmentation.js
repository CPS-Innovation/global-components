// ---------------------------------------------------------------------------
// CMS augmentation — what the proxy adds to the legacy CMS apps.
//
// The conf does the real job, and needs no njs for it: it injects our client
// scripts into CMS Classic (the frameset shell) and CMS Modern / DCF. This file is
// only the cookie diagnostics:
//
//   /global-components/diagnostic/clear-cookies   handleClearCookies (debug).
//
// The preview state route that used to live here (handleStatePreview) moved to
// global-components.vnext on 2026-11-10, as part of Polaris's whole state route.
//
// No settings and no deploy-time tokens: nothing here talks to anything but the
// request.
// (The Watchdog adapter that used to live here is global-components.watchdog.)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _htmlPage(title, body) {
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

function _esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Render an unhandled exception straight to the HTTP response so it is visible
// in the browser (the deployed proxy's logs are not reachable). Never throws.
function _renderException(r, where, e) {
  const name = (e && e.name) || "Error";
  const msg = (e && e.message) || String(e);
  const stack = (e && e.stack) || "(no stack available)";
  try {
    ngx.log(
      ngx.ERR,
      "cms-augmentation unhandled in " + where + ": " + name + ": " + msg,
    );
  } catch (_e) {
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
  } catch (_e) {
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
function handleClearCookies(r) {
  const raw = r.headersIn["Cookie"] || "";
  const host = (r.headersIn["Host"] || "").split(":")[0];

  // Unique cookie names from the request header.
  const names = [];
  const seen = {};
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
  const domains = ["", host];
  let labels = host.split(".");
  while (labels.length > 2) {
    labels = labels.slice(1);
    domains.push("." + labels.join("."));
  }

  const past = "Thu, 01 Jan 1970 00:00:00 GMT";
  const setCookies = [];
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

// Wrap each handler so any unhandled throw renders as a readable 500 page
// (with name/message/stack) instead of a blank nginx 500. Works for both sync
// and async handlers — awaiting a non-promise is a no-op.
const _guard =
  (name, fn) =>
  async (r) => {
    try {
      await fn(r);
    } catch (e) {
      _renderException(r, name, e);
    }
  };

export default {
  handleClearCookies: _guard("handleClearCookies", handleClearCookies),
};
