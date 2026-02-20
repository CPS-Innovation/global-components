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
const clientSecret =
  (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_CLIENT_SECRET"] as string) || "";
const redirectUri =
  (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_REDIRECT_URI"] as string) ||
  "https://polaris-qa-notprod.cps.gov.uk/init-v2/callback";

const storageAccount =
  (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_STORAGE_ACCOUNT"] as string) ||
  "sacpsglobalcomponents";
const storageKey =
  (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_STORAGE_KEY"] as string) || "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _base64UrlDecode(str: string): string {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) {
    str += "=";
  }
  return atob(str);
}

function _base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function _generateRandomString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
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
  const t0 = Date.now();
  const timings: [string, number][] = [["Init handler start", t0]];

  // Step 1: Generate correlation ID
  const correlation = _generateRandomString(8);

  // Step 2: Extract cookies param, whitelist, and fetch modern token
  const cookiesParam = _getQueryParam(r, "cookies") || "";
  const rawCookies = decodeURIComponent(cookiesParam);

  // Whitelist cookie names to match the C# WhitelistedCookieNameRoots.
  // Names are matched as prefixes to handle dynamic suffixes
  // (e.g. CMSUSER246814, BIGipServer~ent-s221~...).
  const cookieWhitelist = [
    "ASP.NET_SessionId",
    "UID",
    "WindowID",
    "CMSUSER",
    ".CMSAUTH",
    "BIGipServer",
  ];

  const cookies = rawCookies
    ? rawCookies
        .split(";")
        .map(function (c) {
          return c.trim();
        })
        .filter(function (c) {
          const name = c.split("=")[0];
          return cookieWhitelist.some(function (root) {
            return name.indexOf(root) === 0;
          });
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
  const timingRows = timings
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

  // Clear the state cookie
  const clearOpts =
    "; Path=/init-v2; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
  r.headersOut["Set-Cookie"] = ["cms_auth_state=deleted" + clearOpts];

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
       <p>Total: <strong>${timings[timings.length - 1][1] - t0} ms</strong></p>`,
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

export default {
  handlePolarisV2,
  handleInitV2,
  handleInitV2Callback,
  handleInitV2Error,
  handleCmsModernToken,
};
