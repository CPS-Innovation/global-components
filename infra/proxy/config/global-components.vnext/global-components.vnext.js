import gloco from "templates/global-components.js"

const TENANT_ID = "00dd0d1d-d7e6-6338-ac51-565339c7088c"
const STATE_COOKIE_NAME = "cps-global-components-state"
const STATE_KEYS_NO_AUTH_ON_GET = ["preview"]
const STATE_COOKIE_LIFESPAN_MS = 365 * 24 * 60 * 60 * 1000
const AD_AUTH_ENDPOINT = "https://graph.microsoft.com/v1.0/me"
const HEALTHCHECK_ALLOWED_URLS = [
  "https://polaris.cps.gov.uk/polaris",
  "https://cms.cps.gov.uk/polaris",
  "https://polaris-qa-notprod.cps.gov.uk/polaris",
  "https://cin2.cps.gov.uk/polaris",
  "https://cin3.cps.gov.uk/polaris",
  "https://cin4.cps.gov.uk/polaris",
  "https://cin5.cps.gov.uk/polaris",
  "http://mock-upstream:3000/api/health", // For testing
]
const HEALTHCHECK_TIMEOUT_MS = 2_000

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
      claims.tid === TENANT_ID &&
      claims.appid === r.variables.global_components_application_id
    return { claimsAreValid, claims }
  } catch (e) {
    return { claimsAreValid: false, claims: {} }
  }
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
    // Use helper function from base module
    const cookieValue = gloco._getCookieValue(r, STATE_COOKIE_NAME)
    r.return(
      200,
      cookieValue ? gloco._maybeDecodeURIComponent(cookieValue) : "null"
    )
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
  const allowedUrls = HEALTHCHECK_ALLOWED_URLS || []
  if (!allowedUrls.includes(url)) {
    r.return(403, JSON.stringify({ error: "url not in whitelist", url }))
    return
  }

  try {
    const timeout = HEALTHCHECK_TIMEOUT_MS
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

async function handleValidateToken(r) {
  // Used by auth_request - returns 200 if valid, 401 if not
  const isValid = await _validateToken(r)
  r.return(isValid ? 200 : 401, "")
}

export default {
  handleState,
  handleHealthCheck,
  handleValidateToken,
}
