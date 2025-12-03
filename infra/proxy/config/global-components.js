import VARIABLES from "templates/global-components-vars.js"

const SESSION_HINT_COOKIE_NAME = "cms-session-hint"
const CMS_AUTH_VALUES_COOKIE_NAME = "Cms-Auth-Values"

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
  const proxyBase = "https://" + host + "/global-components"

  const pattern = new RegExp(_escapeRegExp(VARIABLES.upstreamUrl), "g")
  const result = data
    .replace(pattern, proxyBase)
    .replace(/\"\/api\//g, '"/global-components/')

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

export default {
  readCmsAuthValues,
  readUpstreamUrl,
  readFunctionsKey,
  readCorsOrigin,

  filterSwaggerBody,

  handleStatus,
  handleSessionHint,

  // Export helper functions for vnext
  _getCookieValue,
  _maybeDecodeURIComponent,
}
