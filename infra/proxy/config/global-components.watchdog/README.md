# Watchdog

The proxy in front of the Watchdog (presence) API. Two transports, one API, one setting:

| Route                                                | For                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| `/global-components/case-locking/api/…`              | The SignalR hub — global-components in the current apps      |
| `/global-components/case-locking/api/sr/<instance>/…` | The Azure SignalR Service instance the hub's negotiate names |
| `/global-components/presence-jsonp`                  | The JSONP adapter — the legacy CMS clients (IE mode)         |

The URLs keep their `case-locking` name: clients and config name them. The module was called
`case-locking` until 2026-11-10, when the JSONP adapter moved in from `cms-auth-presence`.

## The setting

`GLOBAL_COMPONENTS_WATCHDOG_HOST` — the Watchdog host, bare. App setting first (Terraform's, once
it owns it), else the value `deploy.local.sh` bakes in from `.env` / `.env.uat` beside this README
(gitignored; see `.env.example`), else empty: the routes answer "not configured" and nginx still
starts.

There is no SignalR setting. `filterNegotiateBody` rewrites the negotiate response's
`https://<instance>.service.signalr.net/…` to `…/api/sr/<instance>/…`, and the sr location proxies
back to whichever instance that names (DNS-label shaped, fixed domain, our cookies stripped).

## Authentication

Neither transport handles sign-in. Polaris's `/init` writes the presence access token into the
HttpOnly `cms-auth-presence-token` cookie; both routes lift it into `Authorization: Bearer …`. A
client that sends its own `Authorization` (global-components, via MSAL) is passed through untouched.

## Tests

- `tests/*.unit.test.js` — filters, js_sets, the sr location regex, the JSONP adapter and whoami
  (`pnpm test` in `infra/proxy`).
- `tests/*.integration.test.js` — the docker `watchdog` layer, run with the setting unset: whoami's
  `cmsEnv` decoding, the "not configured" answers, and a non-instance `sr/` path not reaching
  SignalR (`./run-tests.sh`).
