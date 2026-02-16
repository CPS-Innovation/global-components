import fs from "fs"
// @ts-ignore - njs runtime import path
import gloco from "templates/global-components.js"

const DEPLOYMENT_JSON_PATH =
  "/etc/nginx/templates/global-components-deployment.json"
const TENANT_ID = "00dd0d1d-d7e6-6338-ac51-565339c7088c"
const STATE_COOKIE_NAME = "cps-global-components-state"
const STATE_COOKIE_LIFESPAN_MS = 365 * 24 * 60 * 60 * 1000

interface TokenClaims {
  tid?: string
  appid?: string
  oid?: string
  upn?: string
  email?: string
  preferred_username?: string
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

async function handleState(r: NginxHTTPRequest): Promise<void> {
  if (!["GET", "PUT"].includes(r.method)) {
    r.return(405, JSON.stringify({ error: "Method not allowed" }))
    return
  }

  r.headersOut["Content-Type"] = "application/json"

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
  // Used by auth_request - always enforces AD token validation
  // Sets X-Auth-Oid and X-Auth-Upn headers for capture via auth_request_set
  const result = _extractAndValidateClaims(r)
  if (!result.claimsAreValid) {
    r.return(401, "")
    return
  }

  r.headersOut["X-Auth-Oid"] = result.claims.oid || "-"
  r.headersOut["X-Auth-Upn"] = result.claims.upn || result.claims.email || result.claims.preferred_username || "-"

  const adAuthEndpoint = r.variables.ad_auth_endpoint as string
  const authHeader = r.headersIn["Authorization"] as string
  try {
    const response = await ngx.fetch(adAuthEndpoint, {
      method: "GET",
      headers: {
        Authorization: authHeader,
      },
    })
    r.return(response.ok ? 200 : 401, "")
  } catch (e) {
    r.return(401, "")
  }
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
  handleState,
  handleValidateToken,
  handleStatus,
  filterSwaggerBody,
  setCookie,
}
