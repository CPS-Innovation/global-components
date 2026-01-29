const SESSION_HINT_COOKIE_NAME = "Cms-Session-Hint"
const CMS_AUTH_VALUES_COOKIE_NAME = "Cms-Auth-Values"
// Plenty of hardcoded stuff elsewhere in the nginx config. Let's keep only things
//  that are sensitive or trigger differences in the ENV/App settings.
const CORS_ALLOWED_ORIGINS = [
  "https://cps.outsystemsenterprise.com",
  "https://cps-tst.outsystemsenterprise.com",
  "https://cps-dev.outsystemsenterprise.com",
  "http://localhost",
  "https://localhost",
  "http://127.0.0.1",
  "https://127.0.0.1",
  // see later for check for localhost with port
]

function _getHeaderValue(r: NginxHTTPRequest, headerName: string): string {
  return (r.headersIn[headerName] as string) || ""
}

function _getCookieValue(r: NginxHTTPRequest, cookieName: string): string {
  const cookies = _getHeaderValue(r, "Cookie")
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]*)`))
  return match ? match[1] : ""
}

function _maybeDecodeURIComponent(value: string): string {
  // Check if value appears not to be URL-encoded
  // (does not contain %XX patterns)
  if (!/%[0-9A-Fa-f]{2}/.test(value)) {
    return value
  }
  try {
    return decodeURIComponent(value)
  } catch (e) {
    return value
  }
}

function readCmsAuthValues(r: NginxHTTPRequest): string {
  return _maybeDecodeURIComponent(
    _getHeaderValue(r, CMS_AUTH_VALUES_COOKIE_NAME) ||
      _getCookieValue(r, CMS_AUTH_VALUES_COOKIE_NAME)
  )
}

// For nginx js_set - returns origin if allowed, empty string otherwise
function readCorsOrigin(r: NginxHTTPRequest): string {
  const origin = r.headersIn["Origin"] as string
  return CORS_ALLOWED_ORIGINS.includes(origin) ||
    origin.endsWith(".cps.gov.uk") ||
    origin.startsWith("http://localhost:") ||
    origin.startsWith("https://localhost:") ||
    origin.startsWith("http://127.0.0.1:") ||
    origin.startsWith("https://127.0.0.1:")
    ? origin
    : ""
}

function handleSessionHint(r: NginxHTTPRequest): void {
  const hintValue = _getCookieValue(r, SESSION_HINT_COOKIE_NAME)
  r.return(200, hintValue ? _maybeDecodeURIComponent(hintValue) : "null")
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

export default {
  readCmsAuthValues,
  readCorsOrigin,
  computeBlobIndexSuffix,

  handleSessionHint,

  // Export helper functions for vnext
  _getCookieValue,
  _maybeDecodeURIComponent,
}
