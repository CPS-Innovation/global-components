import VARIABLES from "templates/global-components-vars.js"

const SESSION_HINT_COOKIE_NAME = "cms-session-hint"
const CMS_AUTH_VALUES_COOKIE_NAME = "Cms-Auth-Values"
const STATE_COOKIE_NAME = "cps-global-components-state"
const STATE_KEYS_NO_AUTH_ON_GET = ["preview"]
const STATE_COOKIE_LIFESPAN_MS = 365 * 24 * 60 * 60 * 1000
const AD_AUTH_ENDPOINT = "https://graph.microsoft.com/v1.0/me"

function _getHeaderValue(r, headerName) {
  return r.headersIn[headerName] || ""
}

function _getCookieValue(r, cookieName) {
  const cookies = _getHeaderValue(r, "Cookie")
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]*)`))
  return match ? match[1] : ""
}

function _escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function _maybeDecodeURIComponent(value) {
  // Check if value appears to be URL-encoded (contains %XX patterns)
  if (/%[0-9A-Fa-f]{2}/.test(value)) {
    try {
      return decodeURIComponent(value)
    } catch (e) {}
  }
  return value
}

function _base64UrlDecode(str) {
  // Replace base64url chars with base64 chars
  str = str.replace(/-/g, "+").replace(/_/g, "/")
  // Pad if necessary
  while (str.length % 4) {
    str += "="
  }
  return atob(str)
}

function _extractAndValidateClaims(r) {
  const authHeader = r.headersIn["Authorization"]

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
    const claims = JSON.parse(payload)
    const claimsAreValid =
      claims &&
      claims.tid === VARIABLES.tenantId &&
      claims.appid === VARIABLES.applicationId
    return { claimsAreValid, claims }
  } catch (e) {
    return { claimsAreValid: false, claims: {} }
  }
}

function readUpstreamUrl(r) {
  return VARIABLES.upstreamUrl
}

function readFunctionsKey(r) {
  return VARIABLES.functionsKey
}

function readCmsAuthValues(r) {
  return _maybeDecodeURIComponent(
    _getHeaderValue(r, CMS_AUTH_VALUES_COOKIE_NAME) ||
      _getCookieValue(r, CMS_AUTH_VALUES_COOKIE_NAME)
  )
}

// For nginx js_set - returns origin if allowed, empty string otherwise
function readCorsOrigin(r) {
  return (VARIABLES.corsAllowedOrigins || []).includes(r.headersIn["Origin"])
    ? r.headersIn["Origin"]
    : ""
}

function filterSwaggerBody(r, data, flags) {
  // Replace upstream URL with proxy URL and fix API paths
  const host = r.headersIn["Host"] || r.variables.host
  const proxyBase = "https://" + host + "/api/global-components"

  const pattern = new RegExp(_escapeRegExp(VARIABLES.upstreamUrl), "g")
  const result = data
    .replace(pattern, proxyBase)
    .replace(/\"\/api\//g, '"/api/global-components/')

  r.sendBuffer(result, flags)
}

function handleStatus(r) {
  r.headersOut["Content-Type"] = "application/json"
  r.return(
    200,
    JSON.stringify({ status: "online", version: VARIABLES.deployVersion || 0 })
  )
}

function handleSessionHint(r) {
  const hintValue = _getCookieValue(r, SESSION_HINT_COOKIE_NAME)
  r.return(200, hintValue ? _maybeDecodeURIComponent(hintValue) : "null")
}

async function _validateToken(r) {
  // First: validate claims locally (tenant ID and app ID)
  const result = _extractAndValidateClaims(r)
  if (!result.claimsAreValid) {
    return false
  }

  // Second: validate token with Graph API (checks signature, expiry, revocation)
  const authHeader = r.headersIn["Authorization"]
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

async function handleState(r) {
  if (!["GET", "PUT"].includes(r.method)) {
    // Method not allowed
    r.return(405, JSON.stringify({ error: "Method not allowed" }))
    return
  }

  r.headersOut["Content-Type"] = "application/json"

  // Extract state key from URI: /api/global-components/state/{key}
  const stateKey = r.uri
    .replace(/^\/api\/global-components\/state\//, "")
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
    const cookieValue = _getCookieValue(r, STATE_COOKIE_NAME)
    r.return(200, cookieValue ? _maybeDecodeURIComponent(cookieValue) : "null")
    return
  }

  if (r.method === "PUT") {
    // Read body and set as cookie on this exact path
    const body = r.requestText || ""
    const expires = new Date(Date.now() + STATE_COOKIE_LIFESPAN_MS) // 1 year

    r.headersOut["Set-Cookie"] =
      STATE_COOKIE_NAME +
      "=" +
      encodeURIComponent(body) +
      "; Path=" +
      r.uri +
      "; Expires=" +
      expires.toUTCString() +
      "; Secure; SameSite=None"

    r.return(200, JSON.stringify({ success: true, path: r.uri }))
    return
  }
}

async function handleHealthCheck(r) {
  r.headersOut["Content-Type"] = "application/json"

  const url = r.args.url

  if (!url) {
    r.return(400, JSON.stringify({ error: "url parameter required" }))
    return
  }

  // Whitelist check
  const allowedUrls = VARIABLES.healthCheckAllowedUrls || []
  if (!allowedUrls.includes(url)) {
    r.return(403, JSON.stringify({ error: "url not in whitelist", url }))
    return
  }

  try {
    const timeout = VARIABLES.healthCheckTimeoutMs || 2000
    const response = await ngx.fetch(url, { method: "GET", timeout })
    r.return(
      200,
      JSON.stringify({
        url,
        status: response.status,
        healthy: response.status >= 200 && response.status < 400,
      })
    )
  } catch (e) {
    r.return(
      200,
      JSON.stringify({ url, status: 0, healthy: false, error: e.message })
    )
  }
}

async function handlePreview(r) {
  const blobUrl = VARIABLES.previewHtmlBlobUrl

  if (!blobUrl) {
    r.return(500, "Preview not configured")
    return
  }

  try {
    const response = await ngx.fetch(blobUrl, { method: "GET" })
    if (!response.ok) {
      r.return(502, "Failed to fetch preview page")
      return
    }
    const html = await response.text()
    r.headersOut["Content-Type"] = "text/html; charset=utf-8"
    r.return(200, html)
  } catch (e) {
    r.return(502, "Error fetching preview page: " + e.message)
  }
}

async function handleValidateToken(r) {
  // Used by auth_request - returns 200 if valid, 401 if not
  const isValid = await _validateToken(r)
  r.return(isValid ? 200 : 401, "")
}

export default {
  readCmsAuthValues,
  readUpstreamUrl,
  readFunctionsKey,
  readCorsOrigin,

  filterSwaggerBody,

  handleStatus,
  handleSessionHint,
  handleState,
  handleHealthCheck,
  handlePreview,
  handleValidateToken,
}
