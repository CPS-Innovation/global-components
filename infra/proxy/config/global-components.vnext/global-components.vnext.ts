import fs from "fs";
// @ts-ignore - njs runtime import path
import gloco from "templates/global-components.js";

const DEPLOYMENT_JSON_PATH =
  "/etc/nginx/templates/global-components-deployment.json";
const TENANT_ID = "00dd0d1d-d7e6-4338-ac51-565339c7088c";
const APPLICATION_ID = "8d6133af-9593-47c6-94d0-5c65e9e310f1";
const STATE_COOKIE_NAME = "cps-global-components-state";
const STATE_COOKIE_LIFESPAN_MS = 365 * 24 * 60 * 60 * 1000;
const AD_AUTH_ENDPOINT_DEFAULT = "https://graph.microsoft.com/v1.0/me";

// Read AD_AUTH_ENDPOINT from env if available (njs 0.8+), otherwise use default
let _adAuthEndpoint = AD_AUTH_ENDPOINT_DEFAULT;
try {
  // @ts-ignore - process.env may not exist in all njs versions
  if (
    typeof process !== "undefined" &&
    process.env &&
    process.env.AD_AUTH_ENDPOINT
  ) {
    // @ts-ignore
    _adAuthEndpoint = process.env.AD_AUTH_ENDPOINT;
  }
} catch (e) {
  // njs version without process.env - use default
}

interface TokenClaims {
  tid?: string;
  appid?: string;
  oid?: string;
  upn?: string;
  email?: string;
  preferred_username?: string;
  [key: string]: unknown;
}

interface ClaimsResult {
  status: string;
  claims: TokenClaims;
}

interface CookieOptions {
  Path?: string;
  Expires?: Date;
  Secure?: boolean;
  SameSite?: "Strict" | "Lax" | "None";
}

function _escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function _base64UrlDecode(str: string): string {
  // Replace base64url chars with base64 chars
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  // Pad if necessary
  while (str.length % 4) {
    str += "=";
  }
  return atob(str);
}

function _base64UrlEncode(str: string): string {
  // Encode to base64, then convert to base64url (URL-safe, no padding)
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Wrap state for storage (encode). Currently base64url, could add encryption later.
function _wrapState(plaintext: string): string {
  return _base64UrlEncode(plaintext);
}

// Unwrap state from storage (decode). Currently base64url, could add decryption later.
function _unwrapState(wrapped: string): string | null {
  try {
    return _base64UrlDecode(wrapped);
  } catch (e) {
    // If decode fails, return null (corrupted or legacy data)
    return null;
  }
}

function buildCookieString(
  name: string,
  value: string,
  options?: CookieOptions,
): string {
  let cookie = name + "=" + value;
  if (options?.Path) {
    cookie += "; Path=" + options.Path;
  }
  if (options?.Expires) {
    cookie += "; Expires=" + options.Expires.toUTCString();
  }
  if (options?.Secure) {
    cookie += "; Secure";
  }
  if (options?.SameSite) {
    cookie += "; SameSite=" + options.SameSite;
  }
  return cookie;
}

function setCookie(
  r: NginxHTTPRequest,
  name: string,
  value: string,
  options?: CookieOptions,
): void {
  const cookie = buildCookieString(name, value, options);
  // njs headersOut["Set-Cookie"] accepts either string or string[]
  // For multiple cookies, we need to use an array
  const existing = r.headersOut["Set-Cookie"];
  if (existing) {
    if (Array.isArray(existing)) {
      existing.push(cookie);
    } else {
      // Convert single string to array and add new cookie
      r.headersOut["Set-Cookie"] = [existing as unknown as string, cookie];
    }
  } else {
    // First cookie - use string for compatibility
    (r.headersOut as Record<string, string>)["Set-Cookie"] = cookie;
  }
}

function _extractAndValidateClaims(r: NginxHTTPRequest): ClaimsResult {
  const authHeader = r.headersIn["Authorization"] as string | undefined;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { status: "no-token", claims: {} };
  }

  const token = authHeader.substring(7);
  const parts = token.split(".");

  if (parts.length !== 3) {
    return { status: "malformed-token", claims: {} };
  }

  try {
    const payload = _base64UrlDecode(parts[1]);
    const claims: TokenClaims = JSON.parse(payload);
    if (!claims) {
      return { status: "invalid-claims-empty", claims: {} };
    }
    if (claims.tid !== TENANT_ID) {
      return { status: "invalid-claims-tid[" + (claims.tid || "") + "|" + TENANT_ID + "]", claims };
    }
    if (claims.appid !== APPLICATION_ID) {
      return { status: "invalid-claims-appid[" + (claims.appid || "") + "|" + APPLICATION_ID + "]", claims };
    }
    return { status: "ok", claims };
  } catch (e) {
    return { status: "decode-error", claims: {} };
  }
}

async function handleState(r: NginxHTTPRequest): Promise<void> {
  if (!["GET", "PUT"].includes(r.method)) {
    r.return(405, JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  r.headersOut["Content-Type"] = "application/json";

  if (r.method === "GET") {
    // Get wrapped state from cookie and unwrap it
    const cookieValue = gloco._getCookieValue(r, STATE_COOKIE_NAME);
    if (!cookieValue) {
      r.return(200, "null");
      return;
    }
    const unwrapped = _unwrapState(gloco._maybeDecodeURIComponent(cookieValue));
    r.return(200, unwrapped !== null ? unwrapped : "null");
    return;
  }

  if (r.method === "PUT") {
    const body = (r.requestText || "").trim();

    // If body is "null" or empty, clear the cookie by setting it to expire in the past
    if (body === "null" || body === "") {
      setCookie(r, STATE_COOKIE_NAME, "", {
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

    setCookie(r, STATE_COOKIE_NAME, wrapped, {
      Path: r.uri,
      Expires: new Date(Date.now() + STATE_COOKIE_LIFESPAN_MS), // 1 year
      Secure: true,
      SameSite: "None",
    });

    r.return(200, JSON.stringify({ success: true, path: r.uri }));
    return;
  }
}

async function handleValidateToken(r: NginxHTTPRequest): Promise<void> {
  // Used by auth_request - soft mode: always returns 200, never blocks
  // Sets X-Auth-Status header so logRequest can record the outcome
  const result = _extractAndValidateClaims(r);

  r.headersOut["X-Auth-Oid"] = result.claims.oid || "-";
  r.headersOut["X-Auth-Upn"] =
    result.claims.upn ||
    result.claims.email ||
    result.claims.preferred_username ||
    "-";

  if (result.status !== "ok") {
    r.headersOut["X-Auth-Status"] = result.status;
    r.return(200, "");
    return;
  }

  const authHeader = r.headersIn["Authorization"] as string;
  try {
    const response = await ngx.fetch(_adAuthEndpoint, {
      method: "GET",
      headers: {
        Authorization: authHeader,
      },
    });
    r.headersOut["X-Auth-Status"] = response.ok ? "ok" : "graph-rejected";
  } catch (e) {
    r.headersOut["X-Auth-Status"] = "graph-error";
  }
  r.return(200, "");
}

function logRequest(r: NginxHTTPRequest): void {
  // js_header_filter - runs after proxy_pass response headers arrive
  // Extracts auth info directly from the token (sync only - no ngx.fetch allowed in header filters)
  const result = _extractAndValidateClaims(r);
  const oid = result.claims.oid || "-";
  const upn =
    result.claims.upn ||
    result.claims.email ||
    result.claims.preferred_username ||
    "-";

  const entry =
    '{"tag":"GLOBAL-COMPONENTS",' +
    '"x_forwarded_for":"' +
    (r.variables.http_x_forwarded_for || "") +
    '",' +
    '"referer":"' +
    (r.variables.http_referer || "") +
    '",' +
    '"request":"' +
    (r.variables.request || "") +
    '",' +
    '"status":' +
    (r.variables.status || "0") +
    "," +
    '"request_length":' +
    (r.variables.request_length || "0") +
    "," +
    '"request_time":' +
    (r.variables.request_time || "0") +
    "," +
    '"body_bytes_sent":' +
    (r.variables.body_bytes_sent || "0") +
    "," +
    '"upstream_response_time":"' +
    (r.variables.upstream_response_time || "") +
    '",' +
    '"upstream_connect_time":"' +
    (r.variables.upstream_connect_time || "") +
    '",' +
    '"upstream_status":"' +
    (r.variables.upstream_status || "") +
    '",' +
    '"oid":"' +
    oid +
    '",' +
    '"upn":"' +
    upn +
    '",' +
    '"auth_status":"' +
    result.status +
    '"}';
  r.warn(entry);
}

function handleStatus(r: NginxHTTPRequest): void {
  r.headersOut["Content-Type"] = "application/json";

  let version = 0;
  let error: string | null = null;
  try {
    const data = fs.readFileSync(DEPLOYMENT_JSON_PATH, "utf8");
    const json = JSON.parse(data);
    version = json.version || 0;
  } catch (e) {
    error = (e as Error).message || String(e);
  }

  const response: { status: string; version: number; error?: string } = {
    status: "online",
    version: version,
  };
  if (error) {
    response.error = error;
  }

  r.return(200, JSON.stringify(response));
}

function filterSwaggerBody(
  r: NginxHTTPRequest,
  data: string,
  flags: NginxHTTPSendBufferOptions,
): void {
  // Replace upstream URL with proxy URL and fix API paths
  const host = (r.headersIn["Host"] as string) || r.variables.host;
  const proxyBase = "https://" + host + "/global-components/";

  // Strip trailing slash from base URL for matching (swagger may not include it)
  const baseUrl = (r.variables.wm_mds_base_url as string).replace(/\/$/, "");
  const pattern = new RegExp(_escapeRegExp(baseUrl), "g");

  const result = data
    .replace(pattern, proxyBase.replace(/\/$/, ""))
    .replace(/\"\/api\//g, '"/global-components/');

  r.sendBuffer(result, flags);
}

export default {
  handleState,
  handleValidateToken,
  handleStatus,
  filterSwaggerBody,
  logRequest,
  setCookie,
};
