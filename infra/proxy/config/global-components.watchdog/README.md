# Watchdog

The proxy in front of the Watchdog (presence) API. Two transports, one API, one setting:

| Route                                                | For                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| `/global-components/case-locking/api/…` | The SignalR hub — UAT's global-components only (QA's go direct) |
| `/global-components/presence-jsonp`     | The JSONP adapter — the legacy CMS clients (IE mode)    |
| `/global-components/presence-jsonp/whoami` | whoami on its own sub-path, carrying the reader's groups |

The URLs keep their `case-locking` name: clients and config name them. The module was called
`case-locking` until 2026-11-10, when the JSONP adapter moved in from `cms-auth-presence`.

## The setting

`GLOBAL_COMPONENTS_WATCHDOG_HOST` — the Watchdog host, bare. App setting first (Terraform's, once
it owns it), else the value `deploy.local.sh` bakes in from `.env` / `.env.uat` beside this README
(gitignored; see `.env.example`), else empty: the routes answer "not configured" and nginx still
starts.

There is no SignalR setting here. The hub's negotiate hands the browser to the Azure SignalR
Service (`https://<instance>.service.signalr.net`), and the browser connects there **directly**,
not through this proxy. Until 2026-11-12 the proxy rewrote that URL to a same-origin
`…/api/sr/<instance>/…` route and relayed it; the dev Watchdog's instance is a private endpoint that
user devices reach through the corporate access client but the proxy cannot, so the relay was
removed. Host apps that enforce a CSP must allow `https://*.service.signalr.net` in `connect-src`
(see `generated/csp`); a wildcard, because only the negotiate reply names the instance.

## Authentication

Neither transport handles sign-in. Polaris's `/init` writes the presence access token into the
HttpOnly `cms-auth-presence-token` cookie; both routes lift it into `Authorization: Bearer …`. A
client that sends its own `Authorization` (global-components, via MSAL) is passed through untouched.

## Groups (RPLT-246)

whoami's `groups` come **only** from the `cps-handover-claims` cookie, which Polaris's `/init`
sets in the iframe callback from the ID token for **our** app registration (app-assigned groups):
`_packState({ k: "claims", v: 1, oid, iat, g })`, HMAC-signed with `ENTRA_STATE_HMAC_SECRET`,
`Path=/global-components/presence-jsonp/whoami`. whoami verifies the MAC, the `k`/`v` markers and
that `oid` matches the presence token's. Anything else, including a missing secret, answers no
groups; `groupsFrom` says why. The presence token's own `groups` (the Watchdog's registration) are
never read.

`ENTRA_STATE_HMAC_SECRET` is Polaris's existing app setting; this module only reads it.

## Tests

- `tests/*.unit.test.js` — the js_sets, the JSONP adapter and whoami
  (`pnpm test` in `infra/proxy`).
- `tests/*.integration.test.js` — the docker `watchdog` layer, run with the setting unset: whoami's
  `cmsEnv` decoding and the "not configured" answers (`./run-tests.sh`).
