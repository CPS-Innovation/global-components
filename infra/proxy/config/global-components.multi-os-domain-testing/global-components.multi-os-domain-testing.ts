// ---------------------------------------------------------------------------
// Multi-OS-domain testing (FCT2-22132)
//
// TEMPORARY. Lets designated QA users run against a different OutSystems host
// (the oapps proxy, the London tenant) while everyone else stays on their
// environment's own host. Everything for it lives in this module and its .conf,
// so ending the trial is deleting this directory (plus its build/deploy/test
// wiring). Nothing here edits another team's config: it only adds locations.
//
// The signal is a per-environment cookie on this (polaris) host,
//   Gloco-Os-Target-<env>=<OS host>
// written into BOTH browser engines' cookie stores (Edge, and Edge's IE mode,
// which keeps its own) by the set route below, which is the only writer. Three
// things read it:
//   - config.json selection, so the component on CWA gets the variant config;
//   - the /launch/<cin>-proxy overrides, so the proxied-CMS C-button (clicked in
//     IE mode) sends the user through the handover chain on the chosen host;
//   - the status route, for the preview page's display.
//
// Without the cookie, every route here hands straight back to what already
// exists, unchanged.
// ---------------------------------------------------------------------------

// Each environment's OS host variants. Must match the variant config files in
// configuration/ (config.<env>.<variant>.json) — the unit tests check both ways.
const OS_HOST_VARIANTS: Record<string, Record<string, string>> = {
  test: {
    oapps: "oapps-qa-notprod.int.cps.gov.uk",
    "cps-lon": "cpslon-tst.outsystemsenterprise.com",
  },
};

// The Polaris host each environment's handover chain runs through: it serves
// the auth-handover.js bundle (the handover URL's src, which the OS-hosted
// auth-handover.html allowlists and AAD's redirect URIs embed) and /polaris.
const POLARIS_HOSTS: Record<string, string> = {
  test: "polaris-qa-notprod.cps.gov.uk",
};

// The proxied-CMS C-button routes we override, and the environment each serves.
// These mirror Polaris's own `location /launch/<cin>-proxy` blocks, which all
// send the user to the test handover on polaris-qa-notprod.
const LAUNCH_ROUTES: Record<string, string> = {
  "cin2-proxy": "test",
  "cin3-proxy": "test",
  "cin4-proxy": "test",
  "cin5-proxy": "test",
};

const COOKIE_PREFIX = "Gloco-Os-Target-";
const COOKIE_LIFESPAN_MS = 365 * 24 * 60 * 60 * 1000;

function _getCookie(r: NginxHTTPRequest, name: string): string | undefined {
  const cookies = (r.headersIn["Cookie"] as string | undefined) || "";
  const parts = cookies.split(";");
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (part.indexOf(name + "=") === 0) {
      return decodeURIComponent(part.substring(name.length + 1));
    }
  }
  return undefined;
}

function _variantForHost(env: string, host: string | undefined): string | undefined {
  if (!host) {
    return undefined;
  }
  const variants = OS_HOST_VARIANTS[env] || {};
  const names = Object.keys(variants);
  for (let i = 0; i < names.length; i++) {
    if (variants[names[i]] === host.toLowerCase()) {
      return names[i];
    }
  }
  return undefined;
}

// The switched-to host for an environment, if the request carries a valid signal.
function _targetHost(r: NginxHTTPRequest, env: string): string | undefined {
  const host = _getCookie(r, COOKIE_PREFIX + env);
  return _variantForHost(env, host) ? host!.toLowerCase() : undefined;
}

function _hostOf(url: string | undefined): string | undefined {
  const match = (url || "").match(/^https?:\/\/([^/:]+)/i);
  return match ? match[1].toLowerCase() : undefined;
}

function _query(r: NginxHTTPRequest, name: string): string {
  const value = r.args[name];
  return typeof value === "string" ? value : "";
}

// ---- config.json selection ------------------------------------------------

// js_set for the config.json locations: which blob to serve.
//   - Cross-origin (the component or the handover on an OS page, which sends
//     Origin): the config for THAT page's host, whatever the switch says. MSAL
//     tokens, OS ClientVars and CMS auth are all per-origin, so config has to
//     match the page it runs on.
//   - Same-origin (the component on CWA, which sends the cookie but no Origin):
//     the variant the switch names, if any.
//   - Anything else, or a host with no variant: config.json.
function readConfigBlobName(r: NginxHTTPRequest): string {
  // Set by the per-environment config.json location before it hands over to
  // the shared internal location, so read it rather than the (rewritten) URI.
  const env = (r.variables.gloco_config_env as string | undefined) || "";
  const originHost = _hostOf(r.headersIn["Origin"] as string | undefined);
  const requestHost = ((r.headersIn["Host"] as string | undefined) || "").split(":")[0].toLowerCase();
  const isCrossOrigin = !!originHost && originHost !== requestHost;

  const variant = isCrossOrigin ? _variantForHost(env, originHost) : _variantForHost(env, _targetHost(r, env));

  return variant ? "config." + variant + ".json" : "config.json";
}

// ---- C-button (/launch/<cin>-proxy) --------------------------------------

// The handover URL Polaris's /launch/<cin>-proxy routes point at, on `osHost`:
//   https://<polaris>/polaris?r=<handover on osHost, landing on OS home>
// Same shape and encoding as their hard-coded targets, only the host differs.
function _launchUrl(env: string, osHost: string): string {
  const polaris = POLARIS_HOSTS[env];
  const src = "https://" + polaris + "/global-components/" + env + "/auth-handover.js";
  const home = "https://" + osHost + "/casework_blocks/home?IsFromCMS=True";
  // src is left raw and only the nested r is encoded, exactly as Polaris's own
  // targets have it (the unit tests compare against them).
  const handover =
    "https://" + osHost + "/Casework_Patterns/auth-handover.html?src=" + src + "&stage=os-cookie-return&r=" + encodeURIComponent(home);
  return "https://" + polaris + "/polaris?r=" + encodeURIComponent(handover);
}

// js_set for the /launch/<cin>-proxy overrides: where a switched user's C-button
// goes, or "" to hand the request back to Polaris's own location untouched.
// The C-button is clicked in the proxied CMS, i.e. in IE mode, so this reads the
// IE-mode copy of the cookie — which the set route wrote.
function launchTarget(r: NginxHTTPRequest): string {
  const route = (r.uri.match(/^\/launch\/([^/]+)$/) || [])[1] || "";
  const env = LAUNCH_ROUTES[route];
  if (!env || !POLARIS_HOSTS[env]) {
    return "";
  }
  const host = _targetHost(r, env);
  return host ? _launchUrl(env, host) : "";
}

// ---- The switch: status + set ---------------------------------------------

// GET /global-components/multi-os/target/<env>
//   → { current: <host> | null, options: [{ variant, host }] }
// Reads the Edge copy (the preview page runs in Edge); the set route writes both
// copies together, so it speaks for both. Same-origin only, so no CORS.
function handleStatus(r: NginxHTTPRequest): void {
  const env = (r.uri.match(/^\/global-components\/multi-os\/target\/([^/]+)$/) || [])[1] || "";
  const variants = OS_HOST_VARIANTS[env] || {};
  r.headersOut["Content-Type"] = "application/json";
  if (r.method !== "GET") {
    r.return(405, JSON.stringify({ error: "Method not allowed" }));
    return;
  }
  r.return(
    200,
    JSON.stringify({
      current: _targetHost(r, env) || null,
      options: Object.keys(variants).map(variant => ({ variant, host: variants[variant] })),
    }),
  );
}

// GET /global-components/multi-os/set?env=<env>&host=<variant host or empty>&return=<path>
//
// The ONLY writer of the signal. Edge and IE mode keep separate cookie stores for
// this host, and the signal must be in both: Edge for CWA's config.json, IE mode
// for the proxied-CMS C-button. So this is a navigation (not a fetch) that
// visits both engines, the same way Polaris's own routes flip engines:
//   1. set the cookie in the engine the request arrived in;
//   2. if the site is IE-configurable, answer with X-InternetExplorerMode and a
//      redirect to itself (done=<engine>), so the browser re-requests in the
//      other engine, which sets its copy;
//   3. redirect to `return`, in Edge.
// An empty host clears both copies. Only ever one hop, so a flip the browser
// declines can't loop.
function handleSet(r: NginxHTTPRequest): void {
  const env = _query(r, "env");
  const host = _query(r, "host").toLowerCase();
  const returnTo = _query(r, "return");
  const done = _query(r, "done");

  if (!OS_HOST_VARIANTS[env] || (host && !_variantForHost(env, host))) {
    r.headersOut["Content-Type"] = "application/json";
    r.return(400, JSON.stringify({ error: "unknown environment or OS host" }));
    return;
  }

  // Same-host paths only, so this can't be used to bounce users elsewhere.
  const safeReturn = /^\/(?!\/)/.test(returnTo) ? returnTo : "/";

  const ieaction = (r.variables.ieaction as string | undefined) || "";
  const engine = ieaction.indexOf("ie+") === 0 ? "ie" : "edge";
  const configurable = ieaction.indexOf("+configurable+") !== -1;

  const expires = host ? new Date(Date.now() + COOKIE_LIFESPAN_MS) : new Date(0);
  // njs types Set-Cookie as string[]; a single string is fine at runtime
  // (same cast as _setCookie in main/global-components.ts).
  (r.headersOut as Record<string, string>)["Set-Cookie"] =
    COOKIE_PREFIX + env + "=" + encodeURIComponent(host) + "; Path=/; Expires=" + expires.toUTCString() + "; Secure; HttpOnly; SameSite=Lax";

  if (!done && configurable) {
    // Over to the other engine to write its copy.
    r.headersOut["X-InternetExplorerMode"] = engine === "edge" ? "1" : "0";
    r.return(
      302,
      "/global-components/multi-os/set?env=" +
        encodeURIComponent(env) +
        "&host=" +
        encodeURIComponent(host) +
        "&return=" +
        encodeURIComponent(safeReturn) +
        "&done=" +
        engine,
    );
    return;
  }

  // Both copies written (or the site can't flip). Finish in Edge: the preview
  // page lives there.
  if (engine === "ie" && configurable) {
    r.headersOut["X-InternetExplorerMode"] = "0";
  }
  r.return(302, safeReturn);
}

export default {
  readConfigBlobName,
  launchTarget,
  handleStatus,
  handleSet,
  OS_HOST_VARIANTS,
  POLARIS_HOSTS,
  LAUNCH_ROUTES,
};
