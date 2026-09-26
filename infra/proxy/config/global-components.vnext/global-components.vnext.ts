// @ts-ignore - njs runtime import path
import gloco from "templates/global-components.js";

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

function filterSwaggerBody(
  r: NginxHTTPRequest,
  data: string,
  flags: NginxHTTPSendBufferOptions,
): void {
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
  const host = (r.headersIn["Host"] as string) || r.variables.host;
  const proxyBase = "https://" + host + "/global-components/api";

  // Strip trailing slash from base URL for matching (swagger may not include it)
  const baseUrl = (r.variables.wm_mds_base_url as string).replace(/\/$/, "");
  const pattern = new RegExp(_escapeRegExp(baseUrl), "g");

  r.sendBuffer(data.replace(pattern, proxyBase), flags);
}

export default {
  handleValidateToken,
  filterSwaggerBody,
};
