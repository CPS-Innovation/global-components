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

function _argsShim(args: NginxHTTPArgs): NginxHTTPArgs {
  if (args["r"]) {
    return args;
  }
  const serializedArgs = qs.stringify(args as Record<string, string>);
  const clonedArgsToMutate = qs.parse(serializedArgs);
  delete clonedArgsToMutate["cookie"];
  delete clonedArgsToMutate[IS_PROXY_SESSION_PARAM_NAME];
  const queryStringWithoutCookie = qs.stringify(clonedArgsToMutate);

  const clonedArgs = qs.parse(serializedArgs);
  clonedArgs["r"] = `/auth-refresh-inbound?${queryStringWithoutCookie}`;
  return clonedArgs as unknown as NginxHTTPArgs;
}

function polarisAuthRedirect2(r: NginxHTTPRequest): void {
  const serializedArgs = qs.stringify(r.args as Record<string, string>);
  const clonedArgs = qs.parse(serializedArgs);
  clonedArgs.cookie = r.headersIn.Cookie as string;
  clonedArgs.referer = r.headersIn.Referer as string;
  clonedArgs[IS_PROXY_SESSION_PARAM_NAME] = "true";

  const querystring = qs.stringify(clonedArgs);
  _redirectToAbsoluteUrl(r, `/init-2?${querystring}`);
}

function appAuthRedirect2(r: NginxHTTPRequest): void {
  const args = _argsShim(r.args);

  const whitelistedUrls = process.env["AUTH_HANDOVER_WHITELIST"] ?? "";
  const redirectUrl = args["r"] as string;
  const isWhitelisted = whitelistedUrls
    .split(",")
    .some((url: string) => redirectUrl.startsWith(url));

  if (isWhitelisted) {
    _redirectToAbsoluteUrl(
      r,
      `${redirectUrl}${
        redirectUrl.includes("?") ? "&" : "?"
      }cc=${encodeURIComponent((args["cookie"] as string) ?? "")}`,
    );
  } else {
    r.return(
      403,
      `HTTP Status 403: this deployment of the /init-2 endpoint will only accept requests with r query parameters that start with one of the following strings:
${whitelistedUrls}

This request has an r query parameter of ${args["r"]}`,
    );
  }
}

export default { polarisAuthRedirect2, appAuthRedirect2 };
