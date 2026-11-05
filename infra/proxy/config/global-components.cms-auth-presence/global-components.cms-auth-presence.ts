// ---------------------------------------------------------------------------
// CMS Auth Presence — Self-contained OIDC round-trip
//
// Flow: /polaris-presence -> /init-presence/ -> Azure AD -> /init-presence/callback
//
// First pass: ends on a diagnostic HTML page (no real redirects to landing
// URLs yet). Combines the cookie-capture, modern-token-fetch, and AD login
// into fewer hops than the v1 spike.
// ---------------------------------------------------------------------------

import cryptoModule from "crypto";

// ---------------------------------------------------------------------------
// Azure AD endpoints
// ---------------------------------------------------------------------------

function authorizeUrl(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`;
}

function tokenUrl(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
}

// ---------------------------------------------------------------------------
// Environment — QA defaults baked in
// ---------------------------------------------------------------------------

const tenantId =
  (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_TENANT_ID"] as string) ||
  "00dd0d1d-d7e6-4338-ac51-565339c7088c";
const clientId =
  (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_CLIENT_ID"] as string) ||
  "8d6133af-9593-47c6-94d0-5c65e9e310f1";
// redirectUri is NOT here: it is build-time injected, so it has to be declared
// below the dropzone block. njs TDZ-checks forward references to module-level
// const, and this file has been bitten by that before.

const storageAccount =
  (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_STORAGE_ACCOUNT"] as string) ||
  "sacpsglobalcomponents";

// ---------------------------------------------------------------------------
// Scopes
//
// _OIDC_SCOPES alone yields an id_token (v2, from the /oauth2/v2.0/ endpoint)
// plus an access_token for Microsoft GRAPH — and Graph always issues v1-format
// access tokens (ver "1.0"), whatever endpoint you ask through.
//
// Adding _PRESENCE_API_SCOPE — a scope this very app exposes — makes the
// access_token target US instead: ver "2.0", aud "api://<client-id>",
// scp "api.presence.user.readwrite", i.e. the shape the presence API expects.
// Requires "requestedAccessTokenVersion": 2 in the app registration manifest
// (api block); without it AAD issues a v1 token for the same scope.
//
// It must be requested at BOTH /authorize and the token exchange: a code is
// bound to the scopes consented at authorize, so asking only at redemption
// gives AADSTS70011.
//
// Set to "" to fall back to OIDC-only (Graph access token). The callback also
// drops it AUTOMATICALLY and retries once if AAD asks for consent — see
// _CONSENT_ERRORS. Client and resource are the same app here, so consent
// should not arise; the retry is a safety net for prompt=none, which turns any
// consent requirement into a dead flow rather than a prompt.
// ---------------------------------------------------------------------------
const _OIDC_SCOPES = "openid profile email";
const _PRESENCE_API_SCOPE =
  (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_PRESENCE_SCOPE"] as string) ||
  "api://8d6133af-9593-47c6-94d0-5c65e9e310f1/api.presence.user.readwrite";

// AAD errors that mean "the extra API scope needs interactive consent". Anything
// else (login_required, invalid_request, ...) is a real failure and is reported
// as-is — retrying without the scope would not help and would hide the cause.
const _CONSENT_ERRORS = ["consent_required", "interaction_required"];

// The scope string actually sent. `dropped` is carried in the state cookie so the
// token exchange asks for EXACTLY what /authorize consented to.
function _scopeString(dropped: boolean): string {
  return dropped || !_PRESENCE_API_SCOPE
    ? _OIDC_SCOPES
    : _OIDC_SCOPES + " " + _PRESENCE_API_SCOPE;
}

// ---------------------------------------------------------------------------
// Build-time templating dropzone — the two SECRETS
//
// The destination server has no app settings, so these two are injected at
// DEPLOY time: the deploy script replaces the @@...@@ tokens below in the
// COMPILED .js with values read from the local (gitignored) .env, then uploads.
// The tokens survive tsc as plain string literals, so the substitution targets
// the .js. Everything else above uses a baked-in QA default.
//
// Precedence is process.env FIRST — so docker integration tests (which set the
// vars via env) work unchanged, and the committed source never holds a real
// secret. An un-substituted token (still containing "@@") is treated as absent.
// ---------------------------------------------------------------------------
const BUILD_CLIENT_SECRET = "@@CPS_GLOBAL_COMPONENTS_CMS_AUTH_CLIENT_SECRET@@";
const BUILD_STORAGE_KEY = "@@CPS_GLOBAL_COMPONENTS_CMS_AUTH_STORAGE_KEY@@";
// Not a secret, but injected the same way for the same reason: the deployed box
// has no dependable app settings. Terraform owns those boxes and will clear
// anything it does not manage, so an env var here is a setting that silently
// disappears — and the failure mode is AADSTS50011 at runtime, on the redirect,
// where nobody is looking. Baking it into the artefact makes the deployed js
// self-describing: whatever callback it names is the one it will use.
const BUILD_REDIRECT_URI = "@@CPS_GLOBAL_COMPONENTS_CMS_AUTH_REDIRECT_URI@@";

// WHERE THE IMPLEMENTATION LIVES — e.g. "https://polaris-uat-notprod.cps.gov.uk".
// Empty means "the same host as the request", which is the conventional
// single-box deployment and was the only behaviour before the split.
//
// This exists because /polaris-presence is the hand-off between two domains. It must be
// hit on the UI domain — that is the only place the browser will send the CMS
// session cookies — and must then redirect to the IMPLEMENTATION domain carrying
// them. Until now it redirected to itself, which was indistinguishable from
// correct while both were the same box.
//
// Baked at deploy time (deploy.local.sh, from IMPL_ENV) rather than read from an
// app setting: Terraform clears settings it does not manage, and the failure mode
// here is silent — the flow completes, the cookie store just ends up empty.
const BUILD_IMPL_ORIGIN = "@@IMPL_ORIGIN@@";

const _fromDropzone = (token: string): string =>
  token.indexOf("@@") === -1 ? token : "";

const clientSecret =
  (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_CLIENT_SECRET"] as string) ||
  _fromDropzone(BUILD_CLIENT_SECRET);
const storageKey =
  (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_STORAGE_KEY"] as string) ||
  _fromDropzone(BUILD_STORAGE_KEY);

// "" when the implementation shares a host with the UI (the conventional case).
const implOrigin = _fromDropzone(BUILD_IMPL_ORIGIN);

// The AAD callback. MUST match a redirectUri registered on the app registration
// (web.redirectUris — this is a confidential-client code flow, so the spa list
// does not count), or AAD refuses the round trip with AADSTS50011.
// env -> build-time injection -> QA default, in that order.
const redirectUri =
  (process.env["CPS_GLOBAL_COMPONENTS_CMS_AUTH_REDIRECT_URI"] as string) ||
  _fromDropzone(BUILD_REDIRECT_URI) ||
  "https://polaris-qa-notprod.cps.gov.uk/init-presence/callback";

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

function _base64UrlEncode(str: string): string {
  // utf-8 -> base64url via Buffer (NOT btoa). btoa throws on any char >= U+0100,
  // and the state payload can hold non-Latin1 text from the CMS/GraphQL diag
  // previews, so btoa("...") blows up with "invalid character (>= U+00FF)".
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function _generateRandomString(length: number): string {
  const bytes = new Uint8Array(length);
  // Web Crypto only. This generates the OIDC state and nonce, so a guessable value
  // is a real weakness: if crypto were ever missing, failing the request is better
  // than quietly weakening it. The njs we run on has it (0.8.5+), and Polaris's own
  // handovers (auth-handover.drop1 / drop2) made the same call — no Math.random
  // fallback.
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(function (b) {
      return b.toString(16).padStart(2, "0");
    })
    .join("");
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

function _htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CMS Auth V2: ${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    td, th { text-align: left; padding: 8px; border: 1px solid #ddd; word-break: break-all; }
    th { background: #f5f5f5; }
    td:first-child { width: 200px; white-space: nowrap; }
    .pass { color: #2e7d32; font-weight: bold; }
    .fail { color: #c62828; font-weight: bold; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
    a { color: #0066cc; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${body}
</body>
</html>`;
}

function _esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Render an unhandled exception straight to the HTTP response so it is visible
// in the browser (the deployed proxy's logs are not reachable). Never throws.
function _renderException(
  r: NginxHTTPRequest,
  where: string,
  e: unknown,
): void {
  const err = e as { message?: string; stack?: string; name?: string };
  const name = (err && err.name) || "Error";
  const msg = (err && err.message) || String(e);
  const stack = (err && err.stack) || "(no stack available)";
  try {
    ngx.log(
      ngx.ERR,
      "cms-auth-presence unhandled in " + where + ": " + name + ": " + msg,
    );
  } catch {
    // ignore logging failures
  }
  try {
    r.headersOut["Content-Type"] = "text/html; charset=utf-8";
    r.return(
      500,
      _htmlPage(
        "Unhandled error in " + where,
        `<p class="fail">${_esc(name)}: ${_esc(msg)}</p>
         <h2>Stack</h2>
         <pre>${_esc(stack)}</pre>`,
      ),
    );
  } catch {
    // response already committed — nothing more we can do
  }
}

// Build the <tr> rows for a timing table from the accumulated [label, ms] pairs.
function _timingRows(timings: [string, number][]): string {
  const t0 = timings.length ? timings[0][1] : 0;
  return timings
    .map(function (entry, i) {
      const elapsed = entry[1] - t0;
      const delta = i > 0 ? entry[1] - timings[i - 1][1] : 0;
      return (
        "<tr><td>" +
        entry[0] +
        "</td><td>" +
        elapsed +
        " ms</td><td>" +
        (i > 0 ? "+" + delta + " ms" : "—") +
        "</td></tr>"
      );
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Table Storage helpers
// ---------------------------------------------------------------------------

function _tableStorageAuth(
  account: string,
  key: string,
  dateStr: string,
  canonicalizedResource: string,
): string {
  const stringToSign =
    dateStr + "\n" + "/" + account + "/" + canonicalizedResource;
  const keyBuffer = Buffer.from(key, "base64");
  const hmac = cryptoModule
    .createHmac("sha256", keyBuffer)
    .update(stringToSign)
    .digest("base64");
  return "SharedKeyLite " + account + ":" + hmac;
}

async function _writeTable(
  account: string,
  key: string,
  oid: string,
  payload: string,
  email: string,
): Promise<boolean> {
  const table = "cmsauth";
  const resource = `${table}(PartitionKey='${oid}',RowKey='cmsAuth')`;
  const url = `https://${account}.table.core.windows.net/${resource}`;
  const dateStr = new Date().toUTCString();
  const auth = _tableStorageAuth(account, key, dateStr, resource);

  const body = JSON.stringify({
    PartitionKey: oid,
    RowKey: "cmsAuth",
    Value: payload,
    Email: email,
  });

  try {
    const resp = await ngx.fetch(url, {
      method: "PUT",
      headers: {
        Authorization: auth,
        "x-ms-date": dateStr,
        "x-ms-version": "2019-02-02",
        "Content-Type": "application/json",
        Accept: "application/json;odata=nometadata",
        Host: account + ".table.core.windows.net",
      },
      body: body,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      ngx.log(
        ngx.ERR,
        "Table Storage PUT failed: " + resp.status + " " + errText,
      );
      return false;
    }
    return true;
  } catch (e) {
    ngx.log(ngx.ERR, "Table Storage PUT error: " + String(e));
    return false;
  }
}

async function _readTable(
  account: string,
  key: string,
  oid: string,
): Promise<{ value: string | null; diag: string }> {
  const table = "cmsauth";
  const resource = `${table}(PartitionKey='${oid}',RowKey='cmsAuth')`;
  const url = `https://${account}.table.core.windows.net/${resource}`;
  const dateStr = new Date().toUTCString();
  const auth = _tableStorageAuth(account, key, dateStr, resource);

  try {
    const resp = await ngx.fetch(url, {
      method: "GET",
      headers: {
        Authorization: auth,
        "x-ms-date": dateStr,
        "x-ms-version": "2019-02-02",
        Accept: "application/json;odata=nometadata",
        Host: account + ".table.core.windows.net",
      },
    });

    const respText = await resp.text();

    if (!resp.ok) {
      return {
        value: null,
        diag: "HTTP " + resp.status + ": " + respText.substring(0, 200),
      };
    }

    const data = JSON.parse(respText);
    return {
      value: data.Value !== undefined ? String(data.Value) : null,
      diag: "OK — keys: " + Object.keys(data).join(", "),
    };
  } catch (e) {
    return { value: null, diag: "Error: " + String(e) };
  }
}

// ---------------------------------------------------------------------------
// /polaris-presence — Cookie capture + redirect to /init-presence/
// ---------------------------------------------------------------------------

function handlePolarisPresence(r: NginxHTTPRequest): void {
  const cookieHeader = r.headersIn["Cookie"] || "";
  const encodedCookies = encodeURIComponent(cookieHeader as string);

  // Collect existing query params
  const existingArgs = r.variables["args"] || "";
  const separator = existingArgs ? "&" : "";

  const targetQuery =
    existingArgs +
    separator +
    "cookies=" +
    encodedCookies +
    "&is-proxy-session=true";

  // THE DOMAIN HAND-OFF. We are on the UI domain — which is why the Cookie header
  // above has anything in it — and now send the browser to the IMPLEMENTATION
  // domain carrying those cookies. implOrigin is empty in a single-box deployment,
  // giving the original self-redirect.
  //
  // Absolute URL required either way: IE mode iframes don't follow relative 302
  // Location headers.
  const proto = r.headersIn["X-Forwarded-Proto"] || "https";
  const host = r.headersIn["Host"] || "";
  const target = implOrigin || proto + "://" + host;
  r.return(302, target + "/init-presence/?" + targetQuery);
}

// ---------------------------------------------------------------------------
// Cms-Session-Hint — WHICH CMS WE ARE TALKING TO
//
// The presence API is one service shared by every CMS environment, so a session
// in CIN3 and a session in CIN5 land in the same watchdog unless the sectionId
// says otherwise. That is what CCPEnvironment's suffix is for — but the value
// behind it was a constant hardcoded in two codebases.
//
// The CMS environment is not in the token (the presence token is the plain
// corporate identity: same bytes whichever CMS you are in) and it is not in our
// own hostname in the proxied model, where CIN3 and CIN5 are the same host. It
// is in the F5 affinity cookie, whose NAME embeds it — and the only moment we
// can see that cookie is the capture in handlePolarisPresence, which runs on the
// CMS domain. Hence: derive here, publish as a cookie on our own host.
//
// THIS WRITE IS SCAFFOLDING. It is a deliberate twin of the main module's
// nginx.js:setSessionHintCookie, which writes the SAME cookie at /init and has
// been doing so in production all along — identical name, payload and lifespan,
// so the two writers are idempotent rather than competing. The long-term shape
// is one flow: /polaris -> /init carries all of the presence logic, and
// /polaris-presence and /init-presence go away. When that happens DELETE this
// (and _cmsDomainsFromCookieString below) rather than reconciling it — because
// the payload already matches exactly, removal changes nothing for any reader.
//
// Until then it cannot be shared code: tsc compiles each njs module separately
// and build.sh flattens the output, so a cross-module import would not survive
// the build. Two copies with one end date, not two copies forever.
//
// The READ side is NOT scaffolding. _cmsEnvRead and the cmsEnv/cmsEnvWhy fields
// on whoami stay: the JSONP adapter outlives this flow, and reading a cookie the
// main module writes is the end state.
//
// Deliberately NOT HttpOnly (the main module's isn't either): it is a pool
// label, not a credential, and page JS reading it is the point. Host-only (no
// Domain) so nothing is written to the shared cps.gov.uk space. SameSite=None
// so it survives a genuinely cross-site caller (the web component, on an
// OutSystems origin) — same-site callers like a CMS page would be fine with
// Lax, but the main module's copy has to be None and these must match.
// ---------------------------------------------------------------------------

const _SESSION_HINT_COOKIE_NAME = "Cms-Session-Hint";
const _SESSION_HINT_LIFESPAN_MS = 30 * 24 * 60 * 60 * 1000;

// HINT WRITE SWITCH. BACK ON 2026-11-04, having been off since 2026-10-13.
//
// WHY IT WAS OFF. /init-presence runs in IE mode, so this write lands in the IE
// jar on the same host /polaris captures the CMS cookies from. Polaris handed
// that jar on unfiltered as `cc`, the OutSystems apps put it in their
// Cms-Auth-Values header, and the hint's URL-encoded JSON broke that header in
// the main module's readCmsAuthValues. (The main module's twin write was
// harmless throughout: /init is coerced to Edge, a different jar.)
//
// WHY IT IS SAFE NOW — two independent guards, either of which would do:
//   1. Polaris FILTERS the jar. CC_WHITELIST_ROOTS (polaris-terraform/
//      main-terraform/nginx.js, and the identical copy in proxy/config/features/
//      auth-handover/auth-handover.js) is an ALLOW-list, so the hint cannot ride
//      along whatever its payload looks like. Landed in Polaris 34c9671a5 on
//      2026-10-14 — the day after this was switched off, which is why it stayed
//      off long after it needed to — and is on both `development` and `main`.
//   2. OUR decoder tolerates it anyway. readCmsAuthValues returns a value that
//      already opens as `{` untouched, precisely so an inner URL-encoded cookie
//      like this one is not double-decoded.
//
// IF IT HAS TO GO OFF AGAIN: false does two things, and both matter. It skips
// the write AND expires any copy an earlier deploy left behind — the cookie
// lives 30 days, so merely not writing would not stop the failures. While off,
// whoami's cmsEnv is "" with cmsEnvWhy "no-hint".
const _SESSION_HINT_WRITE_ENABLED = true;

// The environment domain (e.g. cin3.cps.gov.uk) can come from either LB cookie
// style. Prefer the load-balancing cookie, named [CF]-<TOKEN>-LBsessioncookie
// (e.g. C-CIN3-..., F-FOO-...), and derive <token>.cps.gov.uk from the TOKEN.
// Fall back to the legacy BIGipServer* cookie, whose name embeds the domain
// immediately before _POOL — matched in lowercase so the uppercase pool prefix
// (CPSACP-LTM-CM-WAN-CIN3-) can't be mistaken for the domain.
//
// TOKEN IS OPAQUE. It reads CIN3/CIN5 in pre-prod; nothing promises that shape
// in production, so this never matches /CIN\d/ and never interprets the value.
function _cmsDomainsFromCookieString(cookieString: string): string[] {
  const loadBalancingCookies =
    cookieString.match(/(?:^|;\s*)[CF]-[^=;]*-LBsessioncookie/g) || [];
  if (loadBalancingCookies.length) {
    return loadBalancingCookies.map(function (name) {
      const token = name.match(/[CF]-([^=;]*)-LBsessioncookie/);
      return (token ? token[1].toLowerCase() : "") + ".cps.gov.uk";
    });
  }
  return (
    cookieString.match(
      /[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)*\.cps\.gov\.uk(?=_POOL)/g,
    ) || []
  );
}

// isProxySession IS A DERIVED SIGNAL, NOT AN ASSUMPTION — and it reads like a
// bug if you don't know that. The caller passes `is-proxy-session === "true"`,
// and only ONE kind of endpoint ever sets that param: ours. The real
// cms.cps.gov.uk/polaris does not. So the param's presence in the handoff is
// positive evidence that the CMS session came through this proxy rather than
// from a CMS domain directly, which is the one thing neither the cookie jar nor
// our own hostname can tell us. handlePolarisPresence hardcoding it to true is
// therefore correct: that route exists only in the proxied model.
//
// It falls out right in both topologies with nothing to configure — proxied
// gives a handover endpoint on this host, unproxied builds one from the CMS
// domain the F5 cookie named.
function _sessionHintCookie(
  cookieString: string,
  isProxySession: boolean,
  host: string,
): string {
  const cmsDomains = _cmsDomainsFromCookieString(cookieString);
  // More than one domain found: take the first, as the main module does.
  const handoverEndpoint = isProxySession
    ? "https://" + host + "/polaris"
    : cmsDomains.length
      ? "https://" + cmsDomains[0] + "/polaris"
      : null;
  const value = encodeURIComponent(
    JSON.stringify({ cmsDomains, isProxySession, handoverEndpoint }),
  );
  const expires = new Date(Date.now() + _SESSION_HINT_LIFESPAN_MS);
  return (
    _SESSION_HINT_COOKIE_NAME +
    "=" +
    value +
    "; Path=/; Expires=" +
    expires.toUTCString() +
    "; Secure; SameSite=None"
  );
}

// Same name, path and attributes as the write above, so it removes exactly the
// cookie that write created.
function _expiredSessionHintCookie(): string {
  return (
    _SESSION_HINT_COOKIE_NAME +
    "=; Path=/; Expires=" +
    new Date(0).toUTCString() +
    "; Secure; SameSite=None"
  );
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
// made by _cmsDomainsFromCookieString above: THE TOKEN IS OPAQUE. It reads
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
    // Nobody wrote it: _SESSION_HINT_WRITE_ENABLED is off, the write has not
    // run for this session yet, or this is a jar the hint never reached.
    return { env: "", why: "no-hint" };
  }
  let parsed: any;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch (e) {
    // Present but unreadable — a truncated or re-encoded cookie. Ours and the
    // main module's writes are byte-identical, so this should not happen and is
    // worth seeing rather than flattening into "no hint".
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


// ---------------------------------------------------------------------------
// /init-presence/ — Modern token fetch + AD redirect (combined handler)
// ---------------------------------------------------------------------------

async function handleInitPresence(r: NginxHTTPRequest): Promise<void> {
  // Opt-in Edge revert for TOP-LEVEL testing. The default (framed) path stays IE so
  // AD's third-party SSO cookie survives (see the conf) — but a top-level test needs
  // Edge, or AD forces the tab to Edge and the IE-jar state cookie can't be read
  // ("Missing State"). ?edge=1 flips to Edge here; only fires when the browser is
  // IE + configurable, and after the flip the re-request is non-IE and falls through.
  if (
    _getQueryParam(r, "edge") === "1" &&
    (r.variables["ieaction"] as string) === "ie+configurable+"
  ) {
    r.headersOut["X-InternetExplorerMode"] = "0";
    const proto = (r.headersIn["X-Forwarded-Proto"] as string) || "https";
    const host = (r.headersIn["Host"] as string) || "";
    r.return(
      302,
      proto + "://" + host + (r.variables["request_uri"] as string),
    );
    return;
  }

  const t0 = Date.now();
  const timings: [string, number][] = [["Init handler start", t0]];

  // Step 1: Generate correlation ID
  const correlation = _generateRandomString(8);

  // Step 2: Extract cookies param, whitelist, and fetch modern token
  const cookiesParam = _getQueryParam(r, "cookies") || "";
  const rawCookies = decodeURIComponent(cookiesParam);

  // Whitelist cookie names to match the C# WhitelistedCookieNameRoots.
  // Names are matched as prefixes to handle dynamic suffixes (e.g. CMSUSER246814).
  const cookieWhitelist = [
    "ASP.NET_SessionId",
    "UID",
    "WindowID",
    "CMSUSER",
    ".CMSAUTH",
  ];

  // The F5 load-balancer affinity cookie is required so the modern-token fetch
  // lands on the CMS node that holds the session (otherwise CMS 302s to login).
  // Its name embeds the datacentre + environment and has changed shape over time
  // (was BIGipServer~ent-s221~...; now C-CIN3-LBsessioncookie / F-CIN3-LBsessioncookie),
  // so match it by the stable "LBsessioncookie" suffix rather than a fixed prefix.
  const isWhitelisted = (name: string): boolean => {
    if (/LBsessioncookie$/i.test(name) || name.indexOf("BIGipServer") === 0) {
      return true;
    }
    return cookieWhitelist.some((root) => name.indexOf(root) === 0);
  };

  const cookies = rawCookies
    ? rawCookies
        .split(";")
        .map(function (c) {
          return c.trim();
        })
        .filter(function (c) {
          const name = c.split("=")[0];
          return isWhitelisted(name);
        })
        .join("; ")
    : "";

  // Ensure WindowID=MASTER is present — it has Path=/CMS.24.0.01/ so the
  // browser won't send it to /polaris-presence. uainGeneratedScript.aspx needs it
  // to return session variables instead of the exit/cleanup script.
  const fetchCookies =
    cookies && !cookies.includes("WindowID=")
      ? cookies + "; WindowID=MASTER"
      : cookies || "WindowID=MASTER";

  let modernToken = "";
  let modernTokenError = "";
  let modernTokenDiag = "";

  if (cookies) {
    const host = r.headersIn["Host"] as string;
    const fetchUrl = `https://${host}/CMS.24.0.01/Includes/uainGeneratedScript.aspx`;

    const reqHeaders: Record<string, string> = {
      Cookie: fetchCookies,
      Host: host,
      "User-Agent":
        "Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 10.0; WOW64; Trident/7.0; .NET4.0C; .NET4.0E; .NET CLR 2.0.50727; .NET CLR 3.0.30729; .NET CLR 3.5.30729; InfoPath.3)",
    };

    // Capture what we're sending for diagnostics
    modernTokenDiag =
      "URL: " +
      fetchUrl +
      " | Cookie header length: " +
      fetchCookies.length +
      " | Cookie names: " +
      fetchCookies.replace(/=([^;]*)/g, "=...").substring(0, 200);

    timings.push(["Modern token fetch start", Date.now()]);
    try {
      const resp = await ngx.fetch(fetchUrl, {
        method: "GET",
        headers: reqHeaders,
      });

      const body = await resp.text();
      timings.push(["Modern token fetch done", Date.now()]);

      modernTokenDiag +=
        " | Status: " +
        resp.status +
        " | Body length: " +
        body.length +
        " | Body preview: " +
        body.substring(0, 300).replace(/</g, "&lt;").replace(/>/g, "&gt;");

      // Extract SESS_MODERN_USER_SESSION_ID from the response
      const match = body.match(/SESS_MODERN_USER_SESSION_ID\s*=\s*'([^']+)'/);
      if (match && match[1]) {
        modernToken = match[1];
      } else {
        modernTokenError = "SESS_MODERN_USER_SESSION_ID not found in response";
      }
    } catch (e) {
      timings.push(["Modern token fetch failed", Date.now()]);
      modernTokenError = String(e);
      modernTokenDiag += " | Exception: " + String(e);

      // Redirect to error page on fetch failure
      r.return(
        302,
        "/init-presence/error?correlation=" +
          encodeURIComponent(correlation) +
          "&error-code=modern-token-fetch-failed",
      );
      return;
    }
  } else {
    modernTokenDiag = "No cookies — skipped fetch";
  }

  // Step 2b: Validate modern token via GraphQL getUser query
  let graphqlValid = false;
  let graphqlDiag = "";

  if (modernToken) {
    const host = r.headersIn["Host"] as string;
    const graphqlUrl = `https://${host}/graphql/`;
    const graphqlBody = JSON.stringify({
      query:
        "query getUser($guid: UUID!) { user(guid: $guid) { shortName, firstNames, surname, occupation, partyId } }",
      operationName: "getUser",
      variables: { guid: modernToken },
    });

    timings.push(["GraphQL validation start", Date.now()]);
    try {
      const graphqlResp = await ngx.fetch(graphqlUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // CMS rejects the call with 400 "Wrong API version" without this.
          "cms-api-version": "1",
          // The modern session key is validated from this header — without it CMS
          // returns 401 "User Session Key failed validation".
          "cms-api-sessionid": modernToken,
          // Forward the CMS session cookies so getUser is authenticated.
          Cookie: fetchCookies,
          Host: host,
        },
        body: graphqlBody,
      });

      const graphqlText = await graphqlResp.text();
      timings.push(["GraphQL validation done", Date.now()]);

      if (!graphqlResp.ok) {
        graphqlDiag =
          "HTTP " + graphqlResp.status + ": " + graphqlText.substring(0, 200);
      } else {
        try {
          const graphqlData = JSON.parse(graphqlText);
          const userData = graphqlData.data as
            | Record<string, unknown>
            | undefined;
          if (userData && userData.user) {
            graphqlValid = true;
            graphqlDiag = "Valid — " + JSON.stringify(userData.user);
          } else {
            graphqlDiag = "No user returned: " + graphqlText.substring(0, 200);
          }
        } catch {
          graphqlDiag = "Response not JSON: " + graphqlText.substring(0, 200);
        }
      }
    } catch (e) {
      timings.push(["GraphQL validation failed", Date.now()]);
      graphqlDiag = "Exception: " + String(e);
    }
  } else {
    graphqlDiag = "Skipped — no modern token";
  }

  // If we could not capture the modern token, halt here and show the full
  // diagnostics rather than proceeding to Azure AD — the captured cookies, the
  // upstream status/body, and the timings ARE the point of this failure mode.
  if (!modernToken) {
    timings.push(["Modern token missing — halted", Date.now()]);
    r.headersOut["Content-Type"] = "text/html; charset=utf-8";
    const maskedCookies = fetchCookies.replace(/=([^;]*)/g, "=...");
    const rows = [
      ["Correlation ID", correlation || "<em>(none)</em>"],
      [
        "Modern Token",
        '<span class="fail">' +
          (modernTokenError || "not captured") +
          "</span>",
      ],
      [
        "Cookies sent",
        fetchCookies ? "<code>" + maskedCookies + "</code>" : "<em>(none)</em>",
      ],
      [
        "Modern Token Diag",
        modernTokenDiag
          ? "<code>" + modernTokenDiag + "</code>"
          : "<em>(none)</em>",
      ],
      [
        "GraphQL Diag",
        graphqlDiag ? "<code>" + graphqlDiag + "</code>" : "<em>(none)</em>",
      ],
      ["Landing URL (r)", _getQueryParam(r, "r") || "" || "<em>(none)</em>"],
    ]
      .map(function (row) {
        return `<tr><td><strong>${row[0]}</strong></td><td>${row[1]}</td></tr>`;
      })
      .join("\n");
    r.return(
      200,
      _htmlPage(
        "CMS Auth V2 — Modern token not captured",
        `<p class="fail">Halted before Azure AD: no modern session token could be captured from CMS.</p>
         <table>
           <thead><tr><th>Field</th><th>Value</th></tr></thead>
           <tbody>${rows}</tbody>
         </table>
         <h2>Timing</h2>
         <table>
           <thead><tr><th>Event</th><th>Elapsed</th><th>Delta</th></tr></thead>
           <tbody>${_timingRows(timings)}</tbody>
         </table>`,
      ),
    );
    return;
  }

  // Step 3: Build state cookie payload
  const state = _generateRandomString(16);
  const nonce = _generateRandomString(16);

  // Collect remaining query params to preserve as the redirect target
  const redirectParam = _getQueryParam(r, "r") || "";

  timings.push(["AD redirect", Date.now()]);

  const statePayload = JSON.stringify({
    s: state,
    n: nonce,
    ns: false, // API scope NOT dropped on this attempt (see _scopeString)
    r: redirectParam,
    cc: encodeURIComponent(fetchCookies),
    correlation: correlation,
    modernToken: modernToken,
    modernTokenError: modernTokenError || undefined,
    modernTokenDiag: modernTokenDiag || undefined,
    graphqlValid: graphqlValid,
    graphqlDiag: graphqlDiag || undefined,
    t: timings,
  });

  const encodedState = _base64UrlEncode(statePayload);

  // Step 4: Set state cookie + session hint + redirect to Azure AD
  //
  // The hint rides this response, not the callback's: rawCookies — the captured
  // CMS jar, the only thing that knows which CMS this is — is in hand HERE, and
  // writing it now means it survives an AD leg that fails. The callback would
  // have to dig it back out of the state envelope's cc field to say the same
  // thing.
  const cookieOpts =
    "; Path=/init-presence; HttpOnly; Secure; SameSite=Lax; Max-Age=300";
  r.headersOut["Set-Cookie"] = [
    "cms_auth_state=" + encodedState + cookieOpts,
    _SESSION_HINT_WRITE_ENABLED
      ? _sessionHintCookie(
          rawCookies,
          _getQueryParam(r, "is-proxy-session") === "true",
          (r.headersIn["Host"] as string) || "",
        )
      : _expiredSessionHintCookie(),
  ];

  const params = [
    "client_id=" + encodeURIComponent(clientId),
    "response_type=code",
    "redirect_uri=" + encodeURIComponent(redirectUri),
    "scope=" + encodeURIComponent(_scopeString(false)),
    "state=" + state,
    "nonce=" + nonce,
    "response_mode=query",
    // Silent auth: the whole flow runs inside a hidden iframe on the CMS login
    // page, and Azure AD sets X-Frame-Options: DENY on any rendered /authorize
    // response ("This content cannot be displayed in a frame"). prompt=none makes
    // AD return a bare 302 (code, or error=login_required) with no UI to render,
    // so the framed navigation isn't blocked. CMS users already have an AAD
    // session (same tenant), so this yields a code without interaction.
    "prompt=none",
  ].join("&");

  r.return(302, authorizeUrl(tenantId) + "?" + params);
}

// ---------------------------------------------------------------------------
// Presence constants — declared here (before handleInitPresenceCallback, which references
// _PRESENCE_USE_REAL_TOKEN / _PRESENCE_DEV_BEARER) because njs TDZ-checks forward
// references to module-level const. The JSONP adapter below uses them too.
// ---------------------------------------------------------------------------

const _PRESENCE_API_BASE = "https://app-cms-presence-api.azurewebsites.net/api";

// DEV token: a synthetic test JWT (placeholder tenant/user, scope api.presence.user.
// readwrite). The backend accepts it under its custom "Bearer-Test" auth scheme, which
// does NOT validate the signature (hence the "dev-signature-not-validated-by-BearerTest-
// scheme" segment). NOT a real credential. The auth callback stamps this into the id-token
// cookie while _PRESENCE_USE_REAL_TOKEN is false (a real token goes in when on); the
// handler sends whatever the cookie holds — dev under "Bearer-Test", real under "Bearer".
const _PRESENCE_DEV_BEARER =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6IlQxU3QtZUxHSGcxZ0o0d1RmZDl3Q3F6WnEtQjRvOFUiLCJ4NXQiOiJUMVN0LWVMR0hnMWdKNHdUZmQ5d0NxelpxLUI0bzhVIn0.eyJhdWQiOiJhcGk6Ly8xMTExMjIyMi0zMzMzLTQ0NDQtNTU1NS02NjY2Nzc3Nzg4ODgiLCJpc3MiOiJodHRwczovL2xvZ2luLm1pY3Jvc29mdG9ubGluZS5jb20vOTk5OTg4ODgtNzc3Ny02NjY2LTU1NTUtNDQ0NDMzMzMyMjIyL3YyLjAiLCJpYXQiOjE3MzU3MzI4MDAsIm5iZiI6MTczNTczMjgwMCwiZXhwIjoxNzM1NzM2NDAwLCJhaW8iOiJBV1FBbS84WEFBQUF0VjBtMFA3VnYxYnFVM3E0WWgxSncybjZtUThiMGs1cjN4Tj09IiwiYXpwIjoiYWFhYWJiYmItY2NjYy1kZGRkLWVlZWUtZmZmZjAwMDAxMTExIiwiYXpwYWNyIjoiMSIsIm5hbWUiOiJUZXN0IFVzZXIiLCJvaWQiOiI3YzlmNGUyYS0xYjZkLTRjM2UtOWYwYS0yZDViOGUxYTRjN2YiLCJwcmVmZXJyZWRfdXNlcm5hbWUiOiJ0ZXN0LXVzZXJAY3BzLmdvdi51ayIsImVtYWlsIjoidGVzdC11c2VyQGNwcy5nb3YudWsiLCJyaCI6IjAuQUFBQS5nWS4iLCJzY3AiOiJhcGkucHJlc2VuY2UudXNlci5yZWFkd3JpdGUiLCJzdWIiOiJBQWRqOGtRMnI3eDltTjNwTDV0WjF2QjZ3WDBjWTR1SDhzSzJlRjdnVDlhIiwidGlkIjoiOTk5OTg4ODgtNzc3Ny02NjY2LTU1NTUtNDQ0NDMzMzMyMjIyIiwidXRpIjoiYUIzY0Q0ZUY1Z0g2aUo3a0w4bU5BQSIsInZlciI6IjIuMCJ9.dev-signature-not-validated-by-BearerTest-scheme";

// Cookie the auth callback stamps the presence token into, and the JSONP adapter reads
// back out. Named for its PURPOSE, not its payload, because the payload is now selectable
// (see _PRESENCE_TOKEN_KIND) — it may hold an access token, an id token, or the dev bearer.
//
// This is now the ONLY place the callback leaves a credential. It used to also write
// the id token to a "cms-auth-id-token" localStorage key for a relay transport that
// was never built; that went on 2026-11-05 (see the note at the end of the callback).
const _PRESENCE_TOKEN_COOKIE = "cms-auth-presence-token";

// The calling application, reported to the presence API as X-Watchdog-App-Name.
// Over SignalR the name is a hub-method argument; this transport has no such
// channel, so the client passes ?appName= and we transpose it here.
//
// DEFAULT: this endpoint is only ever called by the injected CMS Classic shell
// script, so an absent arg means Classic. That default also means the client
// need not change to start reporting — it can add ?appName= when convenient.
//
// Matched against the known set rather than sanitised: the value is a query arg
// going into an outbound header, and an unrecognised app should be reported as
// no app rather than as whatever was in the URL. Vocabulary per the presence API
// README; extend here when it does.
const _WATCHDOG_APP_NAMES = [
  "Work Management App",
  "Case Review App",
  "Casework App",
  "CMS Classic",
  "CMS Modern", // covers DCF too — one app in users' minds
];
const _WATCHDOG_APP_DEFAULT = "CMS Classic";

// Dev/real switch. False = stamp the static dev bearer into the cookie (sent as
// "Bearer-Test", signature not validated by the backend); true = stamp the real token
// chosen by _PRESENCE_TOKEN_KIND (sent as "Bearer"). Kept as a switch so the whole
// handover can be exercised with a safe payload when needed.
const _PRESENCE_USE_REAL_TOKEN = true;

// WHICH real token goes in the cookie when _PRESENCE_USE_REAL_TOKEN is on.
//   "access" — the access_token from the code exchange. The API side wants an
//              access-token-shaped credential; it does no validation yet, so the
//              audience (currently Microsoft Graph, from the openid/profile/email
//              scopes) does not matter. When the API starts validating, request its
//              own scope at BOTH /authorize and the token exchange — a code is bound
//              to the scopes consented at authorize, so redemption-only gives
//              AADSTS70011, and prompt=none turns a missing consent into a dead flow.
//   "id"     — the id_token, i.e. the previous behaviour.
// Falls back to the id token if AD returns no access_token; the diagnostic page says so.
const _PRESENCE_TOKEN_KIND: "access" | "id" = "access";

// ---------------------------------------------------------------------------
// /init-presence/callback — Code exchange, validation, table storage, diagnostics
// ---------------------------------------------------------------------------

async function handleInitPresenceCallback(r: NginxHTTPRequest): Promise<void> {
  r.headersOut["Content-Type"] = "text/html; charset=utf-8";

  // Check for Azure AD errors
  const error = _getQueryParam(r, "error");
  if (error) {
    const desc = _getQueryParam(r, "error_description") || "Unknown error";

    // Self-heal: if AAD wants consent for the extra API scope, drop it and try
    // once more with OIDC scopes only. prompt=none cannot show a consent screen,
    // so without this the whole handover dies on a condition we can recover from.
    // The captured context (CMS cookies, modern token, timings) lives in the state
    // cookie, so we re-issue that payload rather than re-running /init-presence — nothing
    // is lost. `ns` marks the retry so it can only ever happen once.
    if (_CONSENT_ERRORS.indexOf(error) !== -1 && _PRESENCE_API_SCOPE) {
      const raw = _getCookie(r, "cms_auth_state");
      let prior: Record<string, unknown> | null = null;
      try {
        prior = raw ? JSON.parse(_base64UrlDecode(raw)) : null;
      } catch {
        prior = null;
      }
      if (prior && !prior.ns) {
        const retryState = _generateRandomString(16);
        const retryNonce = _generateRandomString(16);
        prior.s = retryState;
        prior.n = retryNonce;
        prior.ns = true;
        r.headersOut["Set-Cookie"] = [
          "cms_auth_state=" +
            _base64UrlEncode(JSON.stringify(prior)) +
            "; Path=/init-presence; HttpOnly; Secure; SameSite=Lax; Max-Age=300",
        ];
        const retryParams = [
          "client_id=" + encodeURIComponent(clientId),
          "response_type=code",
          "redirect_uri=" + encodeURIComponent(redirectUri),
          "scope=" + encodeURIComponent(_scopeString(true)),
          "state=" + retryState,
          "nonce=" + retryNonce,
          "response_mode=query",
          "prompt=none",
        ].join("&");
        r.return(302, authorizeUrl(tenantId) + "?" + retryParams);
        return;
      }
    }

    r.return(
      400,
      _htmlPage("Auth Error", `<p><strong>${error}</strong></p><p>${desc}</p>`),
    );
    return;
  }

  // Recover state cookie
  const stateCookieRaw = _getCookie(r, "cms_auth_state");
  if (!stateCookieRaw) {
    r.return(
      400,
      _htmlPage(
        "Missing State",
        "<p>No cms_auth_state cookie found. The login flow may have expired.</p>",
      ),
    );
    return;
  }

  let statePayload: {
    s: string;
    n: string;
    ns?: boolean;
    r: string;
    cc: string;
    correlation: string;
    modernToken: string;
    modernTokenError?: string;
    modernTokenDiag?: string;
    graphqlValid?: boolean;
    graphqlDiag?: string;
    t?: [string, number][];
  };
  try {
    statePayload = JSON.parse(_base64UrlDecode(stateCookieRaw));
  } catch {
    r.return(
      400,
      _htmlPage("Invalid State", "<p>Could not decode state cookie.</p>"),
    );
    return;
  }

  // Recover timing array from state cookie
  const timings: [string, number][] = statePayload.t || [];
  timings.push(["Callback start", Date.now()]);

  // Validate state parameter
  const stateParam = _getQueryParam(r, "state");
  if (!stateParam || stateParam !== statePayload.s) {
    r.return(
      400,
      _htmlPage(
        "State Mismatch",
        "<p>State parameter does not match cookie.</p>",
      ),
    );
    return;
  }

  // Exchange code for tokens
  const code = _getQueryParam(r, "code");
  if (!code) {
    r.return(
      400,
      _htmlPage("Missing Code", "<p>No authorization code received.</p>"),
    );
    return;
  }

  const tokenBody = [
    "client_id=" + encodeURIComponent(clientId),
    "client_secret=" + encodeURIComponent(clientSecret),
    "code=" + encodeURIComponent(code),
    "redirect_uri=" + encodeURIComponent(redirectUri),
    "grant_type=authorization_code",
    // MUST match the /authorize scope — including the retry's dropped API scope,
    // otherwise AAD rejects the redemption (AADSTS70011).
    "scope=" + encodeURIComponent(_scopeString(!!statePayload.ns)),
  ].join("&");

  let idToken: string;
  // The access_token that rides along with the id_token. With today's
  // "openid profile email" scopes this is a Microsoft Graph token — a real, signed
  // JWT, which is all the presence API needs while it does no validation.
  let accessToken = "";
  let claims: Record<string, unknown>;

  timings.push(["Token exchange start", Date.now()]);
  try {
    const resp = await ngx.fetch(tokenUrl(tenantId), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Host: "login.microsoftonline.com",
      },
      body: tokenBody,
    });

    const text = await resp.text();
    if (!resp.ok) {
      r.return(
        500,
        _htmlPage(
          "Token Exchange Failed",
          `<p>Status: ${resp.status}</p><pre>${text}</pre>`,
        ),
      );
      return;
    }

    const data = JSON.parse(text);
    idToken = data.id_token;
    accessToken = data.access_token || "";
    const decoded = _decodeJwtPayload(idToken);
    if (!decoded) {
      r.return(
        500,
        _htmlPage(
          "Token Decode Failed",
          "<p>Could not decode id_token JWT payload.</p>",
        ),
      );
      return;
    }
    claims = decoded;
    timings.push(["Token exchange done", Date.now()]);
  } catch (e) {
    r.return(500, _htmlPage("Token Exchange Error", `<p>${String(e)}</p>`));
    return;
  }

  // Validate token
  timings.push(["Token validation start", Date.now()]);
  const validationErrors: string[] = [];

  // 1. Nonce
  if (claims.nonce !== statePayload.n) {
    validationErrors.push("Nonce mismatch");
  }

  // 2. Tenant ID
  if (claims.tid !== tenantId) {
    validationErrors.push(
      "Tenant ID mismatch: expected " +
        tenantId +
        ", got " +
        String(claims.tid),
    );
  }

  // 3. Issuer
  const iss = claims.iss as string;
  const validIssuers = [
    `https://sts.windows.net/${tenantId}/`,
    `https://login.microsoftonline.com/${tenantId}/v2.0`,
  ];
  if (!validIssuers.includes(iss)) {
    validationErrors.push("Issuer mismatch: " + iss);
  }

  // 4. Expiry
  const exp = claims.exp as number;
  if (!exp || exp < Math.floor(Date.now() / 1000)) {
    validationErrors.push("Token expired");
  }

  const isValid = validationErrors.length === 0;
  const validationHtml = isValid
    ? '<span class="pass">PASS</span>'
    : '<span class="fail">FAIL — ' + validationErrors.join("; ") + "</span>";

  timings.push(["Token validation done", Date.now()]);

  // Extract user info
  const oid = String(claims.oid || "");
  const email = String(
    claims.email || claims.upn || claims.preferred_username || "",
  );
  const name = String(claims.name || "");

  // Table Storage: store {cookies, modernToken, correlationId} keyed by OID
  let storageWriteHtml = '<span class="fail">SKIP — no storage creds</span>';
  let storageReadHtml = '<span class="fail">SKIP — no storage creds</span>';

  if (storageAccount && storageKey && isValid && oid) {
    const tablePayload = JSON.stringify({
      cookies: statePayload.cc,
      modernToken: statePayload.modernToken,
      correlationId: statePayload.correlation,
      email: email,
    });

    timings.push(["Storage write start", Date.now()]);
    const writeOk = await _writeTable(
      storageAccount,
      storageKey,
      oid,
      tablePayload,
      email,
    );
    timings.push(["Storage write done", Date.now()]);
    storageWriteHtml = writeOk
      ? '<span class="pass">PASS</span>'
      : '<span class="fail">FAIL</span>';

    if (writeOk) {
      timings.push(["Storage read start", Date.now()]);
      const readResult = await _readTable(storageAccount, storageKey, oid);
      timings.push(["Storage read done", Date.now()]);
      storageReadHtml =
        readResult.value !== null
          ? "<code>" + readResult.value + "</code>"
          : '<span class="fail">FAIL — ' + readResult.diag + "</span>";
    } else {
      storageReadHtml = '<span class="fail">SKIP — write failed</span>';
    }
  }

  // Tokens are shown IN FULL — this is a diagnostic page reached by running the flow
  // by hand, and a truncated token can't be pasted into a request to try it. The table
  // cells already carry word-break: break-all so they wrap. No escaping needed: a JWT is
  // base64url + dots, so it has no HTML-significant characters.
  // Decoded so the token's shape can be checked by eye: ver tells you whether the
  // manifest's requestedAccessTokenVersion took effect, aud whether it targets us
  // or Graph. Graph's v1 tokens decode fine; a failure just shows as (not decodable).
  const accessClaims = accessToken ? _decodeJwtPayload(accessToken) : null;
  const _claimsCell = (c: Record<string, unknown> | null) =>
    c
      ? "<code>ver=" +
        String(c.ver ?? "?") +
        " · aud=" +
        String(c.aud ?? "?") +
        " · scp=" +
        String(c.scp ?? "-") +
        " · appid=" +
        String(c.appid ?? c.azp ?? "-") +
        // Every claim name the token carries, so this cell answers "is claim X
        // configured" for any X without the four fields above having to be
        // extended one question at a time. Names only — see the whoami op's
        // claimKeys for why a key list discloses nothing.
        //
        // This cell renders for BOTH tokens, so it is also the only place the
        // access token's claim names appear: the "JWT Claims Keys" row below is
        // built from the id token's claims, and the two are configured
        // separately in the app registration's optional_claims.
        " · keys=" +
        Object.keys(c).join(",") +
        "</code>"
      : "<em>(not decodable)</em>";

  const _tokenCell = (tok: string) =>
    tok
      ? "<code>" + tok + "</code> <em>(" + tok.length + " chars)</em>"
      : '<span class="fail">(none returned)</span>';

  timings.push(["Render page", Date.now()]);

  // Build timing table
  const t0 = timings[0][1];
  const timingRows = _timingRows(timings);

  // Two Set-Cookie headers:
  //  1. Clear the state cookie — the flow is finished.
  //  2. Hand the id-token to the JSONP presence transport. The presence-jsonp adapter
  //     (handlePresenceJsonp) reads this from the request Cookie header and lifts it
  //     into an Authorization: Bearer, so the token is never in a URL or readable by
  //     page JS. HttpOnly (JS can't touch it), Secure, and Path-scoped to the JSONP
  //     endpoint so it rides ONLY those requests.
  //     HOST-ONLY (no Domain attribute): the callback that sets this and the JSONP
  //     endpoint that reads it are the SAME proxy host in the proxied-CMS model, so the
  //     cookie never needs to cross subdomains — that cross-domain scope was the relay/
  //     iframe topology, not this one. Host-only keeps it off every other *.cps.gov.uk
  //     host and out of the shared registrable-domain cookie budget.
  //     Max-Age ~8h matches the token-age grace window the backend accepts and a working
  //     shift, so one login covers the day. Set UNCONDITIONALLY (framed or top-level).
  //
  //     THE 8h IS COVER FOR A MISSING REFRESH, not a claim about the token. The token
  //     inside lasts of the order of an hour, and this flow has no refresh token to
  //     swap for a new one — it asks for the presence audience up front and keeps what
  //     comes back. So the long Max-Age only works because the API does not yet check
  //     expiry. classic/auth.js now replays the whole silent round trip periodically,
  //     which is what makes this honest; once that is proven, this should come down to
  //     the token's own lifetime so the cookie and its contents expire together.
  const clearOpts =
    "; Path=/init-presence; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
  const presenceCookieOpts =
    "; Path=/global-components/presence-jsonp; HttpOnly; Secure; SameSite=Lax; Max-Age=28800";
  // The SAME token, scoped to the case-locking hub routes, for the Modern/DCF
  // SignalR client. That client ships no credential: presenceBearer (in
  // global-components.case-locking.ts) lifts this cookie into an Authorization
  // header on the way upstream, because a browser cannot set headers on a
  // WebSocket handshake.
  //
  // Two narrow cookies rather than one broad Path=/global-components: the token
  // then rides only on the two routes that need it, not on analytics, state and
  // the data api.
  //
  // Cross-ORIGIN but same-SITE in the unproxied estate (a.cps.gov.uk page,
  // b.cps.gov.uk hub, both under cps.gov.uk), so SameSite=Lax still sends it.
  const caseLockingCookieOpts =
    "; Path=/global-components/case-locking; HttpOnly; Secure; SameSite=Lax; Max-Age=28800";
  // Which token rides in the cookie. Dev bearer when the real-token switch is off (safe
  // payload, still exercises the whole handover); otherwise the kind named by
  // _PRESENCE_TOKEN_KIND, falling back to the id token if AD returned no access_token.
  // The JSONP handler reads ONLY this cookie (no constant fallback), so a working banner
  // proves this handover end-to-end.
  const wantAccess = _PRESENCE_TOKEN_KIND === "access";
  const presenceTokenKind = !_PRESENCE_USE_REAL_TOKEN
    ? "dev bearer"
    : wantAccess && accessToken
      ? "access token"
      : wantAccess
        ? "id token (no access_token returned)"
        : "id token";
  const cookieToken = !_PRESENCE_USE_REAL_TOKEN
    ? _PRESENCE_DEV_BEARER
    : wantAccess && accessToken
      ? accessToken
      : idToken;
  r.headersOut["Set-Cookie"] = [
    "cms_auth_state=deleted" + clearOpts,
    _PRESENCE_TOKEN_COOKIE +
      "=" +
      encodeURIComponent(cookieToken) +
      presenceCookieOpts,
    _PRESENCE_TOKEN_COOKIE +
      "=" +
      encodeURIComponent(cookieToken) +
      caseLockingCookieOpts,
  ];

  // Render diagnostic page
  const rows = [
    ["Correlation ID", statePayload.correlation || "<em>(none)</em>"],
    ["Landing URL (r)", statePayload.r || "<em>(none)</em>"],
    [
      "Cookies (cc)",
      statePayload.cc
        ? "<code>" +
          statePayload.cc.substring(0, 100) +
          (statePayload.cc.length > 100 ? "..." : "") +
          "</code>"
        : "<em>(none)</em>",
    ],
    [
      "Modern Token",
      statePayload.modernToken
        ? "<code>" + statePayload.modernToken + "</code>"
        : '<span class="fail">' +
          (statePayload.modernTokenError || "not captured") +
          "</span>",
    ],
    [
      "Modern Token Diag",
      statePayload.modernTokenDiag
        ? "<code>" + statePayload.modernTokenDiag + "</code>"
        : "<em>(none)</em>",
    ],
    [
      "GraphQL Validation",
      statePayload.graphqlValid
        ? '<span class="pass">PASS</span>'
        : '<span class="fail">FAIL</span>',
    ],
    [
      "GraphQL Diag",
      statePayload.graphqlDiag
        ? "<code>" + statePayload.graphqlDiag + "</code>"
        : "<em>(none)</em>",
    ],
    [
      "Scopes Requested",
      "<code>" +
        _scopeString(!!statePayload.ns) +
        "</code>" +
        (statePayload.ns
          ? ' <span class="fail">(API scope dropped — AAD asked for consent, retried without it)</span>'
          : ""),
    ],
    ["ID Token", _tokenCell(idToken)],
    ["Access Token", _tokenCell(accessToken)],
    ["Access Token Claims", _claimsCell(accessClaims)],
    [
      "Presence Cookie",
      "<code>" +
        _PRESENCE_TOKEN_COOKIE +
        "</code> = " +
        presenceTokenKind +
        " <em>(" +
        cookieToken.length +
        " chars, sent as " +
        (_PRESENCE_USE_REAL_TOKEN ? "Bearer" : "Bearer-Test") +
        ")</em>",
    ],
    ["OID", oid],
    ["Tenant ID", String(claims.tid || "")],
    ["Name", name],
    ["Email", email || '<span class="fail">(empty)</span>'],
    ["JWT Claims Keys", "<code>" + Object.keys(claims).join(", ") + "</code>"],
    ["Issuer", String(claims.iss || "")],
    ["Token Validation", validationHtml],
    ["Storage Write", storageWriteHtml],
    ["Storage Read-back", storageReadHtml],
  ]
    .map(function (row) {
      return `<tr><td><strong>${row[0]}</strong></td><td>${row[1]}</td></tr>`;
    })
    .join("\n");

  // NO localStorage STASH ANY MORE (removed 2026-11-05). This page used to write the
  // id token to "cms-auth-id-token" in its own (polaris) origin store for the RELAY
  // transport to read same-origin. That transport was never built — the relay page it
  // was written for does not exist in this repo — and the token now reaches our
  // endpoints the way it should: in the HttpOnly, Path-scoped presence cookie set
  // above, which the adapter lifts into an Authorization header server-side.
  //
  // That is strictly better than the store it replaces. A credential in localStorage
  // is readable by every script on the origin and has no path scope; the cookie is
  // readable by none and rides only the two routes that need it. The one remaining
  // reader was classic/event-sink.js's dormant postEvent helper, whose header now
  // says to rely on the cookie instead.

  r.return(
    200,
    _htmlPage(
      "CMS Auth V2 Diagnostic",
      `<p>Azure AD authentication completed (v2 flow).</p>
       <table>
         <thead><tr><th>Field</th><th>Value</th></tr></thead>
         <tbody>${rows}</tbody>
       </table>
       <h2>Timing</h2>
       <table>
         <thead><tr><th>Event</th><th>Elapsed</th><th>Delta</th></tr></thead>
         <tbody>${timingRows}</tbody>
       </table>
       <p>Total: <strong>${timings[timings.length - 1][1] - t0} ms</strong></p>`,
    ),
  );
}

// ---------------------------------------------------------------------------
// /init-presence/error — Error page with correlation ID
// ---------------------------------------------------------------------------

function handleInitPresenceError(r: NginxHTTPRequest): void {
  r.headersOut["Content-Type"] = "text/html; charset=utf-8";

  const correlation = _getQueryParam(r, "correlation") || "(unknown)";
  const errorCode = _getQueryParam(r, "error-code") || "unknown";

  r.return(
    500,
    _htmlPage(
      "CMS Auth V2 Error",
      `<p>An error occurred during the authentication flow.</p>
       <table>
         <thead><tr><th>Field</th><th>Value</th></tr></thead>
         <tbody>
           <tr><td><strong>Correlation ID</strong></td><td><code>${correlation}</code></td></tr>
           <tr><td><strong>Error Code</strong></td><td><code>${errorCode}</code></td></tr>
         </tbody>
       </table>
       <p>Please provide the correlation ID when reporting this issue.</p>`,
    ),
  );
}

// ---------------------------------------------------------------------------
// /global-components/cms-modern-token-v2 — Standalone modern token fetch
//
// Identical to v1 handleCmsModernToken. Allows direct comparison with the
// /init-presence/ inline fetch using the same cookies.
// ---------------------------------------------------------------------------

async function handleCmsModernToken(r: NginxHTTPRequest): Promise<void> {
  const ccRaw = _getQueryParam(r, "cc") || "";
  if (!ccRaw) {
    r.headersOut["Content-Type"] = "text/plain; charset=utf-8";
    r.return(400, "Missing cc query parameter");
    return;
  }

  let cc = decodeURIComponent(ccRaw);

  // Allow adding BIGipServer cookie via separate param
  const bigipRaw = _getQueryParam(r, "bigip") || "";
  if (bigipRaw) {
    const bigip = decodeURIComponent(bigipRaw);
    cc = cc + "; " + bigip;
  }

  const host = r.headersIn["Host"] as string;
  const url = `https://${host}/CMS.24.0.01/Includes/uainGeneratedScript.aspx`;

  const reqHeaders: Record<string, string> = {
    Cookie: cc,
    Host: host,
    "User-Agent":
      "Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 10.0; WOW64; Trident/7.0; .NET4.0C; .NET4.0E; .NET CLR 2.0.50727; .NET CLR 3.0.30729; .NET CLR 3.5.30729; InfoPath.3)",
  };

  // Build request dump
  let reqDump = "=== Outbound Request ===\n" + "GET " + url + "\n";
  for (const k in reqHeaders) {
    reqDump += k + ": " + reqHeaders[k] + "\n";
  }

  try {
    const resp = await ngx.fetch(url, {
      method: "GET",
      headers: reqHeaders,
    });

    const body = await resp.text();

    // Build response dump
    let respDump =
      "\n=== Response ===\n" + "Status: " + resp.status + "\n" + "Headers:\n";
    // njs Headers.forEach is (name, value)
    resp.headers.forEach(function (name: string, value: string) {
      respDump += "  " + name + ": " + value + "\n";
    });
    respDump += "\nBody (" + body.length + " bytes):\n" + body;

    // Extract SESS_MODERN_USER_SESSION_ID from the response
    const match = body.match(/SESS_MODERN_USER_SESSION_ID\s*=\s*'([^']+)'/);

    r.headersOut["Content-Type"] = "text/plain; charset=utf-8";
    if (match && match[1]) {
      r.return(
        200,
        "SESS_MODERN_USER_SESSION_ID: " +
          match[1] +
          "\n\n" +
          reqDump +
          respDump,
      );
    } else {
      r.return(
        404,
        "SESS_MODERN_USER_SESSION_ID not found in response\n\n" +
          reqDump +
          respDump,
      );
    }
  } catch (e) {
    r.headersOut["Content-Type"] = "text/plain; charset=utf-8";
    r.return(500, "Error: " + String(e) + "\n\n" + reqDump);
  }
}

// ---------------------------------------------------------------------------
// Presence JSONP adapter
//
// The injected CMS client reaches the presence API cross-origin, which the IE
// Internet zone forbids for XHR — but NOT for <script src>. So the client fetches
// via JSONP (script tags) and this handler shims each GET into the backend's real
// REST call: it maps ?op= to POST/PUT/GET/DELETE, lifts the id-token out of the
// HttpOnly cookie into an Authorization header (so the token is never in the URL),
// and wraps the JSON response as callback(...). The API keeps its pure REST form.
//
// Upstream hop is the plain house pattern (server-level resolver + ngx.fetch), the
// same as handleInitPresenceCallback — see the location in the .conf.
// ---------------------------------------------------------------------------

// (The _PRESENCE_* scalar constants are declared ABOVE handleInitPresenceCallback — that
// callback references _PRESENCE_USE_REAL_TOKEN / _PRESENCE_DEV_BEARER, and njs TDZ-checks
// forward references to module-level const, so they must precede their first use.)

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
  // what the API puts in member.userEmail. The order below matches
  // handleInitPresenceCallback's, so both read identity the same way; for this token it is
  // the third entry that fires.
  //
  // NEVER THE TOKEN ITSELF, only the claim. The page already acts as this user, so
  // telling it their own username exposes nothing new — handing back the bearer
  // token would be another matter entirely.
  //
  // An unreadable or absent cookie yields "" rather than an error, and the client
  // reads "" as FILTER NOBODY. Getting this wrong in the other direction would hide
  // every colleague rather than one, which is the failure worth designing against.
  if (args.op === "whoami") {
    const tok = _getCookie(r, _PRESENCE_TOKEN_COOKIE);
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
          // HERE RATHER THAN ON THE DIAGNOSTIC PAGE because this is the token
          // that matters. The cookie holds the ACCESS token (_PRESENCE_TOKEN_KIND),
          // which is what we present to the presence API, whereas
          // handleInitPresenceCallback's "JWT Claims Keys" row lists the ID
          // token's claims — a different token with separately configured
          // optional claims. Asking there answers a question we are not asking.
          // This also arrives on a call a normal session already makes, so the
          // answer needs no hand-run of the auth flow.
          //
          // The question it was added for: whether a `groups` claim reaches us,
          // which would let the legacy UI gate features on Entra group
          // membership — a cohort mechanism that needs no cookie, and so is
          // immune to the Edge/IE jar split that blocks reading preview state.
          claimKeys: claims ? Object.keys(claims).join(",") : "",
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

  // The token comes ONLY from the cookie (the auth callback stamps it there — dev bearer
  // while _PRESENCE_USE_REAL_TOKEN is off, otherwise the real token chosen by
  // _PRESENCE_TOKEN_KIND). There is deliberately NO constant fallback: no cookie -> no
  // Authorization -> the API 401s and no banner shows, so a working banner proves the
  // whole cookie handover end-to-end. Scheme follows the switch: the dev token goes as
  // "Bearer-Test" (signature not validated by the backend), a real token as "Bearer".
  const cookieTok = _getCookie(r, _PRESENCE_TOKEN_COOKIE);
  const headers: Record<string, string> = {};

  const appName =
    _WATCHDOG_APP_NAMES.indexOf(args.appName) !== -1
      ? args.appName
      : _WATCHDOG_APP_DEFAULT;
  headers["X-Watchdog-App-Name"] = appName;
  if (cookieTok) {
    headers["Authorization"] =
      (_PRESENCE_USE_REAL_TOKEN ? "Bearer " : "Bearer-Test ") +
      decodeURIComponent(cookieTok);
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

// Best-effort "clear every cookie the browser sent". We only see cookie NAMES
// in the request Cookie header (never their Path/Domain), so for each name we
// emit expiring Set-Cookie headers across the likely scopes: host-only (no
// Domain), the exact host, and each parent domain (down to two labels). Path is
// assumed "/" (the common case) — a cookie pinned to a deeper path can't be
// cleared blind. Runs server-side, so HttpOnly cookies are cleared too. Both
// Expires (which old IE honours) and Max-Age=0 are set.
function handleClearCookies(r: NginxHTTPRequest): void {
  const raw = r.headersIn["Cookie"] || "";
  const host = (r.headersIn["Host"] || "").split(":")[0];

  // Unique cookie names from the request header.
  const names: string[] = [];
  const seen: { [k: string]: boolean } = {};
  const parts = raw.split(/; */);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "") {
      continue;
    }
    const eq = parts[i].indexOf("=");
    const name = eq === -1 ? parts[i] : parts[i].substring(0, eq);
    if (name !== "" && !seen[name]) {
      seen[name] = true;
      names.push(name);
    }
  }

  // Domain scopes to attempt: "" = host-only (omit the Domain attribute), the
  // exact host, then each parent domain (drop the leftmost label) down to two
  // labels. (.gov.uk etc. are public suffixes the browser rejects — harmless.)
  const domains: string[] = ["", host];
  let labels = host.split(".");
  while (labels.length > 2) {
    labels = labels.slice(1);
    domains.push("." + labels.join("."));
  }

  const past = "Thu, 01 Jan 1970 00:00:00 GMT";
  const setCookies: string[] = [];
  for (let n = 0; n < names.length; n++) {
    for (let d = 0; d < domains.length; d++) {
      const domainAttr = domains[d] === "" ? "" : "; Domain=" + domains[d];
      setCookies.push(
        names[n] + "=; Path=/; Expires=" + past + "; Max-Age=0" + domainAttr,
      );
    }
  }
  r.headersOut["Set-Cookie"] = setCookies;
  r.headersOut["Cache-Control"] = "no-store";
  r.headersOut["Content-Type"] = "text/html; charset=utf-8";

  const listHtml =
    names.length === 0
      ? "<p>No cookies were sent.</p>"
      : "<ul>" +
        names.map((n) => "<li><code>" + _esc(n) + "</code></li>").join("") +
        "</ul>";

  r.return(
    200,
    _htmlPage(
      "Clear Cookies",
      `<p>Expired <strong>${names.length}</strong> cookie name(s) across ${domains.length} scope(s) ` +
        `(${setCookies.length} Set-Cookie header(s)), Path <code>/</code>.</p>` +
        listHtml +
        `<p>Reload, then check <a href="/global-components/diagnostic">/global-components/diagnostic</a> ` +
        `to confirm what remains. Anything pinned to a deeper Path (not <code>/</code>) can't be cleared blind.</p>`,
    ),
  );
}

// Wrap each handler so any unhandled throw renders as a readable 500 page
// (with name/message/stack) instead of a blank nginx 500. Works for both sync
// and async handlers — awaiting a non-promise is a no-op.
const _guard =
  (name: string, fn: (r: NginxHTTPRequest) => void | Promise<void>) =>
  async (r: NginxHTTPRequest): Promise<void> => {
    try {
      await fn(r);
    } catch (e) {
      _renderException(r, name, e);
    }
  };

export default {
  handlePolarisPresence: _guard("handlePolarisPresence", handlePolarisPresence),
  handleInitPresence: _guard("handleInitPresence", handleInitPresence),
  handleInitPresenceCallback: _guard("handleInitPresenceCallback", handleInitPresenceCallback),
  handleInitPresenceError: _guard("handleInitPresenceError", handleInitPresenceError),
  handleCmsModernToken: _guard("handleCmsModernToken", handleCmsModernToken),
  handleClearCookies: _guard("handleClearCookies", handleClearCookies),
  handlePresenceJsonp: _guard("handlePresenceJsonp", handlePresenceJsonp),
};
