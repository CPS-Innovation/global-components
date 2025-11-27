import VARIABLES from 'templates/global-components-vars.js';

function getUpstreamUrl(r) {
  return VARIABLES.upstreamUrl;
}

function getFunctionsKey(r) {
  return VARIABLES.functionsKey;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function swaggerBodyFilter(r, data, flags) {
  // Replace upstream URL with proxy URL and fix API paths
  var host = r.headersIn['Host'] || r.variables.host;
  var proxyBase = 'https://' + host + '/api/global-components';

  var pattern = new RegExp(escapeRegExp(VARIABLES.upstreamUrl), 'g');
  var result = data.replace(pattern, proxyBase);
  result = result.replace(/\"\/api\//g, '"/api/global-components/');

  r.sendBuffer(result, flags);
}

function maybeDecodeURIComponent(value) {
  // Check if value appears to be URL-encoded (contains %XX patterns)
  if (/%[0-9A-Fa-f]{2}/.test(value)) {
    try {
      return decodeURIComponent(value);
    } catch (e) {
      // If decoding fails (malformed encoding), return original
      return value;
    }
  }
  return value;
}

function getCmsAuthValues(r) {
  // Prefer header, fall back to cookie
  let headerValue = r.headersIn["Cms-Auth-Values"] || "";
  if (headerValue) {
    return maybeDecodeURIComponent(headerValue);
  }

  let cookies = r.headersIn.Cookie || "";
  let match = cookies.match(/Cms-Auth-Values=([^;]+)/);
  return match ? maybeDecodeURIComponent(match[1]) : "";
}

function handleCookieRoute(r) {
  let cookies = r.headersIn.Cookie || "(no cookies)";

  if (r.method === "POST") {
    let now = new Date();
    let expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    let origin = r.headersIn['Origin'] || r.headersIn['Referer'] || 'unknown';
    let newEntry = origin + ":" + now.toISOString();

    // Get existing cookie value and append
    let existingValue = "";
    let cookieMatch = cookies.match(/cps-global-components-state=([^;]+)/);
    if (cookieMatch) {
      existingValue = cookieMatch[1];
    }

    let cookieValue = existingValue ? existingValue + "|" + newEntry : newEntry;

    r.headersOut["Set-Cookie"] = `cps-global-components-state=${cookieValue}; Path=/; Expires=${expires.toUTCString()}; Secure; SameSite=None`;
  }

  r.headersOut["Content-Type"] = "text/plain";
  r.return(200, cookies);
}

export default { getCmsAuthValues, getUpstreamUrl, getFunctionsKey, swaggerBodyFilter, handleCookieRoute };
