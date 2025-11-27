import VARIABLES from 'templates/global-components-vars.js';

function getUpstreamUrl() {
  return VARIABLES.upstreamUrl;
}

function getFunctionsKey() {
  return VARIABLES.functionsKey;
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

export default { getCmsAuthValues, getUpstreamUrl, getFunctionsKey };
