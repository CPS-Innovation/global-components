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

function getCmsAuthValues(r) {
  // Prefer header, fall back to cookie
  let headerValue = r.headersIn["Cms-Auth-Values"] || "";
  if (headerValue) {
    return headerValue;
  }

  let cookies = r.headersIn.Cookie || "";
  let match = cookies.match(/Cms-Auth-Values=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export default { getCmsAuthValues, getUpstreamUrl, getFunctionsKey, swaggerBodyFilter };
