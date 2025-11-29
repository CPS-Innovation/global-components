import VARIABLES from "templates/global-components-vars.js";

// Centralised CORS configuration
const CORS_ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const CORS_ALLOWED_HEADERS =
  "Authorization, Content-Type, Correlation-Id, X-Application, Cms-Auth-Values";
const SESSION_HINT_COOKIE_NAME = "cms-session-hint";
const CMS_AUTH_VALUES_COOKIE_NAME = "Cms-Auth-Values";

function getCorsAllowedOrigin(requestOrigin) {
  const allowedOrigins = VARIABLES.corsAllowedOrigins || [];
  if (allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }
  return null;
}

// For nginx js_set - returns origin if allowed, empty string otherwise
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
  return VARIABLES.upstreamUrl;
}

function getFunctionsKey(r) {
  return VARIABLES.functionsKey;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function swaggerBodyFilter(r, data, flags) {
  // Replace upstream URL with proxy URL and fix API paths
  var host = r.headersIn["Host"] || r.variables.host;
  var proxyBase = "https://" + host + "/api/global-components";

  var pattern = new RegExp(escapeRegExp(VARIABLES.upstreamUrl), "g");
  var result = data.replace(pattern, proxyBase);
  result = result.replace(/\"\/api\//g, '"/api/global-components/');

  r.sendBuffer(result, flags);
}

function maybeDecodeURIComponent(value) {
  // Check if value appears to be URL-encoded (contains %XX patterns)
  if (/%[0-9A-Fa-f]{2}/.test(value)) {
    try {
      return decodeURIComponent(value);
    } catch (e) {}
  }
  return value;
}

function getHeaderValue(r, headerName) {
  let headerValue = r.headersIn[headerName] || "";
  return headerValue || "";
}

function getCookieValue(r, cookieName) {
  let cookies = getHeaderValue(r, "Cookie");
  let match = cookies.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]*)`));
  return match ? match[1] : "";
}

function getCmsAuthValues(r) {
  return maybeDecodeURIComponent(
    getHeaderValue(r, CMS_AUTH_VALUES_COOKIE_NAME) ||
      getCookieValue(r, CMS_AUTH_VALUES_COOKIE_NAME)
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

  // Whitelist check
  const allowedUrls = VARIABLES.healthCheckAllowedUrls || [];
  if (!allowedUrls.includes(url)) {
    r.return(403, JSON.stringify({ error: "url not in whitelist", url }));
    return;
  }

  try {
    const timeout = VARIABLES.healthCheckTimeoutMs || 2000;
    const response = await ngx.fetch(url, { method: "GET", timeout });
    r.return(
      200,
      JSON.stringify({
        url,
        status: response.status,
        healthy: response.status >= 200 && response.status < 400,
      })
    );
  } catch (e) {
    r.return(
      200,
      JSON.stringify({ url, status: 0, healthy: false, error: e.message })
    );
  }
}

// function handleCookieRoute(r) {
//   // Handle CORS preflight
//   if (r.method === "OPTIONS") {
//     handleCorsPreflightRequest(r);
//     return;
//   }

//   // CORS headers for actual requests
//   const origin = getCorsAllowedOrigin(r.headersIn["Origin"]);
//   if (!origin) {
//     r.return(403);
//     return;
//   }
//   r.headersOut["Access-Control-Allow-Origin"] = origin;
//   r.headersOut["Access-Control-Allow-Credentials"] = "true";
//   r.headersOut["Vary"] = "Origin";

//   let cookies = r.headersIn.Cookie || "(no cookies)";

//   if (r.method === "POST") {
//     let now = new Date();
//     let expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
//     let requestOrigin =
//       r.headersIn["Origin"] || r.headersIn["Referer"] || "unknown";
//     let newEntry = requestOrigin + ":" + now.toISOString();

//     // Get existing cookie value and append
//     let existingValue = "";
//     let cookieMatch = cookies.match(/cps-global-components-state=([^;]+)/);
//     if (cookieMatch) {
//       existingValue = cookieMatch[1];
//     }

//     let cookieValue = existingValue ? existingValue + "|" + newEntry : newEntry;

//     r.headersOut[
//       "Set-Cookie"
//     ] = `cps-global-components-state=${cookieValue}; Path=${
//       r.uri
//     }; Expires=${expires.toUTCString()}; Secure; SameSite=None`;
//   }

//   r.headersOut["Content-Type"] = "text/plain";
//   r.return(200, cookies);
// }

export default {
  getCmsAuthValues,
  getUpstreamUrl,
  getFunctionsKey,
  getCorsOrigin,
  swaggerBodyFilter,
  //handleCookieRoute,
  handleSessionHint,
  handleCorsPreflightRequest,
  handleHealthCheck,
};
