// Reduced mock of config/main/cmsenv.js — for the cms-auth-v2 docker integration
// test ONLY (mounted over /etc/nginx/cmsenv.js by docker-compose.cms-auth-v2.yml).
//
// The real cmsenv derives CMS upstreams from a large js_var block (defaultUpstream*,
// cin2Upstream*, ...) that only nginx-full.conf defines; the test's nginx.conf does
// not, so the real functions would return undefined. This mock returns the docker
// mock-upstream instead, so the login-page shim (uaulLogin.aspx) can be exercised
// locally. It only implements the four functions the shim's js_set calls use.
//
// NEVER deployed — the real cmsenv.js ships to the proxy.

function proxyDestinationCorsham() {
  return "http://mock-upstream:3000";
}

function upstreamCmsDomainName() {
  return "mock-cms.local";
}

function upstreamCmsModernDomainName() {
  return "mock-cms-modern.local";
}

function upstreamCmsServicesDomainName() {
  return "mock-cms-services.local";
}

export default {
  proxyDestinationCorsham,
  upstreamCmsDomainName,
  upstreamCmsModernDomainName,
  upstreamCmsServicesDomainName,
};
