import fs from "fs";
// @ts-ignore - njs runtime import path
import gloco from "templates/global-components.js";

const DEPLOYMENT_JSON_PATH =
  "/etc/nginx/templates/global-components-deployment.json";
const TENANT_ID = "00dd0d1d-d7e6-4338-ac51-565339c7088c";
const VALIDATE_TOKEN_AGAINST_AD = false; // Set to true when ready to enforce AD token validation
const AD_AUTH_ENDPOINT = "https://graph.microsoft.com/v1.0/me";

interface TokenClaims {
  tid?: string;
  appid?: string;
  [key: string]: unknown;
}

interface ClaimsResult {
  claimsAreValid: boolean;
  claims: TokenClaims;
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

function _extractAndValidateClaims(r: NginxHTTPRequest): ClaimsResult {
  const authHeader = r.headersIn["Authorization"] as string | undefined;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { claimsAreValid: false, claims: {} };
  }

  const token = authHeader.substring(7);
  const parts = token.split(".");

  if (parts.length !== 3) {
    return { claimsAreValid: false, claims: {} };
  }

  try {
    const payload = _base64UrlDecode(parts[1]);
    const claims: TokenClaims = JSON.parse(payload);
    const claimsAreValid =
      claims &&
      claims.tid === TENANT_ID &&
      claims.appid === process.env["GLOBAL_COMPONENTS_APPLICATION_ID"];
    return { claimsAreValid, claims };
  } catch (e) {
    return { claimsAreValid: false, claims: {} };
  }
}

async function _validateToken(r: NginxHTTPRequest): Promise<boolean> {
  // Skip validation entirely if not enforcing AD tokens
  if (!VALIDATE_TOKEN_AGAINST_AD) {
    return true;
  }

  // First: validate claims locally (tenant ID and app ID)
  const result = _extractAndValidateClaims(r);
  if (!result.claimsAreValid) {
    return false;
  }

  // Second: validate token with Graph API (checks signature, expiry, revocation)
  const authHeader = r.headersIn["Authorization"] as string;
  try {
    const response = await ngx.fetch(AD_AUTH_ENDPOINT, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        Host: "graph.microsoft.com",
      },
    });
    return response.ok;
  } catch (e) {
    return false;
  }
}

async function handleValidateToken(r: NginxHTTPRequest): Promise<void> {
  // Used by auth_request - returns 200 if valid, 401 if not
  const isValid = await _validateToken(r);
  r.return(isValid ? 200 : 401, "");
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

// ---------------------------------------------------------------------------
// OS host variants
//
// Each environment has one OutSystems host, named literally in its
// configuration/config.<env>.json. A variant is the same config pointed at
// another OS host (configuration/config.<env>.<variant>.json, deployed beside
// config.json as config.<variant>.json), so named users can be switched onto
// that host while everyone else stays put.
//
// The switch is a per-environment cookie on this (polaris) host, Path=/, whose
// value is the variant's OS host. Two things read it:
//   - the config route below, so the component on CWA gets the variant config
//     (its links then point at the variant host);
//   - Polaris's /init (appAuthRedirect), which every route into OutSystems
//     passes through — C-button, CWA links, case-review — and which moves the
//     handover onto the cookie's host. That lives in Polaris's nginx, and relies
//     on AUTH_HANDOVER_WHITELIST to vouch for the host, hence the cookie holding
//     a host rather than a variant name.
//
// Must match the variant files in configuration/ — the unit tests check both
// ways.
// ---------------------------------------------------------------------------

const OS_HOST_VARIANTS: Record<string, Record<string, string>> = {
  test: {
    oapps: "oapps-qa-notprod.int.cps.gov.uk",
    "cps-lon": "cpslon-tst.outsystemsenterprise.com",
  },
};

const OS_TARGET_COOKIE_PREFIX = "Gloco-Os-Target-";
const OS_TARGET_COOKIE_LIFESPAN_MS = 365 * 24 * 60 * 60 * 1000;

function _getCookie(r: NginxHTTPRequest, name: string): string | undefined {
  const cookies = (r.headersIn["Cookie"] as string | undefined) || "";
  const parts = cookies.split(";");
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (part.indexOf(name + "=") === 0) {
      return decodeURIComponent(part.substring(name.length + 1));
    }
  }
  return undefined;
}

function _variantForHost(env: string, host: string | undefined): string | undefined {
  if (!host) {
    return undefined;
  }
  const variants = OS_HOST_VARIANTS[env] || {};
  const names = Object.keys(variants);
  for (let i = 0; i < names.length; i++) {
    if (variants[names[i]] === host.toLowerCase()) {
      return names[i];
    }
  }
  return undefined;
}

function _hostOf(url: string | undefined): string | undefined {
  const match = (url || "").match(/^https?:\/\/([^/:]+)/i);
  return match ? match[1].toLowerCase() : undefined;
}

// js_set for the config.json locations: which blob to serve.
//   - Cross-origin (the component or the handover on an OS page, which sends
//     Origin): the config for THAT page's host, whatever the switch says. MSAL
//     tokens, OS ClientVars and CMS auth are all per-origin, so config has to
//     match the page it runs on.
//   - Same-origin (the component on CWA, which sends the cookie but no Origin):
//     the variant the switch names, if any.
//   - Anything else, or a host with no variant: config.json.
function readConfigBlobName(r: NginxHTTPRequest): string {
  // Set by the per-environment config.json location before it hands over to
  // the shared internal location, so read it rather than the (rewritten) URI.
  const env = (r.variables.gloco_config_env as string | undefined) || "";
  const originHost = _hostOf(r.headersIn["Origin"] as string | undefined);
  const requestHost = ((r.headersIn["Host"] as string | undefined) || "").split(":")[0].toLowerCase();
  const isCrossOrigin = !!originHost && originHost !== requestHost;

  const variant = isCrossOrigin
    ? _variantForHost(env, originHost)
    : _variantForHost(env, _getCookie(r, OS_TARGET_COOKIE_PREFIX + env));

  return variant ? "config." + variant + ".json" : "config.json";
}

// /global-components/os-target/<env> — the switch, driven by the preview page.
//   GET    → { current: <host> | null, options: [{ variant, host }] }
//   PUT    → body { host }: switch onto that variant host (must be one of options)
//   DELETE → switch back to the environment's own host
// Same-origin only (the preview page is served from this host), so no CORS.
function handleOsTarget(r: NginxHTTPRequest): void {
  const env = (r.uri.match(/^\/global-components\/os-target\/([^/]+)$/) || [])[1] || "";
  const variants = OS_HOST_VARIANTS[env] || {};
  const cookieName = OS_TARGET_COOKIE_PREFIX + env;
  const setCookie = (value: string, expires: Date) => {
    // njs types Set-Cookie as string[]; a single string is fine at runtime
    // (same cast as _setCookie in main/global-components.ts).
    (r.headersOut as Record<string, string>)["Set-Cookie"] =
      cookieName + "=" + encodeURIComponent(value) + "; Path=/; Expires=" + expires.toUTCString() + "; Secure; HttpOnly; SameSite=Lax";
  };
  r.headersOut["Content-Type"] = "application/json";

  if (r.method === "GET") {
    const current = _getCookie(r, cookieName);
    r.return(
      200,
      JSON.stringify({
        current: _variantForHost(env, current) ? current : null,
        options: Object.keys(variants).map(variant => ({ variant, host: variants[variant] })),
      }),
    );
    return;
  }

  if (r.method === "PUT") {
    let host: string | undefined;
    try {
      host = JSON.parse(r.requestText || "{}").host;
    } catch (e) {
      host = undefined;
    }
    if (!_variantForHost(env, host)) {
      r.return(400, JSON.stringify({ error: "unknown OS host for " + env }));
      return;
    }
    setCookie(host!.toLowerCase(), new Date(Date.now() + OS_TARGET_COOKIE_LIFESPAN_MS));
    r.return(200, JSON.stringify({ current: host!.toLowerCase() }));
    return;
  }

  if (r.method === "DELETE") {
    setCookie("", new Date(0));
    r.return(200, JSON.stringify({ current: null }));
    return;
  }

  r.return(405, JSON.stringify({ error: "Method not allowed" }));
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
  handleValidateToken,
  handleStatus,
  filterSwaggerBody,
  readConfigBlobName,
  handleOsTarget,
  OS_HOST_VARIANTS,
};
