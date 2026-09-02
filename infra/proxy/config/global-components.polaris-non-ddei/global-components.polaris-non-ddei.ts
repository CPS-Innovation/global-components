// ---------------------------------------------------------------------------
// Non-DDEI CMS auth handover — a throwaway PROOF that PolarisDDEI's
// AuthHandover/InitiateCookies (`/api/init/`) can be done entirely in njs.
//
// Chain (a replica of the production /polaris -> /init flow, minus DDEI):
//   /polaris-non-ddei  (IE)  -> capture the CMS cookie header, 302 to
//   /init-non-ddei     (Edge)-> whitelist cookies, mint the CMS modern token,
//                               verify it via GraphQL, set the Cms-Auth-Values
//                               cookie, then redirect: PolarisAuthRedirect
//                               (polaris-ui-url) or CmsLaunch (/polaris-ui/go).
//
// EVOLUTIONARY DEAD END. Deployed out-of-band (drop the .conf + compiled .js
// onto the server, picked up by `include global-components*.conf`). No secrets,
// no Azure AD, no Table Storage — this flow is purely CMS cookie/session. The
// refined version will live in the cms-auth-v2 module later.
//
// Deliberately SIMPLIFIED vs DDEI (see the plan):
//   - No Corsham/Farnborough opposite-target retry: token mint is a $host
//     loopback fetch that re-enters the proxy's own ^/CMS.* routing (which picks
//     the datacentre from the cookies). Single attempt.
//   - CMS version discovery is best-effort with a hardcoded fallback.
//   - Case launch resolves the URN in the UI: 302 to /polaris-ui/go?ctx={caseId}
//     instead of DDEI's GraphQL getCaseSummary -> /polaris-ui/case-details/...
//   - Omitted (refined version will add): Cms-Session-Hint, the argsShim /
//     shimBigIpCookies legacy shims, and the cms-modern-token / termination routes.
// ---------------------------------------------------------------------------

import qs from "querystring";

// Cookie-name roots kept from the incoming cookie blob (DDEI WhitelistedCookieNameRoots),
// plus the new F5 form (C-CIN3-LBsessioncookie / F-CIN3-...) matched by suffix —
// which folds in the production proxy's _shimBigIpCookies step.
const WHITELIST_ROOTS = [
  "ASP.NET_SessionId",
  "UID",
  "WindowID",
  "CMSUSER",
  ".CMSAUTH",
  "BIGipServer",
];

// Fallback when version discovery can't read the /CMS redirect. The refined
// production version must always discover (CMS bumps this on release).
const DEFAULT_CMS_VERSION = "CMS.24.0.01";

// Spoof MSIE7/Trident so the loopback fetch is treated as ie+ and falls through
// the proxy's ^/CMS.* IE-mode coercion (nonie+ would get a 402/302) to CMS itself.
const MSIE_UA =
  "Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 10.0; WOW64; Trident/7.0; .NET4.0C; .NET4.0E)";

const GO_ROUTE = "/polaris-ui/go";
const FALLBACK_LANDING = "/polaris-ui/";

// Production polarisAuthRedirect vocabulary (config/main/nginx.js).
const IS_PROXY_SESSION_PARAM_NAME = "is-proxy-session";

// DDEI Constants.AuthFailReason* values.
const FAIL_NO_COOKIES = "no-cookies";
const FAIL_NO_CMSAUTH = "no-cmsauth-cookie";
const FAIL_CMS_AUTH = "cms-auth-not-valid";
const FAIL_CMS_MODERN = "cms-modern-auth-not-valid";
const FAIL_UNEXPECTED = "unexpected-error";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Read an already-decoded query arg (njs r.args handles the percent/+ decoding).
function _arg(r: NginxHTTPRequest, name: string): string {
  const v = r.args[name];
  return v !== undefined ? (v as string) : "";
}

// Faithful copy of production _redirectToAbsoluteUrl (config/main/nginx.js): njs
// emits an http:// Location for a relative 302 even on https, so build it
// absolute from X-Forwarded-Proto + Host (unless it is already absolute).
function _redirectToAbsoluteUrl(
  r: NginxHTTPRequest,
  redirectUrl: string,
): void {
  r.return(
    302,
    redirectUrl.lastIndexOf("http", 0) === 0
      ? redirectUrl
      : `${r.headersIn["X-Forwarded-Proto"]}://${r.headersIn["Host"]}${redirectUrl}`,
  );
}

function _header(r: NginxHTTPRequest, name: string): string {
  const v = r.headersIn[name];
  return v !== undefined ? (v as string) : "";
}

function _clientIp(r: NginxHTTPRequest): string {
  const xff = _header(r, "X-Forwarded-For");
  return xff ? xff.split(",")[0].trim() : "0.0.0.0";
}

// A v4-ish GUID for the session correlation id. Math.random is fine here — it's
// a correlation/audit id, not a security token.
function _uuid(): string {
  const hex = (n: number): string => {
    let s = "";
    for (let i = 0; i < n; i++) {
      s += Math.floor(Math.random() * 16).toString(16);
    }
    return s;
  };
  const y = (8 + Math.floor(Math.random() * 4)).toString(16);
  return hex(8) + "-" + hex(4) + "-4" + hex(3) + "-" + y + hex(3) + "-" + hex(12);
}

function _isWhitelisted(tok: string): boolean {
  const name = tok.split("=")[0];
  if (/LBsessioncookie$/i.test(name)) {
    return true;
  }
  return WHITELIST_ROOTS.some((root) => tok.indexOf(root) === 0);
}

// Faithful port of DDEI CookieHelpers.GetWhitelistedCookies: split on SPACE,
// keep tokens whose name starts with a whitelisted root, rejoin with SPACE,
// then append WindowID=MASTER if absent. Returns "" if nothing survives.
function _whitelistCookies(cc: string): string {
  const kept = cc
    .split(" ")
    .filter((tok) => tok !== "" && _isWhitelisted(tok))
    .join(" ")
    .replace(/^\s+|\s+$/g, "");
  if (kept === "") {
    return "";
  }
  if (kept.indexOf("WindowID") === -1) {
    const delim = kept.charAt(kept.length - 1) === ";" ? "" : ";";
    return kept + delim + " WindowID=MASTER";
  }
  return kept;
}

// Best-effort CMS version discovery: GET /CMS via the proxy's own routing and
// read the versioned path from the redirect (Location, or the followed URL).
async function _discoverCmsVersion(
  host: string,
  cookieHeader: string,
): Promise<string> {
  try {
    const resp = await ngx.fetch("https://" + host + "/CMS", {
      method: "GET",
      headers: { "User-Agent": MSIE_UA, Host: host, Cookie: cookieHeader },
    });
    const loc = resp.headers.get("Location");
    if (loc) {
      const m = loc.match(/\/(CMS\.[^/]+)/);
      if (m) {
        return m[1];
      }
    }
    // Some njs builds auto-follow the 302; then the final URL carries the version.
    const finalUrl = (resp as unknown as { url?: string }).url;
    if (finalUrl) {
      const m2 = finalUrl.match(/\/(CMS\.[^/]+)/);
      if (m2) {
        return m2[1];
      }
    }
  } catch (e) {
    // fall through to the default
  }
  return DEFAULT_CMS_VERSION;
}

// Mint the CMS modern session token: scrape SESS_MODERN_USER_SESSION_ID from
// {version}/Includes/uainGeneratedScript.aspx. Empty token => mint failed.
async function _mintModernToken(
  host: string,
  cookieHeader: string,
): Promise<{ token: string; versionId: string }> {
  const versionId = await _discoverCmsVersion(host, cookieHeader);
  const url =
    "https://" + host + "/" + versionId + "/Includes/uainGeneratedScript.aspx";
  const resp = await ngx.fetch(url, {
    method: "GET",
    headers: { "User-Agent": MSIE_UA, Host: host, Cookie: cookieHeader },
  });
  const body = await resp.text();
  const m = body.match(/SESS_MODERN_USER_SESSION_ID\s*=\s*'([^']+)'/);
  return { token: m && m[1] ? m[1] : "", versionId };
}

// Verify the modern token is a live Modern session (DDEI VerifyCmsModernToken).
// A 200 body carrying a non-empty errors[] is a failure, not a pass.
async function _verifyModernToken(
  host: string,
  token: string,
  cookieHeader: string,
): Promise<boolean> {
  const resp = await ngx.fetch("https://" + host + "/graphql/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "cms-api-version": "1",
      "cms-api-sessionid": token,
      Cookie: cookieHeader,
      Host: host,
    },
    body: JSON.stringify({
      query: "query getUser($guid: UUID!) { user(guid: $guid) { partyId } }",
      operationName: "getUser",
      variables: { guid: token },
    }),
  });
  if (!resp.ok) {
    return false;
  }
  const text = await resp.text();
  try {
    const data = JSON.parse(text) as {
      data?: { user?: unknown };
      errors?: unknown[];
    };
    if (data.errors && data.errors.length > 0) {
      return false;
    }
    return !!(data.data && data.data.user);
  } catch (e) {
    return false;
  }
}

// The Cms-Auth-Values cookie the Polaris gateway reads. Same camelCase JSON as
// DDEI's CmsAuthValuesDto (preferredLoadBalancerTarget omitted — no retry here).
// ASP.NET Core percent-encodes cookie values; encodeURIComponent mirrors that
// (the JSON's cookies field contains ';', which must not break cookie parsing).
function _buildCmsAuthValuesCookie(
  dto: Record<string, string>,
  secure: boolean,
): string {
  const value = encodeURIComponent(JSON.stringify(dto));
  return (
    "Cms-Auth-Values=" +
    value +
    "; Path=/api/; HttpOnly" +
    (secure ? "; Secure" : "") +
    "; SameSite=Lax"
  );
}

// DDEI BuildFailureRedirectUrl: append auth-fail-reason to the polaris-ui-url
// (fallback landing when there's no ui url, e.g. a CMS launch).
function _failRedirect(
  r: NginxHTTPRequest,
  polarisUiUrl: string,
  reason: string,
): void {
  const base = polarisUiUrl || FALLBACK_LANDING;
  const delim = base.indexOf("?") !== -1 ? "&" : "?";
  r.return(302, base + delim + "auth-fail-reason=" + reason);
}

function _extractCaseId(q: string): string {
  const m = q.match(/"?caseId"?\s*:\s*"?(\d+)/i);
  return m ? m[1] : "";
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// /polaris-non-ddei (IE mode) — byte-faithful copy of the production
// polarisAuthRedirect (config/main/nginx.js), retargeted at /init-non-ddei.
// Clone ALL incoming args, attach the raw Cookie header + Referer +
// is-proxy-session, and redirect on. The cookie travels as `cookie` (NOT cc);
// /init-non-ddei (standing in for /init + DDEI /api/init/) consumes it.
function handlePolarisNonDdei(r: NginxHTTPRequest): void {
  const serializedArgs = qs.stringify(
    r.args as unknown as { [key: string]: string },
  );
  const clonedArgs = qs.parse(serializedArgs) as { [key: string]: string };
  clonedArgs.cookie = r.headersIn["Cookie"] as string;
  clonedArgs.referer = r.headersIn["Referer"] as string;
  clonedArgs[IS_PROXY_SESSION_PARAM_NAME] = "true";
  const querystring = qs.stringify(
    clonedArgs as unknown as { [key: string]: string },
  );
  _redirectToAbsoluteUrl(r, `/init-non-ddei?${querystring}`);
}

// /init-non-ddei (Edge mode) — the DDEI /api/init/ pipeline in njs.
async function handleInitNonDdei(r: NginxHTTPRequest): Promise<void> {
  const polarisUiUrl = _arg(r, "polaris-ui-url");
  try {
    const host = _header(r, "Host");
    const secure = (_header(r, "X-Forwarded-Proto") || "https") === "https";

    // 1. cookies present? (the `cookie` param set by /polaris-non-ddei)
    const cc = _arg(r, "cookie");
    if (!cc) {
      return _failRedirect(r, polarisUiUrl, FAIL_NO_COOKIES);
    }

    // 2. whitelist (+ WindowID=MASTER)
    const cookieHeader = _whitelistCookies(cc);
    if (!cookieHeader) {
      return _failRedirect(r, polarisUiUrl, FAIL_NO_CMSAUTH);
    }

    // 3. mint the modern token
    let mint: { token: string; versionId: string };
    try {
      mint = await _mintModernToken(host, cookieHeader);
    } catch (e) {
      return _failRedirect(r, polarisUiUrl, FAIL_CMS_AUTH);
    }
    if (!mint.token) {
      return _failRedirect(r, polarisUiUrl, FAIL_CMS_AUTH);
    }

    // 4. verify it against CMS Modern
    let verified = false;
    try {
      verified = await _verifyModernToken(host, mint.token, cookieHeader);
    } catch (e) {
      verified = false;
    }
    if (!verified) {
      return _failRedirect(r, polarisUiUrl, FAIL_CMS_MODERN);
    }

    // 5. set the Cms-Auth-Values cookie (the gateway reads this)
    const dto: Record<string, string> = {
      cookies: cookieHeader,
      userIpAddress: _clientIp(r),
      token: mint.token,
      sessionCorrelationId: _uuid(),
      sessionCreatedTime: new Date().toISOString(),
      cmsVersionId: mint.versionId,
    };
    r.headersOut["Set-Cookie"] = [_buildCmsAuthValuesCookie(dto, secure)];

    // 6. redirect by auth-flow mode
    if (polarisUiUrl) {
      // PolarisAuthRedirect: UI passed the post-auth return URL.
      r.return(302, polarisUiUrl);
      return;
    }
    // CmsLaunch: q = {"caseId":n}. Let the UI resolve the URN via /polaris-ui/go.
    const caseId = _extractCaseId(_arg(r, "q"));
    if (caseId) {
      r.return(
        302,
        GO_ROUTE + "?ctx=" + encodeURIComponent('{"caseId":' + caseId + "}"),
      );
      return;
    }
    r.return(302, FALLBACK_LANDING);
  } catch (e) {
    // DDEI wraps the whole handler: any unexpected throw -> auth-fail-reason.
    _failRedirect(r, polarisUiUrl, FAIL_UNEXPECTED);
  }
}

export default { handlePolarisNonDdei, handleInitNonDdei };
