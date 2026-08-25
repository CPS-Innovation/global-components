function dropContentLengthForNegotiate(r: NginxHTTPRequest): void {
  // The body filter rewrites the negotiate JSON, which changes its byte
  // length. nginx computes the response Content-Length before the body
  // filter runs, so the original (upstream) length leaks through and the
  // browser sees ERR_HTTP2_PROTOCOL_ERROR when actual bytes < declared.
  // Remove Content-Length here in the header-output phase; HTTP/2 signals
  // end-of-body via END_STREAM and doesn't require it.
  if (r.uri.endsWith("/negotiate")) {
    delete r.headersOut["Content-Length"];
  }
}

function filterNegotiateBody(
  r: NginxHTTPRequest,
  data: string,
  flags: NginxHTTPSendBufferOptions,
): void {
  // Only intercept SignalR negotiate responses. All other responses (including
  // WebSocket 101 upgrades and SSE/long-poll bodies) pass through unchanged.
  if (!r.uri.endsWith("/negotiate")) {
    r.sendBuffer(data, flags);
    return;
  }

  // Per-chunk regex replace, matching filterSwaggerBody's pattern. This avoids
  // the buffer-then-emit-once approach which (under HTTP/2) can leave the
  // client's content-length expectation misaligned with the rewritten body
  // and trigger ERR_HTTP2_PROTOCOL_ERROR. Negotiate responses are small
  // enough that the URL won't span a chunk boundary in practice.
  //
  // Rewrite to an absolute same-origin URL (not path-relative) because the
  // SignalR client constructs `new URL(response.url)` without supplying a
  // base — a relative URL there throws "Invalid URL".
  const scheme =
    (r.headersIn["X-Forwarded-Proto"] as string | undefined) ||
    (r.variables.scheme as string) ||
    "https";
  const host =
    (r.headersIn["Host"] as string | undefined) ||
    (r.variables.host as string);
  const replacement = `${scheme}://${host}/global-components/case-locking/api/sr`;

  const result = data.replace(
    /https?:\/\/[a-zA-Z0-9.-]+\.service\.signalr\.net/g,
    replacement,
  );
  r.sendBuffer(result, flags);
}

// ---------------------------------------------------------------------------
// presenceBearer — cookie -> Authorization header, for js_set
//
// The browser cannot set an Authorization header on a WebSocket handshake, and
// the CPS IE-mode estate rules out the usual workarounds: SignalR's negotiate
// step is an XHR, and cross-domain XHR is gated by Windows zone setting 1406
// ("Access data sources across domains" = Prompt, machine-locked), which raises
// a security dialog. Confirmed at document mode 11, so it bites Modern/DCF as
// well as Classic.
//
// So the proxy does it instead: the auth callback stamps the token into an
// HttpOnly cookie scoped to this path, and this function lifts it into the
// header on the way upstream. The token never reaches page JS, never appears in
// a URL, and that client ships no credential at all.
//
// PRECEDENCE: an Authorization header the CLIENT sent always wins and is passed
// through untouched. This hub has two kinds of caller:
//   - global-components (OutSystems/Polaris pages, modern browsers) authenticates
//     conventionally via MSAL and sets the header itself;
//   - the CMS estate (Classic/Modern/DCF, IE mode) cannot, and relies on the cookie.
// proxy_set_header replaces the header unconditionally, so without this check the
// first group would have its credential STRIPPED. Their pages are also on a
// different registrable domain (outsystemsenterprise.com), so the cookie is
// cross-site there and SameSite=Lax withholds it — they would end up with no
// credential at all rather than falling back to ours.
//
// Returns "" when there is neither — nginx omits a header set to an empty value,
// so the API sees an unauthenticated request and 401s, rather than us inventing a
// fallback that would mask a broken handover.
// ---------------------------------------------------------------------------

// Written by handleInitV2Callback in global-components.cms-auth-v2.ts. The two
// njs bundles are separate, so this name is kept in sync by hand — grep for it
// before renaming either side.
const PRESENCE_TOKEN_COOKIE = "cms-auth-presence-token";

function presenceBearer(r: NginxHTTPRequest): string {
  // Client-supplied credential wins — pass it straight through.
  const supplied = r.headersIn["Authorization"] as string | undefined;
  if (supplied) {
    return supplied;
  }

  const raw = (r.headersIn["Cookie"] as string | undefined) || "";
  if (!raw) {
    return "";
  }
  const parts = raw.split(";");
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (part.indexOf(PRESENCE_TOKEN_COOKIE + "=") !== 0) {
      continue;
    }
    const value = part.substring(PRESENCE_TOKEN_COOKIE.length + 1);
    if (!value) {
      return "";
    }
    return "Bearer " + decodeURIComponent(value);
  }
  return "";
}

// ---------------------------------------------------------------------------
// watchdogAppName — query arg -> X-Watchdog-App-Name, for js_set
//
// The presence API wants the calling application in a header. Over SignalR the
// application name is an argument to the hub method — Connect(sectionKey,
// applicationName) — which travels inside WebSocket frames the proxy cannot see.
// So the client ALSO puts it in the connect URL's query string, purely so this
// can lift it into a header. Both are sent: the hub argument is the real contract,
// the header is the tactical duplicate the API asked for.
//
// The value is attacker-controllable in principle (it is a query arg), and it is
// going into a response-bound header, so it is matched against the known set
// rather than sanitised. Anything unrecognised yields "" and nginx omits the
// header — an unknown app is reported as no app, never as an injected one.
// Vocabulary per the presence API README; extend here when it does.
// ---------------------------------------------------------------------------

const WATCHDOG_APP_NAMES = [
  "Work Management App",
  "Case Review App",
  "Casework App",
  "CMS Classic",
  "CMS Modern", // covers DCF too — one app in users' minds
];

function watchdogAppName(r: NginxHTTPRequest): string {
  const args = (r.args || {}) as Record<string, string | undefined>;
  const raw = args["appName"] || args["appname"] || "";
  if (!raw) {
    return "";
  }
  let value: string;
  try {
    value = decodeURIComponent(raw);
  } catch (e) {
    return "";
  }
  return WATCHDOG_APP_NAMES.indexOf(value) === -1 ? "" : value;
}

export default {
  dropContentLengthForNegotiate,
  filterNegotiateBody,
  presenceBearer,
  watchdogAppName,
};
