import VARIABLES from "templates/global-components-vars.js"

// Centralised CORS configuration
const SESSION_HINT_COOKIE_NAME = "cms-session-hint"
const CMS_AUTH_VALUES_COOKIE_NAME = "Cms-Auth-Values"
const STATE_COOKIE_NAME = "cps-global-components-state"

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

function handleState(r) {
  const claimValidationResult = _extractAndValidateClaims(r)
  if (!claimValidationResult) {
    r.return(401, "Failed AD validation")
    return
  }

  r.headersOut["Content-Type"] = "application/json"

  if (r.method === "GET") {
    // Read the cookie and return its value as JSON
    const cookieValue = _getCookieValue(r, STATE_COOKIE_NAME)
    r.return(200, cookieValue ? _maybeDecodeURIComponent(cookieValue) : "null")
    return
  }

  if (r.method === "PUT") {
    // Read body and set as cookie on this exact path
    const body = r.requestText || ""
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year

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

  // Method not allowed
  r.return(405, JSON.stringify({ error: "Method not allowed" }))
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
}
