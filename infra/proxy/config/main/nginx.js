import qs from "querystring"

const IS_PROXY_SESSION_PARAM_NAME = "is-proxy-session"
const SESSION_HINT_COOKIE_NAME = "Cms-Session-Hint"
const SESSION_HINT_COOKIE_LIFESPAN_MS = 30 * 24 * 60 * 60 * 1000

function _argsShim(args) {
  if (args["r"]) {
    return args
  }
  // If we have no r param then we assume we are processing a legacy handover from the /polaris endpoint.
  // The CMS P button has no concept of the r param and assumes this endpoint forwards on to CWA domain.
  // So lets coerce the legacy format to the standard format by creating an r param if one does not exist.
  // Note 1: the expected incoming params in the legacy case are q and referer.
  // Note 2: we use a relative URL rather than a fully-qualified URL as the proxy runs under multiple names
  //  e.g. https://polaris-cmsproxy.azurewebsites.net/ and https://polaris.cps.gov.uk/

  const serializedArgs = qs.stringify(args)
  const clonedArgsToMutate = qs.parse(serializedArgs)
  delete clonedArgsToMutate["cookie"]
  delete clonedArgsToMutate[IS_PROXY_SESSION_PARAM_NAME]
  // Do not serialize cookie into our manufactured r param because cookie will be attached as the cc param later on.
  // Similarly do not include our "is-proxy-session" query parameter as that is artificially added by our
  // simulated proxy endpoint (if the user is using proxied CMS)
  const queryStringWithoutCookie = qs.stringify(clonedArgsToMutate)

  const clonedArgs = qs.parse(serializedArgs)
  clonedArgs["r"] = `/auth-refresh-inbound?${queryStringWithoutCookie}`
  return clonedArgs
}

function _redirectToAbsoluteUrl(r, redirectUrl) {
  // It appears that when we redirect with an absolute url, njs will create the location header starting with http://
  //  even if we are handling an https request. If we are running on https://foo then
  //  r.return(302, "https://foo/bar") will redirect to https://foo/bar
  //  r.return(302, "/bar") will redirect to http://foo/bar
  // So lets convert relative redirect to absolute.
  // Note: this almost is not a problem.  When the client comes back with the http://... request nginx will do another
  //  redirect to https as part of the "upgrade http to https" thing.  However the CWA cypress e2e test framework fails
  //  because tests running on https are redirected to an http address
  r.return(
    302,
    redirectUrl.lastIndexOf("http", 0) === 0
      ? redirectUrl
      : `${r.headersIn["X-Forwarded-Proto"]}://${r.headersIn["Host"]}${redirectUrl}`
  )
}

function _getCookieValue(r, cookieName) {
  const cookies = (r.headersIn["Cookie"]) || "";
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]*)`));
  return match ? match[1] : "";
}

function _maybeDecodeURIComponent(value) {
  // Check if value appears not to be URL-encoded
  // (does not contain %XX patterns)
  if (!/%[0-9A-Fa-f]{2}/.test(value)) {
    return value;
  }
  try {
    return decodeURIComponent(value);
  } catch (e) {
    return value;
  }
}

function setSessionHintCookie(r) {
  let cookieValue
  try {
    const isProxySession = r.args[IS_PROXY_SESSION_PARAM_NAME] === "true"
    // Match lowercase subdomain(s) followed by .cps.gov.uk (terminated by _POOL)
    // This avoids matching uppercase prefixes like CPSACP-LTM-CM-WAN-CIN3-
    const cmsDomains =
      r.args["cookie"].match(
        /[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)*\.cps\.gov\.uk(?=_POOL)/g
      ) || []

    const handoverEndpoint = isProxySession
      ? `https://${r.headersIn["Host"]}/polaris`
      : cmsDomains.length
      ? // If there is more than one domain string found let's take the first
        // one. Analytics in global nav will tell us if there are ever multiple
        // domains found.
        `https://${cmsDomains[0]}/polaris`
      : null

    cookieValue = {
      cmsDomains,
      isProxySession,
      handoverEndpoint,
    }
  } catch (error) {
    cookieValue = {
      error,
    }
  } finally {
    const expires = new Date(Date.now() + SESSION_HINT_COOKIE_LIFESPAN_MS)
    r.headersOut[
      "Set-Cookie"
    ] = `${SESSION_HINT_COOKIE_NAME}=${encodeURIComponent(
      JSON.stringify(cookieValue)
    )}; Path=/; Expires=${expires.toUTCString()}; Secure; SameSite=None`
  }
}

function _cookieName(segment) {
  const eq = segment.indexOf("=")
  return (eq === -1 ? segment : segment.slice(0, eq)).trim()
}

function _isBigIpCookie(name) {
  return /^BIGipServer/i.test(name)
}

// Map the __CMSENV cookie value to its CINx token. The env-switch routes in nginx-full.conf
// set __CMSENV=default for cin3 (not "cin3"), and __CMSENV=cinX for the others. We also accept
// a literal "cin3" token defensively.
function _cmsEnvToCin(value) {
  const match = value.match(/cin\d+/i)
  if (match) {
    return match[0].toLowerCase()
  }
  if (value.trim().toLowerCase() === "default") {
    return "cin3"
  }
  return null
}

function _makeShimCookie(cin) {
  // cin is lowercase e.g. "cin3"
  return `BIGipServer-shim-${cin.toUpperCase()}-${cin.toLowerCase()}.cps.gov.uk=1`
}

function _withCookie(args, cookieString) {
  const clonedArgs = qs.parse(qs.stringify(args))
  clonedArgs["cookie"] = cookieString
  return clonedArgs
}

function _shimBigIpCookies(args) {
  // HACK: The load balancer used to emit BIGipServer* cookies which the downstream
  //  /auth-refresh-inbound endpoint (DDEI /api/init/) keys off to route a user's session.
  //  Those have stopped appearing and are now replaced by cookies named like
  //  C-CIN3-LBsessioncookie=...  We only care about the CINx token (e.g. CIN3).
  //
  //  Discrimination rules:
  //   1. If a __CMSENV cookie is present it is authoritative: ensure a BIGipServer* cookie
  //      exists for its CINx (synthesising a shim if absent) and drop any BIGipServer* cookies
  //      that reference a different CINx.
  //   2. Otherwise, if exactly one CINx is referenced by C- cookies and there is no
  //      BIGipServer* cookie for it, synthesise a shim.
  //   3. Otherwise pass through untouched.
  const cookieString = args["cookie"]
  if (!cookieString) {
    return args
  }

  const segments = cookieString.split(/;\s*/).filter((s) => s.length > 0)

  // Rule 1: __CMSENV is authoritative.
  const cmsEnvSegment = segments.find((s) => _cookieName(s) === "__CMSENV")
  if (cmsEnvSegment) {
    const cmsEnvValue = cmsEnvSegment.slice(cmsEnvSegment.indexOf("=") + 1).trim()
    const cin = _cmsEnvToCin(cmsEnvValue)
    if (!cin) {
      // Unrecognised __CMSENV value - we cannot determine the target environment, pass through.
      return args
    }

    const kept = []
    let hasBigIpForCin = false
    segments.forEach((segment) => {
      const name = _cookieName(segment)
      if (_isBigIpCookie(name)) {
        // Keep only BIGipServer* cookies that reference this CINx; drop the rest.
        if (name.toLowerCase().includes(cin)) {
          kept.push(segment)
          hasBigIpForCin = true
        }
      } else {
        kept.push(segment)
      }
    })

    if (!hasBigIpForCin) {
      kept.push(_makeShimCookie(cin))
    }

    return _withCookie(args, kept.join("; "))
  }

  // Rule 2: no __CMSENV - only act when a single CINx is referenced by C- cookies.
  const cins = {}
  segments.forEach((segment) => {
    const match = _cookieName(segment).match(/^C-(CIN\d+)-/i)
    if (match) {
      cins[match[1].toLowerCase()] = true
    }
  })
  const distinctCins = Object.keys(cins)

  if (distinctCins.length === 1) {
    const cin = distinctCins[0]
    const hasBigIpForCin = segments.some(
      (segment) =>
        _isBigIpCookie(_cookieName(segment)) &&
        _cookieName(segment).toLowerCase().includes(cin)
    )
    if (!hasBigIpForCin) {
      return _withCookie(args, `${cookieString}; ${_makeShimCookie(cin)}`)
    }
  }

  // Rule 3: pass through untouched.
  return args
}

function appAuthRedirect(r) {
  setSessionHintCookie(r)

  let args = _argsShim(r.args)
  args = _shimBigIpCookies(args)

  const whitelistedUrls = process.env.AUTH_HANDOVER_WHITELIST ?? ""
  const redirectUrl = args["r"]
  const isWhitelisted = whitelistedUrls
    .split(",")
    .some((url) => redirectUrl.startsWith(url))

  if (isWhitelisted) {
    _redirectToAbsoluteUrl(
      r,
      `${redirectUrl}${
        redirectUrl.includes("?") ? "&" : "?"
      }cc=${encodeURIComponent(args["cookie"] ?? "")}`
    )
  } else {
    r.return(
      403,
      `HTTP Status 403: this deployment of the /init endpoint will only accept requests with r query parameters that start with one of the following strings: 
${whitelistedUrls}

This request has an r query parameter of ${args["r"]}`
    )
  }
}

// This is a simulation of the https://cms.cps.gov.uk/polaris endpoint.
//  Primarily useful when users are using CMS delivered through this proxy. In this use case, users are on this proxy
//  domain when using CMS.  We inject a P button and simulated the prod /polaris handover endpoint using this function.
function polarisAuthRedirect(r) {
  const serializedArgs = qs.stringify(r.args)
  const clonedArgs = qs.parse(serializedArgs)
  clonedArgs.cookie = r.headersIn.Cookie
  clonedArgs.referer = r.headersIn.Referer
  clonedArgs[IS_PROXY_SESSION_PARAM_NAME] = "true"

  const querystring = qs.stringify(clonedArgs)
  _redirectToAbsoluteUrl(r, `/init?${querystring}`)
}

function taskListAuthRedirect(r) {
  const args = _argsShim(r.args)
  const taskListHostAddress = r.variables["taskListHostAddress"] ?? ""
  const cookie = encodeURIComponent(args["cc"] ?? r.headersIn.Cookie ?? "")
  _redirectToAbsoluteUrl(
    r,
    `${taskListHostAddress}/WorkManagementApp/Redirect?Cookie=${cookie}`
  )
}

function handleAuthRefreshOutbound(r) {
  const tryGetHandoverEndpointFromCookie = () => {
    try {
      const rawCookie = _getCookieValue(r, "Cms-Session-Hint");
      if (rawCookie) {
        const decoded = _maybeDecodeURIComponent(rawCookie);
        const parsed = JSON.parse(decoded);
        if (parsed.handoverEndpoint) {
          return parsed.handoverEndpoint;
        }
      }
    } catch (e) {
      // JSON parse failure: fall through to default
    }
    return null;
  };

  const tryGetDefaultHandoverEndpoint = () => {
    const defaultDomain = process.env["DEFAULT_UPSTREAM_CMS_DOMAIN_NAME"] || "";
    return defaultDomain ? `https://${defaultDomain}/polaris` : null;
  };

  const redirectTarget =
    tryGetHandoverEndpointFromCookie() || tryGetDefaultHandoverEndpoint();

  if (!redirectTarget) {
    r.return(
      502,
      "auth-refresh-outbound: no handoverEndpoint in cookie and no DEFAULT_UPSTREAM_CMS_DOMAIN_NAME configured",
    );
    return;
  }

  const args = r.variables.args || "";
  const redirectUrl = args ? `${redirectTarget}?${args}` : redirectTarget;

  r.headersOut["X-InternetExplorerMode"] = "1";
  r.return(302, redirectUrl);
}

export default { polarisAuthRedirect, taskListAuthRedirect, appAuthRedirect, handleAuthRefreshOutbound }
