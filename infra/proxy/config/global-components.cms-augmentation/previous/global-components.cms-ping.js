// CMS Login Ping — njs module
//
// Clones of /polaris and /init as /polaris-2 and /init-2, without IE mode
// enforcement. The login ping img fires from IE mode context, so the
// redirect chain must not block on $ieaction checks.
//
// /polaris-2: captures cookies from headers, redirects to /init-2
// /init-2: validates redirect URL, appends cc param, redirects onward

import qs from "querystring";
const IS_PROXY_SESSION_PARAM_NAME = "is-proxy-session";

function _redirectToAbsoluteUrl(r, redirectUrl) {
  r.return(
    302,
    redirectUrl.lastIndexOf("http", 0) === 0
      ? redirectUrl
      : `${r.headersIn["X-Forwarded-Proto"]}://${r.headersIn["Host"]}${redirectUrl}`,
  );
}

function _argsShim(args) {
  if (args["r"]) {
    return args;
  }
  const serializedArgs = qs.stringify(args);
  const clonedArgsToMutate = qs.parse(serializedArgs);
  delete clonedArgsToMutate["cookie"];
  delete clonedArgsToMutate[IS_PROXY_SESSION_PARAM_NAME];
  const queryStringWithoutCookie = qs.stringify(clonedArgsToMutate);

  const clonedArgs = qs.parse(serializedArgs);
  clonedArgs["r"] = `/auth-refresh-inbound?${queryStringWithoutCookie}`;
  return clonedArgs;
}

function polarisAuthRedirect2(r) {
  const serializedArgs = qs.stringify(r.args);
  const clonedArgs = qs.parse(serializedArgs);
  clonedArgs.cookie = r.headersIn.Cookie;
  clonedArgs.referer = r.headersIn.Referer;
  clonedArgs[IS_PROXY_SESSION_PARAM_NAME] = "true";

  const querystring = qs.stringify(clonedArgs);
  _redirectToAbsoluteUrl(r, `/init-2?${querystring}`);
}

function appAuthRedirect2(r) {
  const args = _argsShim(r.args);
  const redirectUrl = args["r"];

  _redirectToAbsoluteUrl(
    r,
    `${redirectUrl}${
      redirectUrl.includes("?") ? "&" : "?"
    }cc=${encodeURIComponent(args["cookie"] ?? "")}`,
  );
}

export default { polarisAuthRedirect2, appAuthRedirect2 };
