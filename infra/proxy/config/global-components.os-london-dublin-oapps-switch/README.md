# OS London/Dublin/oapps switch (`global-components.os-london-dublin-oapps-switch`)

**Transitional.** This module lets a user pin themselves, per environment, to one of the hosts
the OutSystems apps are served from:

| Pin                 | What it is                              | Test host (example)                    |
| ------------------- | --------------------------------------- | -------------------------------------- |
| _(none)_ — default  | the **oapps front door**                | `oapps-qa-notprod.int.cps.gov.uk`      |
| `cps`               | OutSystems resilient failover: Dublin   | `cps-tst.outsystemsenterprise.com`     |
| `cps-lon`           | OutSystems resilient failover: London   | `cpslon-tst.outsystemsenterprise.com`  |

It exists to get us through the move onto the oapps front door: while both the failover
domains and oapps are live, a user (or a tester) can choose which one their global components,
config and proxied-CMS C-button point at. Users who never pin are untouched.

**When the oapps transition is finished, this module can be removed** — delete this folder and
its wiring (see [Removing it](#removing-it)). It may still be worth keeping long term, as a way
to steer individual users onto a specific OutSystems failover domain.

## What it does

The signal is a per-environment cookie on the Polaris host, `Gloco-Os-Target-<env>=<OS host>`
(`Path=/`, `HttpOnly`). Edge and Edge's IE mode keep separate cookie stores, so it is written
into both, by one route only.

- **`/global-components/multi-os/set?env=&host=&return=`** — the only writer. Navigated to
  from the preview page; it flips the tab between engines (`X-InternetExplorerMode`) so both
  copies are set, then returns. An empty `host` clears the pin.
- **`/global-components/multi-os/target/<env>`** — reports the current pin and the options, for
  the preview page.
- **`config.json`** — `/global-components/<env>/config.json` is answered with `config.json` or
  `config.<variant>.json`, chosen by `readConfigBlobName`:
  1. the variant for the requesting OS page's own host (by `Origin`), so a page on a failover
     domain always gets config that points back at that domain; else
  2. the variant the cookie names (CWA, on the Polaris host); else
  3. `config.json`.

  The variant files are `configuration/config.<env>.<variant>.json` (the environment's config
  with only the OS host swapped), deployed beside `config.json`. `OS_HOST_VARIANTS` in the njs
  must list exactly those files — unit-tested both ways.
- **Proxied-CMS C-button** (`/launch/cin2`–`cin5-proxy`, owned by Polaris) — no location of
  ours. Only when a signal cookie is present (an njs flag, never a regex on `$http_cookie`, which
  `rewrite_log` would print in full), a server-level rewrite diverts the click to the internal
  `/global-components/os-london-dublin-oapps-switch/launch/<route>`. A valid pin sends the user
  through the same `/polaris?r=<handover>` chain with the OS host swapped; anything else is
  rewritten back to the original URI and lands on Polaris's own handler.

## What it overrides in mainline

- **`location ~ ^/global-components/(dev|test|uat|prod)/(.*)$`** (the blob route in the main
  `global-components.conf`): our exact-match `location = /global-components/<env>/config.json`
  blocks win over that regex for those four URLs only. Every other artifact stays on the
  mainline route. Our handler is a copy of the mainline blob proxying, plus `Vary: Origin,
  Cookie` and an `X-Gloco-Config` header naming the file served. A note on the mainline route
  points back here.
- **`/launch/cin2`–`cin5-proxy`**: diverted only for requests carrying the signal (see above);
  never redefined.

## Files

- `global-components.os-london-dublin-oapps-switch.conf` — locations, js_sets, the divert.
- `global-components.os-london-dublin-oapps-switch.ts` — njs: `readConfigBlobName`,
  `launchTarget`, `launchSignalled`, `handleSet`, `handleStatus`.
- `tests/` — unit tests (Node) and the Docker integration layer
  (`docker/docker-compose.os-london-dublin-oapps-switch.yml`, with
  `docker/test-only.polaris-launch.conf` standing in for Polaris's `/launch` routes).

## Deploying

QA only. `scripts/deploy-os-london-dublin-oapps-switch.local.sh` (gitignored) uploads the
compiled js then the conf to `features/global-components.os-london-dublin-oapps-switch/` and
restarts the proxy. Before uploading it deletes the module's pre-rename blobs
(`features/global-components.multi-os-domain-testing/`): both would define the `config.json`
locations, and nginx would not start.

Verify: `curl -s https://polaris-qa-notprod.cps.gov.uk/global-components/multi-os/target/test`,
and `config.json` answering with an `X-Gloco-Config` header.

## Removing it

1. `deploy-os-london-dublin-oapps-switch.local.sh remove` (deletes the blobs, restarts).
   `config.json` and the C-button fall straight back to their mainline owners.
2. Delete this folder and its lines in `scripts/build.sh`, `deploy/deploy.sh`,
   `deploy/rollback.sh`, `run-tests.sh`, `package.json`, `docker/` (the compose layer and
   `test-only.polaris-launch.conf`), and the note on the main conf's blob route.
3. The preview page's switch (`packages/cps-global-preview/src/App.tsx`) and the variant
   config files (`configuration/config.<env>.<variant>.json`,
   `packages/cps-global-configuration/src/scripts/os-host-variant-files.ts`, the deploy
   workflow's variant copy) go with it.
