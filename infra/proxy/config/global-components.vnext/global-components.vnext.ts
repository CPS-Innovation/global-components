import fs from "fs";
// @ts-ignore - njs runtime import path
import gloco from "templates/global-components.js";

const DEPLOYMENT_JSON_PATH =
  "/etc/nginx/templates/global-components-deployment.json";
const TENANT_ID = "00dd0d1d-d7e6-6338-ac51-565339c7088c";
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
};
