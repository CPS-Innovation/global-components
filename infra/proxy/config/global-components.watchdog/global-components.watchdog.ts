// ---------------------------------------------------------------------------
// Watchdog — everything the proxy does in front of the Watchdog (presence) API.
//
// Two transports into the ONE API, and they must agree on which Watchdog that is,
// which is why they share a module, a setting and a cookie name:
//
//   /global-components/case-locking/api/...   the SignalR hub (and the Azure
//       SignalR Service it hands clients to, under .../api/sr/<instance>/...).
//       Used by global-components in the current apps. URL kept from when this
//       module was called case-locking: clients and config name it.
//   /global-components/presence-jsonp         the JSONP adapter, for the legacy
//       CMS clients (Classic, Modern, DCF), which run in IE mode and can neither
//       XHR cross-domain nor set an Authorization header.
//
// Until 2026-11-10 the JSONP adapter lived in cms-auth-presence, beside the auth
// flow that wrote its cookie, with its own copies of the setting, the cookie name
// and the app-name list. The flow is gone (Polaris's /init writes the cookie now),
// and the copies are one copy.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The setting — process.env, then a deploy-time value, then ""
//
// _setting(NAME, "@@<NAME>@@") returns, in order:
//   1. process.env[NAME] — an App Service app setting. This is where the value is
//      headed: once Terraform sets it, it wins here with no code change.
//   2. the @@<NAME>@@ token, if deploy.local.sh replaced it in the COMPILED .js with
//      the value from the (gitignored) env file — the interim. The token must appear
//      LITERALLY in the source (the deploy replaces text).
//   3. "" — never a hardcoded default. The routes that need it answer "not
//      configured"; nginx itself always starts.
//
// njs snapshots the environment before nginx strips it from the workers, so
// process.env works at module load with no `env` directive (verified in
// nginx:1.27.1-alpine, 2026-11-09).
//
// WHY njs AND NOT A LITERAL OR ${VAR} IN THE CONF. A literal hostname in
// proxy_pass is resolved when nginx STARTS, and one that does not resolve stops
// nginx starting — the whole proxy down for one route's upstream. An unset ${VAR}
// is left verbatim by envsubst and fails the same way. From a variable, the host
// is resolved per request through the location's resolver.
//
// Declared first: njs TDZ-checks forward references to module-level const.
// ---------------------------------------------------------------------------

const _fromDropzone = (token: string): string =>
  token.indexOf("@@") === -1 ? token : "";

const _setting = (name: string, token: string): string =>
  (process.env[name] as string) || _fromDropzone(token);

// The Watchdog API host, bare (no scheme, no path) — it is also the Host header
// and the TLS SNI name. e.g. "watchdog-api-dev.gslb-notprod.int.cps.gov.uk".
// The ONLY setting this module has (and the only one any of our modules needs
// beyond what Polaris's Terraform already provides).
const WATCHDOG_HOST = _setting(
  "GLOBAL_COMPONENTS_WATCHDOG_HOST",
  "@@GLOBAL_COMPONENTS_WATCHDOG_HOST@@",
);

const _PRESENCE_API_BASE = WATCHDOG_HOST ? "https://" + WATCHDOG_HOST + "/api" : "";

// ---------------------------------------------------------------------------
// Shared by both transports
// ---------------------------------------------------------------------------

// The HttpOnly cookie holding the reader's presence access token. Written by
// Polaris's /init (its Entra leg), not by anything in this repo: the name is kept
// in step with theirs by hand — grep both repos before renaming it.
const PRESENCE_TOKEN_COOKIE = "cms-auth-presence-token";

// The calling application, reported to the presence API as X-Watchdog-App-Name.
// Matched against the known set rather than sanitised: the value comes from a
// query arg and goes into an outbound header, so an unrecognised app is reported
// as no app (SignalR) or as the default (JSONP), never as whatever was in the URL.
// Vocabulary per the presence API README; extend here when it does.
const WATCHDOG_APP_NAMES = [
  "Work Management App",
  "Case Review App",
  "Casework App",
  "CMS Classic",
  "CMS Modern", // covers DCF too — one app in users' minds
];

// JSONP only: an absent or unrecognised ?appName= means Classic, the adapter's
// first caller — so a client that predates ?appName= still reports correctly.
const JSONP_APP_DEFAULT = "CMS Classic";

// Cms-Session-Hint: which CMS (CIN3, CIN5, ...) this session is in. Written by
// Polaris's /init; read here for whoami and the create log line.
const _SESSION_HINT_COOKIE_NAME = "Cms-Session-Hint";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _base64UrlDecode(str: string): string {
  // base64url -> utf-8. Buffer tolerates missing padding and decodes multibyte
  // text correctly (atob would only give Latin1 bytes).
  return Buffer.from(
    str.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  ).toString("utf8");
}

function _getCookie(r: NginxHTTPRequest, name: string): string | null {
  const cookies = r.headersIn["Cookie"];
  if (!cookies) return null;
  const match = (cookies as string).match(
    new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"),
  );
  return match ? match[1] : null;
}

function _getQueryParam(r: NginxHTTPRequest, name: string): string | null {
  const v = r.variables["arg_" + name];
  return v !== undefined ? (v as string) : null;
}

function _decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(_base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
}

/**
 * Whole seconds until a token's `exp`, from already-decoded claims.
 *
 * TOTAL BY DESIGN: no claims, no `exp`, a non-numeric `exp` and an `exp` already
 * past all give 0. The caller's question is "how long have I got", and every one
 * of those answers it with "none" — there is nothing a client would do
 * differently for a token that is unreadable versus one that is stale, because
 * the response to both is to replay the auth flow. Distinguishing them would add
 * a branch nobody acts on.
 *
 * Negative is clamped rather than reported: an expired token is as useless as a
 * missing one, and a negative number in a diagnostic reads as a bug in the
 * clock rather than as the fact it is.
 *
 * @param claims the decoded JWT payload, or null
 * @returns seconds remaining, never negative
 */
function _tokenExpiresIn(claims: Record<string, unknown> | null): number {
  if (!claims || typeof claims.exp !== "number") {
    return 0;
  }
  const left = Math.floor(claims.exp - Date.now() / 1000);
  return left > 0 ? left : 0;
}

/**
 * The reader's Entra group IDs, from already-decoded claims.
 *
 * WHAT THIS CAN CONTAIN is decided by the app registration, not here. Ours emits
 * groups as ApplicationGroup-filtered membership: only groups ASSIGNED to the app
 * that the reader is a MEMBER of (ownership does not count). So the list is short
 * and bounded by what we chose to assign — today that is FCT Global Navigation —
 * not the reader's whole directory footprint.
 *
 * TOTAL, AND EMPTY MEANS "NOT IN ANY", which is the safe reading for a gate. No
 * token, no `groups` claim (a Graph-audience token from the consent self-heal
 * carries none), a non-array, and junk entries all collapse to fewer groups,
 * never more. Each entry must be a GUID: the list is reflected into an executable
 * JSONP body, and an ID is the only shape a group claim legitimately takes.
 */
function _groupsOf(claims: Record<string, unknown> | null): string[] {
  const groups = claims ? claims.groups : null;
  if (!Array.isArray(groups)) {
    return [];
  }
  return groups
    .filter(function (g) {
      return (
        typeof g === "string" &&
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
          g,
        )
      );
    })
    .map(function (g) {
      return String(g).toLowerCase();
    });
}

/**
 * Whole seconds since a token was issued, from its `iat` claim. -1 when there is
 * no token or no usable claim.
 *
 * WHY THIS AND NOT JUST THE EXPIRY. Remaining life cannot tell you whether a
 * token is NEW. AAD issues access tokens with a lifetime that varies — we have
 * measured 83 minutes and 62 minutes from the same flow an hour apart — so a
 * freshly minted token can report LESS time left than the one it replaced. Two
 * readings of the expiry therefore do not answer "did the replay work": a drop is
 * consistent both with a failed replay and with a successful one that happened to
 * draw a shorter lifetime. Age is monotonic in the thing we care about. A new
 * token is always younger, whatever its lifetime, so a small number here means
 * "just minted" and nothing else.
 *
 * -1, NOT 0, FOR UNKNOWN — the opposite convention from _tokenExpiresIn, on
 * purpose. There, 0 and absent say the same operational thing ("no usable
 * token"). Here 0 is the BEST possible answer, a token issued this second, so an
 * absence cannot borrow it without reading as the success it is not.
 *
 * A future `iat` (clock skew between us and AAD) clamps to 0 rather than going
 * negative: brand new is the honest reading, and a negative age in a diagnostic
 * reads as a bug in this function.
 *
 * @param claims the decoded JWT payload, or null
 * @returns seconds since issue, or -1 when it cannot be told
 */
function _tokenAge(claims: Record<string, unknown> | null): number {
  if (!claims || typeof claims.iat !== "number") {
    return -1;
  }
  const age = Math.floor(Date.now() / 1000 - claims.iat);
  return age > 0 ? age : 0;
}

// The environment as the clients spell it: the first label of the first CMS
// domain, uppercased (cin3.cps.gov.uk -> CIN3). "" when we don't know, which is
// the honest answer and NOT a default — a wrong environment silently splits a
// watchdog, where an absent one is visible.
//
// "" MEANS UNKNOWN, AND ONLY UNKNOWN. There are four ways to get there and they
// used to be indistinguishable, which made "cmsEnv is empty" unactionable: a
// client cannot tell "nobody wrote the hint" from "the hint is corrupt" from
// "the handover found no CMS domain", and those need different people to fix
// them. `why` names which, so the caller gets one bit (empty = do not register)
// and the log gets the diagnosis.
//
// THERE IS DELIBERATELY NO "KNOWN TO BE BLANK". A suffix-less environment —
// production, if that is what we choose — is a CLIENT-SIDE mapping from a known
// label to no suffix, never an empty cmsEnv. This function keeps the promise
// the writer (Polaris's /init) makes about the F5 cookie: THE TOKEN IS OPAQUE. It reads
// CIN3/CIN5 in pre-prod, nothing promises that shape in production, and a reader
// that started inferring "this label means no suffix" would be interpreting it.
type _CmsEnvRead = {
  env: string;
  /** "hint" when env is set; otherwise which of the four empties this is. */
  why: "hint" | "no-hint" | "bad-hint" | "hint-error" | "no-domain";
};

function _cmsEnvRead(r: NginxHTTPRequest): _CmsEnvRead {
  const raw = _getCookie(r, _SESSION_HINT_COOKIE_NAME);
  if (!raw) {
    // Nobody wrote it: /init has not run for this session yet, or this is a
    // jar the hint never reached.
    return { env: "", why: "no-hint" };
  }
  let parsed: any;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch (e) {
    // Present but unreadable — a truncated or re-encoded cookie. The writer
    // always URL-encodes JSON, so this should not happen and is worth seeing
    // rather than flattening into "no hint".
    return { env: "", why: "bad-hint" };
  }
  if (parsed && parsed.error) {
    // The WRITER could not work it out and said so in the payload (see the
    // `catch` in Polaris's setSessionHintCookie, which writes { error }).
    return { env: "", why: "hint-error" };
  }
  const domains = parsed && parsed.cmsDomains;
  const domain = domains && domains.length ? String(domains[0]) : "";
  if (!domain) {
    // Hint written, no CMS domain in it: the handover saw no load-balancing
    // cookie, so there was nothing to derive. Not our bug and not the client's.
    return { env: "", why: "no-domain" };
  }
  const label = domain.split(".")[0].toUpperCase();
  return label ? { env: label, why: "hint" } : { env: "", why: "no-domain" };
}

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
  //
  // THE INSTANCE TRAVELS IN THE PATH: https://<instance>.service.signalr.net/x
  // becomes <us>/global-components/case-locking/api/sr/<instance>/x, and the sr
  // location proxies back to <instance>.service.signalr.net. So the SignalR host
  // is whatever the Watchdog's negotiate names — there is no setting for it to
  // drift out of step with. (Until 2026-11-10 there was: SIGNALR_HOST, a second
  // value that had to name by hand the instance the Watchdog was configured with.)
  // Lower-cased because the sr location only accepts [a-z0-9-]; DNS does not care.
  const scheme =
    (r.headersIn["X-Forwarded-Proto"] as string | undefined) ||
    (r.variables.scheme as string) ||
    "https";
  const host =
    (r.headersIn["Host"] as string | undefined) ||
    (r.variables.host as string);
  const replacement = `${scheme}://${host}/global-components/case-locking/api/sr`;

  // buffer_type=string is honoured for UPSTREAM bodies only: a body nginx produces
  // itself (the conf's `return 503 "…"` when the Watchdog host is not configured)
  // arrives as a Buffer, and calling .replace on it threw — the client got a
  // truncated response instead of the 503. Coerce; String(Buffer) is its UTF-8 text.
  const text = typeof data === "string" ? data : String(data == null ? "" : data);
  const result = text.replace(
    /https?:\/\/([a-zA-Z0-9-]+)\.service\.signalr\.net/g,
    (_m: string, instance: string) => replacement + "/" + instance.toLowerCase(),
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
// So the proxy does it instead: Polaris's /init stamps the token into an
// HttpOnly cookie (PRESENCE_TOKEN_COOKIE), and this function lifts it into the
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

// ---------------------------------------------------------------------------
// watchdogHost — js_set into the conf's proxy_pass. "" = the conf's 503.
// ---------------------------------------------------------------------------

function watchdogHost(_r: NginxHTTPRequest): string {
  return WATCHDOG_HOST;
}

// ---------------------------------------------------------------------------
// Presence JSONP adapter
//
// The injected CMS client reaches the presence API cross-origin, which the IE
// Internet zone forbids for XHR — but NOT for <script src>. So the client fetches
// via JSONP (script tags) and this handler shims each GET into the backend's real
// REST call: it maps ?op= to POST/PUT/GET/DELETE, lifts the presence token out of the
// HttpOnly cookie into an Authorization header (so the token is never in the URL),
// and wraps the JSON response as callback(...). The API keeps its pure REST form.
//
// Upstream hop is the plain house pattern (location-level resolver + ngx.fetch) —
// see the location in the .conf.
// ---------------------------------------------------------------------------

type _PresenceOp = {
  method: string;
  path: (a: Record<string, string>) => string;
  body: (a: Record<string, string>) => string | null;
};

// Browser can only GET; ?op= selects the backend's real verb/path/body.
const _PRESENCE_OPS: Record<string, _PresenceOp> = {
  create: {
    method: "POST",
    path: () => "/sessions",
    body: (a) => JSON.stringify({ sectionId: a.sectionId || "" }),
  },
  heartbeat: {
    method: "PUT",
    path: (a) => "/sessions/" + a.sid + "/heartbeat",
    body: () => null,
  },
  poll: {
    method: "GET",
    path: (a) => "/sessions/" + a.sid,
    body: () => null,
  },
  remove: {
    method: "DELETE",
    path: (a) => "/sessions/" + a.sid,
    body: () => null,
  },
};

async function handlePresenceJsonp(r: NginxHTTPRequest): Promise<void> {
  const cb = _getQueryParam(r, "callback") || "";
  // The one non-negotiable JSONP guard: the callback name is reflected verbatim
  // into an executable script response, so it MUST be a bare identifier or it's XSS.
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(cb)) {
    r.headersOut["Content-Type"] = "text/plain; charset=utf-8";
    r.return(400, "invalid callback");
    return;
  }

  r.headersOut["Content-Type"] = "text/javascript; charset=utf-8";
  r.headersOut["Cache-Control"] = "no-store";

  const args: Record<string, string> = {
    op: _getQueryParam(r, "op") || "",
    sid: _getQueryParam(r, "sid") || "",
    sectionId: decodeURIComponent(_getQueryParam(r, "sectionId") || ""),
    appName: decodeURIComponent(_getQueryParam(r, "appName") || ""),
  };

  // whoami — ANSWERED HERE, not proxied. The legacy clients cannot filter the
  // reader out of their own roster because nothing on the page knows who the
  // reader is: the identity lives in the presence token, which is an HttpOnly
  // cookie they can never read. RCMS has the email to hand and filters on it; this
  // is how the JSONP clients get the same fact.
  //
  // preferred_username IS the claim. Verified against a real capture: the presence
  // access token (scp api.presence.user.readwrite) carries preferred_username, oid,
  // sub and sid — and NOT email or upn — and its preferred_username is byte-for-byte
  // what the API puts in member.userEmail. email and upn are tried first for a token
  // that carries them; for this token it is the third entry that fires.
  //
  // NEVER THE TOKEN ITSELF, only the claim. The page already acts as this user, so
  // telling it their own username exposes nothing new — handing back the bearer
  // token would be another matter entirely.
  //
  // An unreadable or absent cookie yields "" rather than an error, and the client
  // reads "" as FILTER NOBODY. Getting this wrong in the other direction would hide
  // every colleague rather than one, which is the failure worth designing against.
  if (args.op === "whoami") {
    const tok = _getCookie(r, PRESENCE_TOKEN_COOKIE);
    const claims = tok ? _decodeJwtPayload(decodeURIComponent(tok)) : null;
    const userEmail = claims
      ? String(claims.email || claims.upn || claims.preferred_username || "")
      : "";
    const whoami = _cmsEnvRead(r);
    // Logged HERE as well as returned, because the browser-side log is hard to
    // reach: the CMS estate's only console is IEChooser's, which cannot be
    // attached before a tab boots — and the Modern tab is opened BY Classic, so
    // there is no moment to get in first. error_log runs at debug (see
    // nginx.conf), so this reaches the app service log stream, where the request
    // timestamps also show whether create preceded whoami and by how long.
    //
    // op and environment only. No email, no oid, no token: a pool label is not
    // an identity, and the log is a different audience from the response.
    //
    // `why` is logged even when the environment is known, so a log line is
    // self-describing rather than needing the empty case to be inferred from a
    // missing value.
    ngx.log(
      ngx.WARN,
      "[presence] whoami cmsEnv=" +
        (whoami.env || "(none)") +
        " why=" +
        whoami.why +
        " identity=" +
        (userEmail ? "yes" : "no") +
        // Neither is an identity, so both belong in the log by the rule above, and
        // the client-side console is hard to reach in this estate. AGE is the one
        // that answers "did the replay land" — it resets to near zero every time a
        // new token is written, so a session's worth of these never going back down
        // is a replay that is failing silently. Remaining life is here for sizing
        // the interval, not for deciding whether a refresh happened: AAD varies the
        // lifetime, so it can fall after a SUCCESSFUL replay (see _tokenAge).
        " expiresIn=" +
        _tokenExpiresIn(claims) +
        " age=" +
        _tokenAge(claims),
    );
    r.return(
      200,
      cb +
        "(" +
        JSON.stringify({
          userEmail,
          // Diagnostics only — the client matches on userEmail, because that is the
          // only identity the API's member records carry. Here so that "presence
          // works but nobody is filtered" can be told apart from "no token at all"
          // without decoding a cookie by hand.
          oid: claims ? String(claims.oid || "") : "",
          // Which CMS this session belongs to (CIN3, CIN5, ...), or "" — which
          // means UNKNOWN and nothing else. See _cmsEnvRead: there is no
          // "known to be blank", because a suffix-less environment is a
          // client-side mapping from a known label, not an empty value here.
          //
          // STILL DIAGNOSTIC, but no longer only that: the client may now treat
          // "" as "do not register yet, ask again next pass". Registration is
          // synchronous at boot and sectionId travels on create, the first op
          // out, so acting on this costs a deferred create — measured at 151ms
          // (QA, warm cookie) against the 3s observation cadence that would
          // retry it anyway.
          cmsEnv: whoami.env,
          // WHICH empty, for the client's log and for operators. "hint" when
          // cmsEnv is set; otherwise no-hint (nobody wrote it), bad-hint
          // (present, unreadable), hint-error (the writer said it could not work
          // it out) or no-domain (written, but no CMS domain in it). These need
          // different people to fix them, which is why one empty string was not
          // enough.
          cmsEnvWhy: whoami.why,
          // HOW LONG THE PRESENCE TOKEN HAS LEFT, in whole seconds, from its own
          // `exp` claim. 0 means no token, an unreadable one, or one already past
          // its expiry — all of which the client treats the same way: replay the
          // auth flow.
          //
          // THIS IS THE REPLAY CLOCK, and the reason it is here rather than
          // anywhere else. The cookie is HttpOnly and Path-scoped, so no page
          // script can read it, let alone decode it — the client cannot time its
          // own refresh. It also cannot learn the outcome from the auth iframe: the
          // flow ends cross-origin at document mode 5, where there is no
          // postMessage and no readable contentDocument. So the client asks the
          // SERVER what it has, after the fact, and schedules from the answer.
          //
          // A FRESH VALUE IS THE ONLY PROOF A REPLAY WORKED. The silent round trip
          // can fail (an expired AD session, AADSTS16000 for a multi-account user)
          // and a hidden iframe cannot prompt, so it fails invisibly: same cookie
          // name, same two paths, nothing thrown, nothing logged client-side.
          // Watching this number go back up is what distinguishes a working replay
          // from a dead one.
          //
          // Diagnostic until the client drives its interval from it; the auth flow
          // writes the cookie with a long Max-Age today, so the cookie and the token
          // inside it do not expire together.
          tokenExpiresIn: _tokenExpiresIn(claims),
          // HOW OLD THE TOKEN IS, and the field to read when the question is "did
          // the replay land". -1 means there is no token to age. See _tokenAge for
          // why the expiry above cannot answer that on its own: AAD's token
          // lifetime varies, so a successful replay can report LESS time remaining
          // than the token it replaced, and two expiry readings are therefore
          // ambiguous. Age is not — a number near zero is a token minted moments
          // ago, whatever its lifetime.
          tokenAge: _tokenAge(claims),
          // WHICH CLAIMS THE TOKEN ACTUALLY CARRIES — names only, comma
          // separated, "" when there is no readable token.
          //
          // NAMES, NEVER VALUES, and that is the whole reason this is safe to
          // return: a key list is a SHAPE, not data. It answers "is this claim
          // configured on the app registration" without disclosing a single
          // claim's content, so it stays on the right side of the rule above —
          // the one that lets us hand back an email the page already acts as,
          // but never the bearer token.
          //
          // HERE because this is the token that matters: the cookie holds the
          // ACCESS token we present to the presence API, not the ID token, whose
          // optional claims are configured separately. It also arrives on a call
          // a normal session already makes, so the answer needs no hand-run of
          // the auth flow.
          //
          // The question it was added for: whether a `groups` claim reaches us,
          // which would let the legacy UI gate features on Entra group
          // membership — a cohort mechanism that needs no cookie, and so is
          // immune to the Edge/IE jar split that blocks reading preview state.
          claimKeys: claims ? Object.keys(claims).join(",") : "",
          // THE READER'S GROUP IDS — a VALUE, unlike claimKeys above, and returned
          // on the same footing as userEmail: it is the reader's own membership,
          // told to a page that already acts as them. Bounded by the app
          // registration (assigned groups only — see _groupsOf), so it is a
          // handful of IDs we chose to assign, not their directory footprint.
          //
          // For the legacy clients to gate features on Entra group membership, the
          // way the web components already do with a cohort's adGroupIds. A cookie
          // is not involved, so the Edge/IE jar split that makes preview state
          // awkward does not apply.
          //
          // NOT LOGGED: the log line above is op and environment only, and the
          // log is a different audience from the response.
          groups: _groupsOf(claims),
        }) +
        ")",
    );
    return;
  }

  const op = _PRESENCE_OPS[args.op];
  if (!op) {
    r.return(
      200,
      cb + "(" + JSON.stringify({ jsonpError: "unknown op: " + args.op }) + ")",
    );
    return;
  }

  // No Watchdog host configured: say so plainly rather than let ngx.fetch fail on a
  // relative URL. whoami (above) still answers — it never reaches the API.
  if (!_PRESENCE_API_BASE) {
    r.return(
      200,
      cb +
        "(" +
        JSON.stringify({
          jsonpError:
            "presence API not configured (GLOBAL_COMPONENTS_WATCHDOG_HOST)",
        }) +
        ")",
    );
    return;
  }

  // create only — the one op that carries a sectionId, and the one whose timing
  // relative to whoami is the question. heartbeat and poll fire every 3s per
  // session and would bury both in the log.
  if (args.op === "create") {
    const _createEnv = _cmsEnvRead(r);
    ngx.log(
      ngx.WARN,
      "[presence] create sectionId=" +
        args.sectionId +
        " cmsEnv=" +
        (_createEnv.env || "(none)") +
        " why=" +
        _createEnv.why,
    );
  }

  // The token comes ONLY from the cookie (Polaris's /init writes it). There is
  // deliberately NO constant fallback: no cookie -> no Authorization -> the API 401s
  // and no banner shows, so a working banner proves the whole cookie handover
  // end-to-end.
  const cookieTok = _getCookie(r, PRESENCE_TOKEN_COOKIE);
  const headers: Record<string, string> = {};

  const appName =
    WATCHDOG_APP_NAMES.indexOf(args.appName) !== -1
      ? args.appName
      : JSONP_APP_DEFAULT;
  headers["X-Watchdog-App-Name"] = appName;
  if (cookieTok) {
    headers["Authorization"] = "Bearer " + decodeURIComponent(cookieTok);
  }

  try {
    const fetchOpts: {
      method: string;
      headers: Record<string, string>;
      body?: string;
    } = {
      method: op.method,
      headers,
    };
    const body = op.body(args);
    if (body) {
      headers["Content-Type"] = "application/json";
      fetchOpts.body = body;
    }

    const resp = await ngx.fetch(_PRESENCE_API_BASE + op.path(args), fetchOpts);
    const text = await resp.text();

    if (resp.status < 200 || resp.status >= 300) {
      // Raw JSONP has no error channel; give the browser callback one.
      r.return(
        200,
        cb +
          "(" +
          JSON.stringify({
            jsonpError: "upstream " + resp.status,
            upstreamBody: text,
          }) +
          ")",
      );
      return;
    }
    // text is already JSON (object for create, array for poll) — hand it back verbatim.
    r.return(200, cb + "(" + (text && text.length ? text : "{}") + ")");
  } catch (e) {
    r.return(200, cb + "(" + JSON.stringify({ jsonpError: String(e) }) + ")");
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

// An exception escaping a js_content handler is a blank nginx 500. Log it and
// answer plainly instead. No stack in the body: unlike the old auth flow's debug
// pages, these responses are executed as script by the CMS clients.
const _guard =
  (name: string, fn: (r: NginxHTTPRequest) => void | Promise<void>) =>
  async (r: NginxHTTPRequest): Promise<void> => {
    try {
      await fn(r);
    } catch (e) {
      const err = e as { message?: string; name?: string };
      try {
        ngx.log(
          ngx.ERR,
          "watchdog unhandled in " + name + ": " + ((err && err.name) || "Error") + ": " + ((err && err.message) || String(e)),
        );
      } catch {
        // ignore logging failures
      }
      try {
        r.return(500, "watchdog: " + name + " failed");
      } catch {
        // response already committed
      }
    }
  };

export default {
  dropContentLengthForNegotiate,
  filterNegotiateBody,
  presenceBearer,
  watchdogAppName,
  watchdogHost,
  handlePresenceJsonp: _guard("handlePresenceJsonp", handlePresenceJsonp),
};
