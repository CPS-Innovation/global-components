// tests/.dist/mock-vars.js
var mock_vars_default = {
  upstreamUrl: "http://mock-upstream:3000/api/",
  functionsKey: "test-functions-key",
  healthCheckAllowedUrls: ["http://allowed-url.com/health"],
  healthCheckTimeoutMs: 2e3,
  corsAllowedOrigins: ["https://example.com", "https://allowed-origin.com"]
};

// config/global-components.js
var CORS_ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
var CORS_ALLOWED_HEADERS = "Authorization, Content-Type, Correlation-Id, X-Application, Cms-Auth-Values";
var SESSION_HINT_COOKIE_NAME = "cms-session-hint";
var CMS_AUTH_VALUES_COOKIE_NAME = "Cms-Auth-Values";
function getCorsAllowedOrigin(requestOrigin) {
  const allowedOrigins = mock_vars_default.corsAllowedOrigins || [];
  if (allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }
  return null;
}
function getCorsOrigin(r) {
  const origin = getCorsAllowedOrigin(r.headersIn["Origin"]);
  return origin || "";
}
function handleCorsPreflightRequest(r) {
  const origin = getCorsAllowedOrigin(r.headersIn["Origin"]);
  if (!origin) {
    r.return(403);
    return;
  }
  r.headersOut["Access-Control-Allow-Origin"] = origin;
  r.headersOut["Access-Control-Allow-Credentials"] = "true";
  r.headersOut["Access-Control-Allow-Methods"] = CORS_ALLOWED_METHODS;
  r.headersOut["Access-Control-Allow-Headers"] = CORS_ALLOWED_HEADERS;
  r.headersOut["Vary"] = "Origin";
  r.return(204);
}
function getUpstreamUrl(r) {
  return mock_vars_default.upstreamUrl;
}
function getFunctionsKey(r) {
  return mock_vars_default.functionsKey;
}
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function swaggerBodyFilter(r, data, flags) {
  var host = r.headersIn["Host"] || r.variables.host;
  var proxyBase = "https://" + host + "/api/global-components";
  var pattern = new RegExp(escapeRegExp(mock_vars_default.upstreamUrl), "g");
  var result = data.replace(pattern, proxyBase);
  result = result.replace(/\"\/api\//g, '"/api/global-components/');
  r.sendBuffer(result, flags);
}
function maybeDecodeURIComponent(value) {
  if (/%[0-9A-Fa-f]{2}/.test(value)) {
    try {
      return decodeURIComponent(value);
    } catch (e) {
    }
  }
  return value;
}
function getCookieValue(r, cookieName) {
  let cookies = r.headersIn.Cookie || "";
  let match = cookies.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]*)`));
  return match ? match[1] : "";
}
function getCmsAuthValues(r) {
  return maybeDecodeURIComponent(
    r.args[CMS_AUTH_VALUES_COOKIE_NAME] || getCookieValue(r, CMS_AUTH_VALUES_COOKIE_NAME)
  );
}
function handleSessionHint(r) {
  const hintValue = getCookieValue(r, SESSION_HINT_COOKIE_NAME);
  r.return(200, hintValue ? maybeDecodeURIComponent(hintValue) : "null");
}
async function handleHealthCheck(r) {
  r.headersOut["Content-Type"] = "application/json";
  const url = r.args.url;
  if (!url) {
    r.return(400, JSON.stringify({ error: "url parameter required" }));
    return;
  }
  const allowedUrls = mock_vars_default.healthCheckAllowedUrls || [];
  if (!allowedUrls.includes(url)) {
    r.return(403, JSON.stringify({ error: "url not in whitelist", url }));
    return;
  }
  try {
    const timeout = mock_vars_default.healthCheckTimeoutMs || 2e3;
    const response = await ngx.fetch(url, { method: "GET", timeout });
    r.return(
      200,
      JSON.stringify({
        url,
        status: response.status,
        healthy: response.status >= 200 && response.status < 400
      })
    );
  } catch (e) {
    r.return(
      200,
      JSON.stringify({ url, status: 0, healthy: false, error: e.message })
    );
  }
}
var global_components_default = {
  getCmsAuthValues,
  getUpstreamUrl,
  getFunctionsKey,
  getCorsOrigin,
  swaggerBodyFilter,
  //handleCookieRoute,
  handleSessionHint,
  handleCorsPreflightRequest,
  handleHealthCheck
};
export {
  global_components_default as default
};
