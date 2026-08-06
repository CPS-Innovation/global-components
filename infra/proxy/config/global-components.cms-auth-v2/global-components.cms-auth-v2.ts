// ---------------------------------------------------------------------------
// CMS Auth V2 — Self-contained OIDC round-trip
//
// Flow: /polaris-v2 -> /init-v2/ -> Azure AD -> /init-v2/callback
//
// First pass: ends on a diagnostic HTML page (no real redirects to landing
// URLs yet). Combines the cookie-capture, modern-token-fetch, and AD login
// into fewer hops than the v1 spike.
// ---------------------------------------------------------------------------

import cryptoModule from "crypto";

// ---------------------------------------------------------------------------
// Azure AD endpoints
// ---------------------------------------------------------------------------

function authorizeUrl(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`;
}

function tokenUrl(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
}

// ---------------------------------------------------------------------------
// Environment — QA defaults baked in
// ---------------------------------------------------------------------------

const tenantId =
  (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_TENANT_ID"] as string) ||
  "00dd0d1d-d7e6-4338-ac51-565339c7088c";
const clientId =
  (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_CLIENT_ID"] as string) ||
  "8d6133af-9593-47c6-94d0-5c65e9e310f1";
const redirectUri =
  (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_REDIRECT_URI"] as string) ||
  "https://polaris-qa-notprod.cps.gov.uk/init-v2/callback";

const storageAccount =
  (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_STORAGE_ACCOUNT"] as string) ||
  "sacpsglobalcomponents";

// ---------------------------------------------------------------------------
// Build-time templating dropzone — the two SECRETS
//
// The destination server has no app settings, so these two are injected at
// DEPLOY time: the deploy script replaces the @@...@@ tokens below in the
// COMPILED .js with values read from the local (gitignored) .env, then uploads.
// The tokens survive tsc as plain string literals, so the substitution targets
// the .js. Everything else above uses a baked-in QA default.
//
// Precedence is process.env FIRST — so docker integration tests (which set the
// vars via env) work unchanged, and the committed source never holds a real
// secret. An un-substituted token (still containing "@@") is treated as absent.
// ---------------------------------------------------------------------------
const BUILD_CLIENT_SECRET = "@@CPS_GLOBAL_COMPONENTS_CMS_AUTH_CLIENT_SECRET@@";
const BUILD_STORAGE_KEY = "@@CPS_GLOBAL_COMPONENTS_CMS_AUTH_STORAGE_KEY@@";

const _fromDropzone = (token: string): string =>
  token.indexOf("@@") === -1 ? token : "";

const clientSecret =
  (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_CLIENT_SECRET"] as string) ||
  _fromDropzone(BUILD_CLIENT_SECRET);
const storageKey =
  (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_STORAGE_KEY"] as string) ||
  _fromDropzone(BUILD_STORAGE_KEY);

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

function _generateRandomString(length: number): string {
  const bytes = new Uint8Array(length);
  try {
    // Web Crypto global — not exposed by every njs build.
    crypto.getRandomValues(bytes);
  } catch {
    // POC fallback: Math.random is NOT cryptographically secure. Fine for this
    // diagnostic spike; revisit before any production use of state/nonce.
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map(function (b) {
      return b.toString(16).padStart(2, "0");
    })
    .join("");
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

function _decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(_base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
}

function _htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CMS Auth V2: ${title}</title>
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
function _renderException(r: NginxHTTPRequest, where: string, e: unknown): void {
  const err = e as { message?: string; stack?: string; name?: string };
  const name = (err && err.name) || "Error";
  const msg = (err && err.message) || String(e);
  const stack = (err && err.stack) || "(no stack available)";
  try {
    ngx.log(ngx.ERR, "cms-auth-v2 unhandled in " + where + ": " + name + ": " + msg);
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

// Build the <tr> rows for a timing table from the accumulated [label, ms] pairs.
function _timingRows(timings: [string, number][]): string {
  const t0 = timings.length ? timings[0][1] : 0;
  return timings
    .map(function (entry, i) {
      const elapsed = entry[1] - t0;
      const delta = i > 0 ? entry[1] - timings[i - 1][1] : 0;
      return (
        "<tr><td>" +
        entry[0] +
        "</td><td>" +
        elapsed +
        " ms</td><td>" +
        (i > 0 ? "+" + delta + " ms" : "—") +
        "</td></tr>"
      );
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Table Storage helpers
// ---------------------------------------------------------------------------

function _tableStorageAuth(
  account: string,
  key: string,
  dateStr: string,
  canonicalizedResource: string,
): string {
  const stringToSign =
    dateStr + "\n" + "/" + account + "/" + canonicalizedResource;
  const keyBuffer = Buffer.from(key, "base64");
  const hmac = cryptoModule
    .createHmac("sha256", keyBuffer)
    .update(stringToSign)
    .digest("base64");
  return "SharedKeyLite " + account + ":" + hmac;
}

async function _writeTable(
  account: string,
  key: string,
  oid: string,
  payload: string,
  email: string,
): Promise<boolean> {
  const table = "cmsauth";
  const resource = `${table}(PartitionKey='${oid}',RowKey='cmsAuth')`;
  const url = `https://${account}.table.core.windows.net/${resource}`;
  const dateStr = new Date().toUTCString();
  const auth = _tableStorageAuth(account, key, dateStr, resource);

  const body = JSON.stringify({
    PartitionKey: oid,
    RowKey: "cmsAuth",
    Value: payload,
    Email: email,
  });

  try {
    const resp = await ngx.fetch(url, {
      method: "PUT",
      headers: {
        Authorization: auth,
        "x-ms-date": dateStr,
        "x-ms-version": "2019-02-02",
        "Content-Type": "application/json",
        Accept: "application/json;odata=nometadata",
        Host: account + ".table.core.windows.net",
      },
      body: body,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      ngx.log(
        ngx.ERR,
        "Table Storage PUT failed: " + resp.status + " " + errText,
      );
      return false;
    }
    return true;
  } catch (e) {
    ngx.log(ngx.ERR, "Table Storage PUT error: " + String(e));
    return false;
  }
}

async function _readTable(
  account: string,
  key: string,
  oid: string,
): Promise<{ value: string | null; diag: string }> {
  const table = "cmsauth";
  const resource = `${table}(PartitionKey='${oid}',RowKey='cmsAuth')`;
  const url = `https://${account}.table.core.windows.net/${resource}`;
  const dateStr = new Date().toUTCString();
  const auth = _tableStorageAuth(account, key, dateStr, resource);

  try {
    const resp = await ngx.fetch(url, {
      method: "GET",
      headers: {
        Authorization: auth,
        "x-ms-date": dateStr,
        "x-ms-version": "2019-02-02",
        Accept: "application/json;odata=nometadata",
        Host: account + ".table.core.windows.net",
      },
    });

    const respText = await resp.text();

    if (!resp.ok) {
      return {
        value: null,
        diag: "HTTP " + resp.status + ": " + respText.substring(0, 200),
      };
    }

    const data = JSON.parse(respText);
    return {
      value: data.Value !== undefined ? String(data.Value) : null,
      diag: "OK — keys: " + Object.keys(data).join(", "),
    };
  } catch (e) {
    return { value: null, diag: "Error: " + String(e) };
  }
}

// ---------------------------------------------------------------------------
// /polaris-v2 — Cookie capture + redirect to /init-v2/
// ---------------------------------------------------------------------------

function handlePolarisV2(r: NginxHTTPRequest): void {
  const cookieHeader = r.headersIn["Cookie"] || "";
  const encodedCookies = encodeURIComponent(cookieHeader as string);

  // Collect existing query params
  const existingArgs = r.variables["args"] || "";
  const separator = existingArgs ? "&" : "";

  const targetQuery =
    existingArgs +
    separator +
    "cookies=" +
    encodedCookies +
    "&is-proxy-session=true";

  // Absolute URL required — IE mode iframes don't follow relative 302 Location headers
  const proto = r.headersIn["X-Forwarded-Proto"] || "https";
  const host = r.headersIn["Host"] || "";
  r.return(302, proto + "://" + host + "/init-v2/?" + targetQuery);
}

// ---------------------------------------------------------------------------
// /init-v2/ — Modern token fetch + AD redirect (combined handler)
// ---------------------------------------------------------------------------

async function handleInitV2(r: NginxHTTPRequest): Promise<void> {
  // Opt-in Edge revert for TOP-LEVEL testing. The default (framed) path stays IE so
  // AD's third-party SSO cookie survives (see the conf) — but a top-level test needs
  // Edge, or AD forces the tab to Edge and the IE-jar state cookie can't be read
  // ("Missing State"). ?edge=1 flips to Edge here; only fires when the browser is
  // IE + configurable, and after the flip the re-request is non-IE and falls through.
  if (
    _getQueryParam(r, "edge") === "1" &&
    (r.variables["ieaction"] as string) === "ie+configurable+"
  ) {
    r.headersOut["X-InternetExplorerMode"] = "0";
    const proto = (r.headersIn["X-Forwarded-Proto"] as string) || "https";
    const host = (r.headersIn["Host"] as string) || "";
    r.return(302, proto + "://" + host + (r.variables["request_uri"] as string));
    return;
  }

  const t0 = Date.now();
  const timings: [string, number][] = [["Init handler start", t0]];

  // Step 1: Generate correlation ID
  const correlation = _generateRandomString(8);

  // Step 2: Extract cookies param, whitelist, and fetch modern token
  const cookiesParam = _getQueryParam(r, "cookies") || "";
  const rawCookies = decodeURIComponent(cookiesParam);

  // Whitelist cookie names to match the C# WhitelistedCookieNameRoots.
  // Names are matched as prefixes to handle dynamic suffixes (e.g. CMSUSER246814).
  const cookieWhitelist = [
    "ASP.NET_SessionId",
    "UID",
    "WindowID",
    "CMSUSER",
    ".CMSAUTH",
  ];

  // The F5 load-balancer affinity cookie is required so the modern-token fetch
  // lands on the CMS node that holds the session (otherwise CMS 302s to login).
  // Its name embeds the datacentre + environment and has changed shape over time
  // (was BIGipServer~ent-s221~...; now C-CIN3-LBsessioncookie / F-CIN3-LBsessioncookie),
  // so match it by the stable "LBsessioncookie" suffix rather than a fixed prefix.
  const isWhitelisted = (name: string): boolean => {
    if (/LBsessioncookie$/i.test(name) || name.indexOf("BIGipServer") === 0) {
      return true;
    }
    return cookieWhitelist.some((root) => name.indexOf(root) === 0);
  };

  const cookies = rawCookies
    ? rawCookies
        .split(";")
        .map(function (c) {
          return c.trim();
        })
        .filter(function (c) {
          const name = c.split("=")[0];
          return isWhitelisted(name);
        })
        .join("; ")
    : "";

  // Ensure WindowID=MASTER is present — it has Path=/CMS.24.0.01/ so the
  // browser won't send it to /polaris-v2. uainGeneratedScript.aspx needs it
  // to return session variables instead of the exit/cleanup script.
  const fetchCookies =
    cookies && !cookies.includes("WindowID=")
      ? cookies + "; WindowID=MASTER"
      : cookies || "WindowID=MASTER";

  let modernToken = "";
  let modernTokenError = "";
  let modernTokenDiag = "";

  if (cookies) {
    const host = r.headersIn["Host"] as string;
    const fetchUrl = `https://${host}/CMS.24.0.01/Includes/uainGeneratedScript.aspx`;

    const reqHeaders: Record<string, string> = {
      Cookie: fetchCookies,
      Host: host,
      "User-Agent":
        "Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 10.0; WOW64; Trident/7.0; .NET4.0C; .NET4.0E; .NET CLR 2.0.50727; .NET CLR 3.0.30729; .NET CLR 3.5.30729; InfoPath.3)",
    };

    // Capture what we're sending for diagnostics
    modernTokenDiag =
      "URL: " +
      fetchUrl +
      " | Cookie header length: " +
      fetchCookies.length +
      " | Cookie names: " +
      fetchCookies.replace(/=([^;]*)/g, "=...").substring(0, 200);

    timings.push(["Modern token fetch start", Date.now()]);
    try {
      const resp = await ngx.fetch(fetchUrl, {
        method: "GET",
        headers: reqHeaders,
      });

      const body = await resp.text();
      timings.push(["Modern token fetch done", Date.now()]);

      modernTokenDiag +=
        " | Status: " +
        resp.status +
        " | Body length: " +
        body.length +
        " | Body preview: " +
        body.substring(0, 300).replace(/</g, "&lt;").replace(/>/g, "&gt;");

      // Extract SESS_MODERN_USER_SESSION_ID from the response
      const match = body.match(/SESS_MODERN_USER_SESSION_ID\s*=\s*'([^']+)'/);
      if (match && match[1]) {
        modernToken = match[1];
      } else {
        modernTokenError = "SESS_MODERN_USER_SESSION_ID not found in response";
      }
    } catch (e) {
      timings.push(["Modern token fetch failed", Date.now()]);
      modernTokenError = String(e);
      modernTokenDiag += " | Exception: " + String(e);

      // Redirect to error page on fetch failure
      r.return(
        302,
        "/init-v2/error?correlation=" +
          encodeURIComponent(correlation) +
          "&error-code=modern-token-fetch-failed",
      );
      return;
    }
  } else {
    modernTokenDiag = "No cookies — skipped fetch";
  }

  // Step 2b: Validate modern token via GraphQL getUser query
  let graphqlValid = false;
  let graphqlDiag = "";

  if (modernToken) {
    const host = r.headersIn["Host"] as string;
    const graphqlUrl = `https://${host}/graphql/`;
    const graphqlBody = JSON.stringify({
      query:
        "query getUser($guid: UUID!) { user(guid: $guid) { shortName, firstNames, surname, occupation, partyId } }",
      operationName: "getUser",
      variables: { guid: modernToken },
    });

    timings.push(["GraphQL validation start", Date.now()]);
    try {
      const graphqlResp = await ngx.fetch(graphqlUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // CMS rejects the call with 400 "Wrong API version" without this.
          "cms-api-version": "1",
          // The modern session key is validated from this header — without it CMS
          // returns 401 "User Session Key failed validation".
          "cms-api-sessionid": modernToken,
          // Forward the CMS session cookies so getUser is authenticated.
          Cookie: fetchCookies,
          Host: host,
        },
        body: graphqlBody,
      });

      const graphqlText = await graphqlResp.text();
      timings.push(["GraphQL validation done", Date.now()]);

      if (!graphqlResp.ok) {
        graphqlDiag =
          "HTTP " + graphqlResp.status + ": " + graphqlText.substring(0, 200);
      } else {
        try {
          const graphqlData = JSON.parse(graphqlText);
          const userData = graphqlData.data as
            | Record<string, unknown>
            | undefined;
          if (userData && userData.user) {
            graphqlValid = true;
            graphqlDiag = "Valid — " + JSON.stringify(userData.user);
          } else {
            graphqlDiag = "No user returned: " + graphqlText.substring(0, 200);
          }
        } catch {
          graphqlDiag = "Response not JSON: " + graphqlText.substring(0, 200);
        }
      }
    } catch (e) {
      timings.push(["GraphQL validation failed", Date.now()]);
      graphqlDiag = "Exception: " + String(e);
    }
  } else {
    graphqlDiag = "Skipped — no modern token";
  }

  // If we could not capture the modern token, halt here and show the full
  // diagnostics rather than proceeding to Azure AD — the captured cookies, the
  // upstream status/body, and the timings ARE the point of this failure mode.
  if (!modernToken) {
    timings.push(["Modern token missing — halted", Date.now()]);
    r.headersOut["Content-Type"] = "text/html; charset=utf-8";
    const maskedCookies = fetchCookies.replace(/=([^;]*)/g, "=...");
    const rows = [
      ["Correlation ID", correlation || "<em>(none)</em>"],
      [
        "Modern Token",
        '<span class="fail">' +
          (modernTokenError || "not captured") +
          "</span>",
      ],
      [
        "Cookies sent",
        fetchCookies ? "<code>" + maskedCookies + "</code>" : "<em>(none)</em>",
      ],
      [
        "Modern Token Diag",
        modernTokenDiag ? "<code>" + modernTokenDiag + "</code>" : "<em>(none)</em>",
      ],
      [
        "GraphQL Diag",
        graphqlDiag ? "<code>" + graphqlDiag + "</code>" : "<em>(none)</em>",
      ],
      ["Landing URL (r)", (_getQueryParam(r, "r") || "") || "<em>(none)</em>"],
    ]
      .map(function (row) {
        return `<tr><td><strong>${row[0]}</strong></td><td>${row[1]}</td></tr>`;
      })
      .join("\n");
    r.return(
      200,
      _htmlPage(
        "CMS Auth V2 — Modern token not captured",
        `<p class="fail">Halted before Azure AD: no modern session token could be captured from CMS.</p>
         <table>
           <thead><tr><th>Field</th><th>Value</th></tr></thead>
           <tbody>${rows}</tbody>
         </table>
         <h2>Timing</h2>
         <table>
           <thead><tr><th>Event</th><th>Elapsed</th><th>Delta</th></tr></thead>
           <tbody>${_timingRows(timings)}</tbody>
         </table>`,
      ),
    );
    return;
  }

  // Step 3: Build state cookie payload
  const state = _generateRandomString(16);
  const nonce = _generateRandomString(16);

  // Collect remaining query params to preserve as the redirect target
  const redirectParam = _getQueryParam(r, "r") || "";

  timings.push(["AD redirect", Date.now()]);

  const statePayload = JSON.stringify({
    s: state,
    n: nonce,
    r: redirectParam,
    cc: encodeURIComponent(fetchCookies),
    correlation: correlation,
    modernToken: modernToken,
    modernTokenError: modernTokenError || undefined,
    modernTokenDiag: modernTokenDiag || undefined,
    graphqlValid: graphqlValid,
    graphqlDiag: graphqlDiag || undefined,
    t: timings,
  });

  const encodedState = _base64UrlEncode(statePayload);

  // Step 4: Set state cookie + redirect to Azure AD
  const cookieOpts =
    "; Path=/init-v2; HttpOnly; Secure; SameSite=Lax; Max-Age=300";
  r.headersOut["Set-Cookie"] = ["cms_auth_state=" + encodedState + cookieOpts];

  const params = [
    "client_id=" + encodeURIComponent(clientId),
    "response_type=code",
    "redirect_uri=" + encodeURIComponent(redirectUri),
    "scope=" + encodeURIComponent("openid profile email"),
    "state=" + state,
    "nonce=" + nonce,
    "response_mode=query",
    // Silent auth: the whole flow runs inside a hidden iframe on the CMS login
    // page, and Azure AD sets X-Frame-Options: DENY on any rendered /authorize
    // response ("This content cannot be displayed in a frame"). prompt=none makes
    // AD return a bare 302 (code, or error=login_required) with no UI to render,
    // so the framed navigation isn't blocked. CMS users already have an AAD
    // session (same tenant), so this yields a code without interaction.
    "prompt=none",
  ].join("&");

  r.return(302, authorizeUrl(tenantId) + "?" + params);
}

// ---------------------------------------------------------------------------
// /init-v2/callback — Code exchange, validation, table storage, diagnostics
// ---------------------------------------------------------------------------

async function handleInitV2Callback(r: NginxHTTPRequest): Promise<void> {
  r.headersOut["Content-Type"] = "text/html; charset=utf-8";

  // Check for Azure AD errors
  const error = _getQueryParam(r, "error");
  if (error) {
    const desc = _getQueryParam(r, "error_description") || "Unknown error";
    r.return(
      400,
      _htmlPage("Auth Error", `<p><strong>${error}</strong></p><p>${desc}</p>`),
    );
    return;
  }

  // Recover state cookie
  const stateCookieRaw = _getCookie(r, "cms_auth_state");
  if (!stateCookieRaw) {
    r.return(
      400,
      _htmlPage(
        "Missing State",
        "<p>No cms_auth_state cookie found. The login flow may have expired.</p>",
      ),
    );
    return;
  }

  let statePayload: {
    s: string;
    n: string;
    r: string;
    cc: string;
    correlation: string;
    modernToken: string;
    modernTokenError?: string;
    modernTokenDiag?: string;
    graphqlValid?: boolean;
    graphqlDiag?: string;
    t?: [string, number][];
  };
  try {
    statePayload = JSON.parse(_base64UrlDecode(stateCookieRaw));
  } catch {
    r.return(
      400,
      _htmlPage("Invalid State", "<p>Could not decode state cookie.</p>"),
    );
    return;
  }

  // Recover timing array from state cookie
  const timings: [string, number][] = statePayload.t || [];
  timings.push(["Callback start", Date.now()]);

  // Validate state parameter
  const stateParam = _getQueryParam(r, "state");
  if (!stateParam || stateParam !== statePayload.s) {
    r.return(
      400,
      _htmlPage(
        "State Mismatch",
        "<p>State parameter does not match cookie.</p>",
      ),
    );
    return;
  }

  // Exchange code for tokens
  const code = _getQueryParam(r, "code");
  if (!code) {
    r.return(
      400,
      _htmlPage("Missing Code", "<p>No authorization code received.</p>"),
    );
    return;
  }

  const tokenBody = [
    "client_id=" + encodeURIComponent(clientId),
    "client_secret=" + encodeURIComponent(clientSecret),
    "code=" + encodeURIComponent(code),
    "redirect_uri=" + encodeURIComponent(redirectUri),
    "grant_type=authorization_code",
    "scope=" + encodeURIComponent("openid profile email"),
  ].join("&");

  let idToken: string;
  let claims: Record<string, unknown>;

  timings.push(["Token exchange start", Date.now()]);
  try {
    const resp = await ngx.fetch(tokenUrl(tenantId), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Host: "login.microsoftonline.com",
      },
      body: tokenBody,
    });

    const text = await resp.text();
    if (!resp.ok) {
      r.return(
        500,
        _htmlPage(
          "Token Exchange Failed",
          `<p>Status: ${resp.status}</p><pre>${text}</pre>`,
        ),
      );
      return;
    }

    const data = JSON.parse(text);
    idToken = data.id_token;
    const decoded = _decodeJwtPayload(idToken);
    if (!decoded) {
      r.return(
        500,
        _htmlPage(
          "Token Decode Failed",
          "<p>Could not decode id_token JWT payload.</p>",
        ),
      );
      return;
    }
    claims = decoded;
    timings.push(["Token exchange done", Date.now()]);
  } catch (e) {
    r.return(500, _htmlPage("Token Exchange Error", `<p>${String(e)}</p>`));
    return;
  }

  // Validate token
  timings.push(["Token validation start", Date.now()]);
  const validationErrors: string[] = [];

  // 1. Nonce
  if (claims.nonce !== statePayload.n) {
    validationErrors.push("Nonce mismatch");
  }

  // 2. Tenant ID
  if (claims.tid !== tenantId) {
    validationErrors.push(
      "Tenant ID mismatch: expected " +
        tenantId +
        ", got " +
        String(claims.tid),
    );
  }

  // 3. Issuer
  const iss = claims.iss as string;
  const validIssuers = [
    `https://sts.windows.net/${tenantId}/`,
    `https://login.microsoftonline.com/${tenantId}/v2.0`,
  ];
  if (!validIssuers.includes(iss)) {
    validationErrors.push("Issuer mismatch: " + iss);
  }

  // 4. Expiry
  const exp = claims.exp as number;
  if (!exp || exp < Math.floor(Date.now() / 1000)) {
    validationErrors.push("Token expired");
  }

  const isValid = validationErrors.length === 0;
  const validationHtml = isValid
    ? '<span class="pass">PASS</span>'
    : '<span class="fail">FAIL — ' + validationErrors.join("; ") + "</span>";

  timings.push(["Token validation done", Date.now()]);

  // Extract user info
  const oid = String(claims.oid || "");
  const email = String(
    claims.email || claims.upn || claims.preferred_username || "",
  );
  const name = String(claims.name || "");

  // Table Storage: store {cookies, modernToken, correlationId} keyed by OID
  let storageWriteHtml = '<span class="fail">SKIP — no storage creds</span>';
  let storageReadHtml = '<span class="fail">SKIP — no storage creds</span>';

  if (storageAccount && storageKey && isValid && oid) {
    const tablePayload = JSON.stringify({
      cookies: statePayload.cc,
      modernToken: statePayload.modernToken,
      correlationId: statePayload.correlation,
      email: email,
    });

    timings.push(["Storage write start", Date.now()]);
    const writeOk = await _writeTable(
      storageAccount,
      storageKey,
      oid,
      tablePayload,
      email,
    );
    timings.push(["Storage write done", Date.now()]);
    storageWriteHtml = writeOk
      ? '<span class="pass">PASS</span>'
      : '<span class="fail">FAIL</span>';

    if (writeOk) {
      timings.push(["Storage read start", Date.now()]);
      const readResult = await _readTable(storageAccount, storageKey, oid);
      timings.push(["Storage read done", Date.now()]);
      storageReadHtml =
        readResult.value !== null
          ? "<code>" + readResult.value + "</code>"
          : '<span class="fail">FAIL — ' + readResult.diag + "</span>";
    } else {
      storageReadHtml = '<span class="fail">SKIP — write failed</span>';
    }
  }

  // Truncate id_token for display
  const tokenDisplay =
    idToken.length > 80
      ? idToken.substring(0, 40) +
        "..." +
        idToken.substring(idToken.length - 40)
      : idToken;

  timings.push(["Render page", Date.now()]);

  // Build timing table
  const t0 = timings[0][1];
  const timingRows = _timingRows(timings);

  // Two Set-Cookie headers in one array (njs emits each separately):
  //   1. Clear the state cookie (flow finished).
  //   2. Hand the id token to the CMS shell as a short-lived, cross-subdomain,
  //      JS-readable cookie. In production this callback runs on our-domain, a
  //      DIFFERENT subdomain from the CMS shell (main-system), so it cannot write
  //      the shell's localStorage directly (the inline storageScript below only
  //      works when same-origin, i.e. proxied dev). A cookie scoped to the shared
  //      registrable domain (cps.gov.uk) lands in the shell's jar regardless. The
  //      injected shell script (cms-auth-v2-client.js) polls for it, copies it to
  //      localStorage, and deletes it immediately.
  //      NOT HttpOnly (the script must read it via document.cookie). Max-Age is a
  //      backstop so an unreaped cookie self-destructs rather than riding every
  //      cps.gov.uk request indefinitely.
  //      Name/Domain MUST match that script's COOKIE_NAME / COOKIE_DOMAIN.
  const clearOpts =
    "; Path=/init-v2; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
  const idTokenCookieOpts =
    "; Domain=cps.gov.uk; Path=/; Secure; SameSite=Lax; Max-Age=60";
  r.headersOut["Set-Cookie"] = [
    "cms_auth_state=deleted" + clearOpts,
    "cms-auth-id-token=" + encodeURIComponent(idToken) + idTokenCookieOpts,
  ];

  // Render diagnostic page
  const rows = [
    ["Correlation ID", statePayload.correlation || "<em>(none)</em>"],
    ["Landing URL (r)", statePayload.r || "<em>(none)</em>"],
    [
      "Cookies (cc)",
      statePayload.cc
        ? "<code>" +
          statePayload.cc.substring(0, 100) +
          (statePayload.cc.length > 100 ? "..." : "") +
          "</code>"
        : "<em>(none)</em>",
    ],
    [
      "Modern Token",
      statePayload.modernToken
        ? "<code>" + statePayload.modernToken + "</code>"
        : '<span class="fail">' +
          (statePayload.modernTokenError || "not captured") +
          "</span>",
    ],
    [
      "Modern Token Diag",
      statePayload.modernTokenDiag
        ? "<code>" + statePayload.modernTokenDiag + "</code>"
        : "<em>(none)</em>",
    ],
    [
      "GraphQL Validation",
      statePayload.graphqlValid
        ? '<span class="pass">PASS</span>'
        : '<span class="fail">FAIL</span>',
    ],
    [
      "GraphQL Diag",
      statePayload.graphqlDiag
        ? "<code>" + statePayload.graphqlDiag + "</code>"
        : "<em>(none)</em>",
    ],
    ["ID Token", "<code>" + tokenDisplay + "</code>"],
    ["OID", oid],
    ["Tenant ID", String(claims.tid || "")],
    ["Name", name],
    ["Email", email || '<span class="fail">(empty)</span>'],
    ["JWT Claims Keys", "<code>" + Object.keys(claims).join(", ") + "</code>"],
    ["Issuer", String(claims.iss || "")],
    ["Token Validation", validationHtml],
    ["Storage Write", storageWriteHtml],
    ["Storage Read-back", storageReadHtml],
  ]
    .map(function (row) {
      return `<tr><td><strong>${row[0]}</strong></td><td>${row[1]}</td></tr>`;
    })
    .join("\n");

  // Same-origin (dev/proxied) convenience: write the id token to the top window's
  // localStorage directly. This ONLY works when the callback is same-origin with the
  // shell — i.e. behind the dev proxy. In production the cross-subdomain cookie set
  // above is the real handoff; this write silently no-ops (cross-origin, caught). Kept
  // as a harmless fast-path for proxied dev. Minimal + guarded so a failure (e.g. DOM
  // Storage disabled) can't touch the rest of the page.
  // JSON.stringify + <-escaping keep the JWT from breaking out of the <script>.
  const idTokenJs = JSON.stringify(idToken).replace(/</g, "\\u003c");
  // Prefer the TOP window's localStorage (the CMS page's store — that one works in
  // IE and is where a same-origin reader looks). IE tends to deny localStorage for a
  // NESTED frame ("SCRIPT5: Access is denied"), even caught, so we target top first
  // and fall back to the frame's own. Both guarded so nothing can break the page.
  const storageScript = `<script>(function(){var v=${idTokenJs};` +
    // Write to the TOP window's localStorage (the CMS page's store). Same-origin
    // cross-frame access works in every IE document mode (postMessage would be
    // undefined in documentMode 5), and the nested frame's own context is restricted,
    // so we target top. Guarded so a failure can't touch the page.
    `var w;try{w=window.top||window;}catch(e){w=window;}` +
    `try{w.localStorage.setItem("cms-auth-id-token",v);}catch(e){}` +
    `})();</script>`;

  r.return(
    200,
    _htmlPage(
      "CMS Auth V2 Diagnostic",
      `<p>Azure AD authentication completed (v2 flow).</p>
       <table>
         <thead><tr><th>Field</th><th>Value</th></tr></thead>
         <tbody>${rows}</tbody>
       </table>
       <h2>Timing</h2>
       <table>
         <thead><tr><th>Event</th><th>Elapsed</th><th>Delta</th></tr></thead>
         <tbody>${timingRows}</tbody>
       </table>
       <p>Total: <strong>${timings[timings.length - 1][1] - t0} ms</strong></p>
       ${storageScript}`,
    ),
  );
}

// ---------------------------------------------------------------------------
// /init-v2/error — Error page with correlation ID
// ---------------------------------------------------------------------------

function handleInitV2Error(r: NginxHTTPRequest): void {
  r.headersOut["Content-Type"] = "text/html; charset=utf-8";

  const correlation = _getQueryParam(r, "correlation") || "(unknown)";
  const errorCode = _getQueryParam(r, "error-code") || "unknown";

  r.return(
    500,
    _htmlPage(
      "CMS Auth V2 Error",
      `<p>An error occurred during the authentication flow.</p>
       <table>
         <thead><tr><th>Field</th><th>Value</th></tr></thead>
         <tbody>
           <tr><td><strong>Correlation ID</strong></td><td><code>${correlation}</code></td></tr>
           <tr><td><strong>Error Code</strong></td><td><code>${errorCode}</code></td></tr>
         </tbody>
       </table>
       <p>Please provide the correlation ID when reporting this issue.</p>`,
    ),
  );
}

// ---------------------------------------------------------------------------
// /global-components/cms-modern-token-v2 — Standalone modern token fetch
//
// Identical to v1 handleCmsModernToken. Allows direct comparison with the
// /init-v2/ inline fetch using the same cookies.
// ---------------------------------------------------------------------------

async function handleCmsModernToken(r: NginxHTTPRequest): Promise<void> {
  const ccRaw = _getQueryParam(r, "cc") || "";
  if (!ccRaw) {
    r.headersOut["Content-Type"] = "text/plain; charset=utf-8";
    r.return(400, "Missing cc query parameter");
    return;
  }

  let cc = decodeURIComponent(ccRaw);

  // Allow adding BIGipServer cookie via separate param
  const bigipRaw = _getQueryParam(r, "bigip") || "";
  if (bigipRaw) {
    const bigip = decodeURIComponent(bigipRaw);
    cc = cc + "; " + bigip;
  }

  const host = r.headersIn["Host"] as string;
  const url = `https://${host}/CMS.24.0.01/Includes/uainGeneratedScript.aspx`;

  const reqHeaders: Record<string, string> = {
    Cookie: cc,
    Host: host,
    "User-Agent":
      "Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 10.0; WOW64; Trident/7.0; .NET4.0C; .NET4.0E; .NET CLR 2.0.50727; .NET CLR 3.0.30729; .NET CLR 3.5.30729; InfoPath.3)",
  };

  // Build request dump
  let reqDump = "=== Outbound Request ===\n" + "GET " + url + "\n";
  for (const k in reqHeaders) {
    reqDump += k + ": " + reqHeaders[k] + "\n";
  }

  try {
    const resp = await ngx.fetch(url, {
      method: "GET",
      headers: reqHeaders,
    });

    const body = await resp.text();

    // Build response dump
    let respDump =
      "\n=== Response ===\n" + "Status: " + resp.status + "\n" + "Headers:\n";
    // njs Headers.forEach is (name, value)
    resp.headers.forEach(function (name: string, value: string) {
      respDump += "  " + name + ": " + value + "\n";
    });
    respDump += "\nBody (" + body.length + " bytes):\n" + body;

    // Extract SESS_MODERN_USER_SESSION_ID from the response
    const match = body.match(/SESS_MODERN_USER_SESSION_ID\s*=\s*'([^']+)'/);

    r.headersOut["Content-Type"] = "text/plain; charset=utf-8";
    if (match && match[1]) {
      r.return(
        200,
        "SESS_MODERN_USER_SESSION_ID: " +
          match[1] +
          "\n\n" +
          reqDump +
          respDump,
      );
    } else {
      r.return(
        404,
        "SESS_MODERN_USER_SESSION_ID not found in response\n\n" +
          reqDump +
          respDump,
      );
    }
  } catch (e) {
    r.headersOut["Content-Type"] = "text/plain; charset=utf-8";
    r.return(500, "Error: " + String(e) + "\n\n" + reqDump);
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

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
  handlePolarisV2: _guard("handlePolarisV2", handlePolarisV2),
  handleInitV2: _guard("handleInitV2", handleInitV2),
  handleInitV2Callback: _guard("handleInitV2Callback", handleInitV2Callback),
  handleInitV2Error: _guard("handleInitV2Error", handleInitV2Error),
  handleCmsModernToken: _guard("handleCmsModernToken", handleCmsModernToken),
  handleClearCookies: _guard("handleClearCookies", handleClearCookies),
};
