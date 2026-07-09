// ---------------------------------------------------------------------------
// CMS Auth — Azure AD OIDC diagnostic endpoint
//
// Proves the AD authentication mechanism works on the real QA proxy deployment.
// A user arriving at /global-components/cms-auth/login (with r and cc query
// params from the /init flow) is sent through Azure AD. After auth, a
// diagnostic HTML page displays the landing URL, cookie value, id_token, OID,
// and token validation result.
// ---------------------------------------------------------------------------

import cryptoModule from "crypto";

// Azure AD endpoints
function authorizeUrl(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`;
}

function tokenUrl(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
}

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
  <title>CMS Auth: ${title}</title>
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
  cookieValue: string,
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
    Value: cookieValue,
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
// Login handler
// ---------------------------------------------------------------------------

function handleCmsAuthLogin(r: NginxHTTPRequest): void {
  const t0 = Date.now();

  const tenantId =
    (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_TENANT_ID"] as string) || "";
  const clientId =
    (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_CLIENT_ID"] as string) || "";
  const redirectUri =
    (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_REDIRECT_URI"] as string) ||
    "";

  const landingUrl = _getQueryParam(r, "r") || "";
  const cookieValue = _getQueryParam(r, "cc") || "";

  const state = _generateRandomString(16);
  const nonce = _generateRandomString(16);

  // Encode r, cc, state, nonce, and timing into a JSON state cookie
  const statePayload = JSON.stringify({
    s: state,
    n: nonce,
    r: landingUrl,
    cc: cookieValue,
    t: [
      ["Login handler", t0],
      ["Redirect to AD", Date.now()],
    ],
  });
  const encodedState = btoa(statePayload)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const cookieOpts =
    "; Path=/global-components/cms-auth; HttpOnly; Secure; SameSite=Lax; Max-Age=300";
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
// Callback handler
// ---------------------------------------------------------------------------

async function handleCmsAuthCallback(r: NginxHTTPRequest): Promise<void> {
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

  const tenantId =
    (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_TENANT_ID"] as string) || "";
  const clientId =
    (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_CLIENT_ID"] as string) || "";
  const clientSecret =
    (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_CLIENT_SECRET"] as string) ||
    "";
  const redirectUri =
    (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_REDIRECT_URI"] as string) ||
    "";

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

  // Table Storage write + read-back
  let storageWriteHtml = '<span class="fail">SKIP — no storage creds</span>';
  let storageReadHtml = '<span class="fail">SKIP — no storage creds</span>';

  const storageAccount =
    (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_STORAGE_ACCOUNT"] as string) ||
    "";
  const storageKey =
    (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_STORAGE_KEY"] as string) || "";

  if (storageAccount && storageKey && isValid) {
    const oid = String(claims.oid || "");
    const cc = statePayload.cc || "";

    timings.push(["Storage write start", Date.now()]);
    const email = String(claims.preferred_username || "");
    const writeOk = await _writeTable(
      storageAccount,
      storageKey,
      oid,
      cc,
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
    "; Path=/global-components/cms-auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
  r.headersOut["Set-Cookie"] = ["cms_auth_state=deleted" + clearOpts];

  // Render diagnostic page
  const rows = [
    ["Landing URL", statePayload.r || "<em>(none)</em>"],
    ["Cookie Value (cc)", statePayload.cc || "<em>(none)</em>"],
    ["ID Token", "<code>" + tokenDisplay + "</code>"],
    ["OID", String(claims.oid || "")],
    ["Tenant ID", String(claims.tid || "")],
    ["Name", String(claims.name || "")],
    ["Email", String(claims.preferred_username || "")],
    ["Issuer", String(claims.iss || "")],
    ["Validation", validationHtml],
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
      "CMS Auth Diagnostic",
      `<p>Azure AD authentication completed.</p>
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
       <p><a href="/global-components/cms-auth/login?r=${encodeURIComponent(statePayload.r)}&cc=${encodeURIComponent(statePayload.cc)}">Login again</a></p>`,
    ),
  );
}

// ---------------------------------------------------------------------------
// CMS Modern Token — fetch uainGeneratedScript.aspx with CMS cookies
// ---------------------------------------------------------------------------

async function handleCmsModernToken(r: NginxHTTPRequest): Promise<void> {
  const ccRaw = _getQueryParam(r, "cc") || "";
  if (!ccRaw) {
    r.headersOut["Content-Type"] = "text/plain; charset=utf-8";
    r.return(400, "Missing cc query parameter");
    return;
  }

  let cc = decodeURIComponent(ccRaw);

  // Allow adding BIGipServer cookie via separate param (it may not be captured in /polaris flow)
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

  let reqHeadersStr = "";
  for (const k in reqHeaders) {
    reqHeadersStr += "  " + k + ": " + reqHeaders[k] + "\n";
  }

  try {
    const resp = await ngx.fetch(url, {
      method: "GET",
      headers: reqHeaders,
    });

    const body = await resp.text();

    // Extract SESS_MODERN_USER_SESSION_ID from the response
    const match = body.match(/SESS_MODERN_USER_SESSION_ID\s*=\s*'([^']+)'/);
    if (!match || !match[1]) {
      r.headersOut["Content-Type"] = "text/plain; charset=utf-8";
      r.return(404, "SESS_MODERN_USER_SESSION_ID not found in response");
      return;
    }

    const sessionId = match[1];

    // Verify the token via GraphQL getUser query
    const graphqlUrl = `https://${host}/graphql/`;
    const graphqlBody = JSON.stringify({
      query:
        "query getUser($guid: UUID!) { user(guid: $guid) { shortName, firstNames, surname, occupation, partyId } }",
      operationName: "getUser",
      variables: { guid: sessionId },
    });

    const graphqlResp = await ngx.fetch(graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Host: host,
      },
      body: graphqlBody,
    });

    const graphqlText = await graphqlResp.text();

    r.headersOut["Content-Type"] = "text/plain; charset=utf-8";

    if (!graphqlResp.ok) {
      r.return(
        502,
        "GraphQL error: HTTP " + graphqlResp.status + "\n" + graphqlText,
      );
      return;
    }

    var graphqlData: Record<string, unknown>;
    try {
      graphqlData = JSON.parse(graphqlText);
    } catch {
      r.return(502, "GraphQL response not JSON:\n" + graphqlText);
      return;
    }

    const userData = (graphqlData as Record<string, unknown>).data as
      | Record<string, unknown>
      | undefined;
    if (userData && userData.user) {
      r.return(200, sessionId + "\nUser: " + JSON.stringify(userData.user));
    } else {
      r.return(401, "Token invalid — getUser returned no user\n" + graphqlText);
    }
  } catch (e) {
    r.headersOut["Content-Type"] = "text/plain; charset=utf-8";
    r.return(500, "Error: " + String(e));
  }
}

// ---------------------------------------------------------------------------
// Auth refresh outbound — redirect via Cms-Session-Hint cookie
// ---------------------------------------------------------------------------

function handleAuthRefreshOutbound(r: NginxHTTPRequest): void {
  const SESSION_HINT_COOKIE_NAME = "Cms-Session-Hint";
  const fallbackDomain = r.variables.defaultUpstreamCmsDomainName as string;
  const fallbackUrl = `https://${fallbackDomain}/polaris-2`;

  let redirectBase = fallbackUrl;

  const cookieValue = _getCookie(r, SESSION_HINT_COOKIE_NAME);
  if (cookieValue) {
    try {
      const hint = JSON.parse(decodeURIComponent(cookieValue));
      if (hint.handoverEndpoint) {
        redirectBase = hint.handoverEndpoint;
      }
    } catch (e) {
      ngx.log(
        ngx.WARN,
        "auth-refresh-outbound: failed to parse " +
          SESSION_HINT_COOKIE_NAME +
          " cookie, using fallback. Error: " +
          String(e),
      );
    }
  }

  const args = r.variables.is_args as string;
  const queryString = r.variables.args as string;
  r.headersOut["X-InternetExplorerMode"] = "1";
  r.return(302, redirectBase + (args || "") + (queryString || ""));
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export default {
  handleCmsAuthLogin,
  handleCmsAuthCallback,
  handleCmsModernToken,
  handleAuthRefreshOutbound,
};
