import fs from "fs"
// @ts-ignore - njs runtime import path
import gloco from "templates/global-components.js"

const DEPLOYMENT_JSON_PATH =
  "/etc/nginx/templates/global-components-deployment.json"
const TENANT_ID = "00dd0d1d-d7e6-6338-ac51-565339c7088c"
const VALIDATE_TOKEN_AGAINST_AD = false // Set to true when ready to enforce AD token validation
const STATE_COOKIE_NAME = "cps-global-components-state"
const STATE_KEYS_NO_AUTH_ON_GET = ["preview"]
const STATE_COOKIE_LIFESPAN_MS = 365 * 24 * 60 * 60 * 1000
const AD_AUTH_ENDPOINT = "https://graph.microsoft.com/v1.0/me"

interface TokenClaims {
  tid?: string
  appid?: string
  [key: string]: unknown
}

interface ClaimsResult {
  claimsAreValid: boolean
  claims: TokenClaims
}

interface CookieOptions {
  Path?: string
  Expires?: Date
  Secure?: boolean
  SameSite?: "Strict" | "Lax" | "None"
}

function _escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function _base64UrlDecode(str: string): string {
  // Replace base64url chars with base64 chars
  str = str.replace(/-/g, "+").replace(/_/g, "/")
  // Pad if necessary
  while (str.length % 4) {
    str += "="
  }
  return atob(str)
}

function _base64UrlEncode(str: string): string {
  // Encode to base64, then convert to base64url (URL-safe, no padding)
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

// Wrap state for storage (encode). Currently base64url, could add encryption later.
function _wrapState(plaintext: string): string {
  return _base64UrlEncode(plaintext)
}

// Unwrap state from storage (decode). Currently base64url, could add decryption later.
function _unwrapState(wrapped: string): string | null {
  try {
    return _base64UrlDecode(wrapped)
  } catch (e) {
    // If decode fails, return null (corrupted or legacy data)
    return null
  }
}

function buildCookieString(
  name: string,
  value: string,
  options?: CookieOptions
): string {
  let cookie = name + "=" + value
  if (options?.Path) {
    cookie += "; Path=" + options.Path
  }
  if (options?.Expires) {
    cookie += "; Expires=" + options.Expires.toUTCString()
  }
  if (options?.Secure) {
    cookie += "; Secure"
  }
  if (options?.SameSite) {
    cookie += "; SameSite=" + options.SameSite
  }
  return cookie
}

function setCookie(
  r: NginxHTTPRequest,
  name: string,
  value: string,
  options?: CookieOptions
): void {
  const cookie = buildCookieString(name, value, options)
  // njs headersOut["Set-Cookie"] accepts either string or string[]
  // For multiple cookies, we need to use an array
  const existing = r.headersOut["Set-Cookie"]
  if (existing) {
    if (Array.isArray(existing)) {
      existing.push(cookie)
    } else {
      // Convert single string to array and add new cookie
      r.headersOut["Set-Cookie"] = [existing as unknown as string, cookie]
    }
  } else {
    // First cookie - use string for compatibility
    ;(r.headersOut as Record<string, string>)["Set-Cookie"] = cookie
  }
}

function _extractAndValidateClaims(r: NginxHTTPRequest): ClaimsResult {
  const authHeader = r.headersIn["Authorization"] as string | undefined

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { claimsAreValid: false, claims: {} }
  }

  const token = authHeader.substring(7)
  const parts = token.split(".")

  if (parts.length !== 3) {
    return { claimsAreValid: false, claims: {} }
  }

  try {
    const payload = _base64UrlDecode(parts[1])
    const claims: TokenClaims = JSON.parse(payload)
    const claimsAreValid =
      claims &&
      claims.tid === TENANT_ID &&
      claims.appid === r.variables.global_components_application_id
    return { claimsAreValid, claims }
  } catch (e) {
    return { claimsAreValid: false, claims: {} }
  }
}

async function _validateToken(r: NginxHTTPRequest): Promise<boolean> {
  // Skip validation entirely if not enforcing AD tokens
  if (!VALIDATE_TOKEN_AGAINST_AD) {
    return true
  }

  // First: validate claims locally (tenant ID and app ID)
  const result = _extractAndValidateClaims(r)
  if (!result.claimsAreValid) {
    return false
  }

  // Second: validate token with Graph API (checks signature, expiry, revocation)
  const authHeader = r.headersIn["Authorization"] as string
  try {
    const response = await ngx.fetch(AD_AUTH_ENDPOINT, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        Host: "graph.microsoft.com",
      },
    })
    return response.ok
  } catch (e) {
    return false
  }
}

// Compute blob path suffix: folder paths with trailing slash get index.html appended
function computeBlobIndexSuffix(r: NginxHTTPRequest): string {
  const uri = r.uri
  // If URI ends with a file extension, no suffix needed
  if (/\.[^/]+$/.test(uri)) {
    return ""
  }
  // If URI ends with /, append index.html (folder paths are redirected to have trailing slash)
  if (uri.endsWith("/")) {
    return "index.html"
  }
  // Shouldn't reach here if redirect location is working, but handle gracefully
  return "/index.html"
}

async function handleState(r: NginxHTTPRequest): Promise<void> {
  if (!["GET", "PUT"].includes(r.method)) {
    // Method not allowed
    r.return(405, JSON.stringify({ error: "Method not allowed" }))
    return
  }

  r.headersOut["Content-Type"] = "application/json"

  // Extract state key from URI: /global-components/state/{key}
  const stateKey = r.uri
    .replace(/^\/global-components\/state\//, "")
    .split("/")[0]
  const isPublicKey = STATE_KEYS_NO_AUTH_ON_GET.includes(stateKey)
  // Only allow unauthenticated GET for keys in the whitelist
  const shouldSkipAuth = isPublicKey && r.method === "GET"

  if (!shouldSkipAuth) {
    const isValid = await _validateToken(r)
    if (!isValid) {
      r.return(401, JSON.stringify({ error: "Unauthorized" }))
      return
    }
  }

  if (r.method === "GET") {
    // Get wrapped state from cookie and unwrap it
    const cookieValue = gloco._getCookieValue(r, STATE_COOKIE_NAME)
    if (!cookieValue) {
      r.return(200, "null")
      return
    }
    const unwrapped = _unwrapState(gloco._maybeDecodeURIComponent(cookieValue))
    r.return(200, unwrapped !== null ? unwrapped : "null")
    return
  }

  if (r.method === "PUT") {
    const body = (r.requestText || "").trim()

    // If body is "null" or empty, clear the cookie by setting it to expire in the past
    if (body === "null" || body === "") {
      setCookie(r, STATE_COOKIE_NAME, "", {
        Path: r.uri,
        Expires: new Date(0), // Expire immediately (clears cookie)
        Secure: true,
        SameSite: "None",
      })
      r.return(200, JSON.stringify({ success: true, path: r.uri, cleared: true }))
      return
    }

    // Wrap the body and store in cookie
    const wrapped = _wrapState(body)

    setCookie(r, STATE_COOKIE_NAME, wrapped, {
      Path: r.uri,
      Expires: new Date(Date.now() + STATE_COOKIE_LIFESPAN_MS), // 1 year
      Secure: true,
      SameSite: "None",
    })

    r.return(200, JSON.stringify({ success: true, path: r.uri }))
    return
  }
}

async function handleValidateToken(r: NginxHTTPRequest): Promise<void> {
  // Used by auth_request - returns 200 if valid, 401 if not
  const isValid = await _validateToken(r)
  r.return(isValid ? 200 : 401, "")
}

function handleStatus(r: NginxHTTPRequest): void {
  r.headersOut["Content-Type"] = "application/json"

  let version = 0
  let error: string | null = null
  try {
    const data = fs.readFileSync(DEPLOYMENT_JSON_PATH, "utf8")
    const json = JSON.parse(data)
    version = json.version || 0
  } catch (e) {
    error = (e as Error).message || String(e)
  }

  const response: { status: string; version: number; error?: string } = {
    status: "online",
    version: version,
  }
  if (error) {
    response.error = error
  }

  r.return(200, JSON.stringify(response))
}

function filterSwaggerBody(
  r: NginxHTTPRequest,
  data: string,
  flags: NginxHTTPSendBufferOptions
): void {
  // Replace upstream URL with proxy URL and fix API paths
  const host = (r.headersIn["Host"] as string) || r.variables.host
  const proxyBase = "https://" + host + "/global-components/"

  // Strip trailing slash from base URL for matching (swagger may not include it)
  const baseUrl = (r.variables.wm_mds_base_url as string).replace(/\/$/, "")
  const pattern = new RegExp(_escapeRegExp(baseUrl), "g")

  const result = data
    .replace(pattern, proxyBase.replace(/\/$/, ""))
    .replace(/\"\/api\//g, '"/global-components/')

  r.sendBuffer(result, flags)
}

export default {
  computeBlobIndexSuffix,
  handleState,
  handleValidateToken,
  handleStatus,
  filterSwaggerBody,
  setCookie,
}
