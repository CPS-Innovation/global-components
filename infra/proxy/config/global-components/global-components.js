import fs from "fs"

const SESSION_HINT_COOKIE_NAME = "cms-session-hint"
const DEPLOYMENT_JSON_PATH = "/etc/nginx/global-components-deployment.json"
const CMS_AUTH_VALUES_COOKIE_NAME = "Cms-Auth-Values"
const CORS_ALLOWED_ORIGINS = [
  "https://polaris.cps.gov.uk",
  "https://polaris-qa-notprod.cps.gov.uk",
  "https://polaris-dev-notprod.cps.gov.uk",
  "https://cps.outsystemsenterprise.com",
  "https://cps-tst.outsystemsenterprise.com",
  "https://cps-dev.outsystemsenterprise.com",
  "http://localhost",
  "https://localhost",
  "http://127.0.0.1",
  "https://127.0.0.1",
  // see later for check for localhost with port
]

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

function readCmsAuthValues(r) {
  return _maybeDecodeURIComponent(
    _getHeaderValue(r, CMS_AUTH_VALUES_COOKIE_NAME) ||
      _getCookieValue(r, CMS_AUTH_VALUES_COOKIE_NAME)
  )
}

// For nginx js_set - returns origin if allowed, empty string otherwise
function readCorsOrigin(r) {
  const origin = r.headersIn["Origin"]
  return CORS_ALLOWED_ORIGINS.includes(origin) ||
    origin.startsWith("http://localhost:") ||
    origin.startsWith("https://localhost:") ||
    origin.startsWith("http://127.0.0.1:") ||
    origin.startsWith("https://127.0.0.1:")
    ? origin
    : ""
}

function filterSwaggerBody(r, data, flags) {
  // Replace upstream URL with proxy URL and fix API paths
  const host = r.headersIn["Host"] || r.variables.host
  const proxyBase = "https://" + host + "/global-components"

  const pattern = new RegExp(_escapeRegExp(r.variables.global_components_mds_url), "g")
  const result = data
    .replace(pattern, proxyBase)
    .replace(/\"\/api\//g, '"/global-components/')

  r.sendBuffer(result, flags)
}

function handleStatus(r) {
  r.headersOut["Content-Type"] = "application/json"

  let version = 0
  let error = null
  try {
    const data = fs.readFileSync(DEPLOYMENT_JSON_PATH, "utf8")
    const json = JSON.parse(data)
    version = json.version || 0
  } catch (e) {
    error = e.message || String(e)
  }

  const response = {
    status: "online",
    version: version,
  }
  if (error) {
    response.error = error
  }

  r.return(200, JSON.stringify(response))
}

function handleSessionHint(r) {
  const hintValue = _getCookieValue(r, SESSION_HINT_COOKIE_NAME)
  r.return(200, hintValue ? _maybeDecodeURIComponent(hintValue) : "null")
}

export default {
  readCmsAuthValues,
  readCorsOrigin,

  filterSwaggerBody,

  handleStatus,
  handleSessionHint,

  // Export helper functions for vnext
  _getCookieValue,
  _maybeDecodeURIComponent,
}
