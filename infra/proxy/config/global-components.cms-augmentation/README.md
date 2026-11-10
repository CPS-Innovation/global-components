# CMS augmentation

What the proxy adds to the legacy CMS apps: our client scripts, injected into the pages the
proxied CMS serves.

| Page                                         | Client injected                                         |
| -------------------------------------------- | ------------------------------------------------------- |
| `/CMS.24.0.01/uaglCMS.aspx`, `/CMS.24.0.01/` | `cms-augmentation/client-classic-unstable.js` (Classic) |
| `/viewer/landing`, `/dcf/review/…`           | `cms-augmentation/client-modern-unstable.js` (Modern + DCF) |

The clients are built by `packages/cps-global-presence` and served from blob storage through
Polaris's existing `/global-components/<env>/…` route. `@@SCRIPT_BASE@@` in the conf is filled in
at deploy time by `scripts/deploy.local.sh` (relative on a single box, absolute cross-domain).

## History, briefly

This module was `cms-auth-presence` (and before 2026-09-30, `cms-auth-v2`): a self-contained Entra
sign-in for the legacy clients (`/polaris-presence` → `/init-presence/` → AD → callback), plus the
presence JSONP adapter and the script injections. On 2026-11-10:

- the sign-in was removed — Polaris's `/init` (`/polaris?terminal=iframe`) now writes the presence
  token cookie, and the Classic client calls it directly;
- the presence adapter moved to [`global-components.watchdog`](../global-components.watchdog/),
  beside the SignalR route that talks to the same API;
- what was left — the injections — was renamed for what it does.

`docs/` and `previous/` are the spike-era record of how the sign-in was designed (not built, not
deployed; `previous/` is excluded from tsc and Sonar). Read them as history.

## Diagnostics

The bottom of the conf, and all of the njs, is the debug pages:
`/global-components/diagnostic` and `/diagnostic/clear-cookies`. They stay here.

`/global-components/state/preview` (the JSONP read and the both-engines `?set=` write) used to
be served here. It moved on 2026-11-10 to vnext, the advance copy of our PR to Polaris's
global-components feature — see [vnext's README](../global-components.vnext/README.md). Deploy
vnext first.

## Tests

- `tests/*.integration.test.js` — the docker `cms-augmentation` layer: each injection lands in
  `<head>`, Classic refuses a non-IE browser it cannot flip, the diagnostics answer
  (`./run-tests.sh`).
