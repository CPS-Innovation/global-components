# /launch-vca (`global-components.launch-vca`)

**Experimental.** One URL that opens the Victims Case Application (VCA) logged in, as if a "V"
button had been pressed in CMS:

```
https://polaris-qa-notprod.cps.gov.uk/launch-vca
```

It works without a `Cms-Session-Hint`. VCA users may never press P or C, so they may never have
one, and the Classic iframe that would write it is not live in prod yet.

## What it does

`/launch-vca` serves a small page. Its script looks for a live CMS session in this browser the
way polaris-ui's in-situ reauth does: a `<script>` tag per CMS handover endpoint, tried one at a
time, in order. Each probe runs the whole handover chain,

```
<endpoint>?skip-entra=1&r=/auth-refresh-inbound?…&polaris-ui-url=/auth-refresh-termination?cb=<fn>
```

which ends on the JSONP `/auth-refresh-termination`, answering `{isSuccess, failReason}`. CMS's
cookies reach Edge by group policy, so the probes work from Edge as well as IE mode.

**The first success wins.** The page navigates (with `location.replace`, so Back doesn't return
to it) to

```
<that endpoint>?r=<OS handover on VCA's host, landing on /VictimsCaseApplication/>
```

with no `skip-entra`, so the real launch goes through `/init` as usual, Entra and the MDS
deposit included. The OS handover writes VCA's ClientVars (the `VCA_JSON`/`VCA_COOKIES` keys in
that environment's config) and, since this change, the session hint.

If nothing answers, the page says no CMS session was found and offers a retry. Each probe's
outcome is listed under the message (`found`, `no session (<failReason>)`, `failed to load`,
`no answer`, `timed out`), which is the first thing to look at when it doesn't work.

`?stay=1` finds the session and shows the link without following it.

### Per environment

`ENVIRONMENTS` in the njs, keyed by the Polaris host the page is served on. Any other host
answers 404. Only QA is filled in:

| | QA |
|---|---|
| Polaris host | `polaris-qa-notprod.cps.gov.uk` (handover bundle `global-components/test/auth-handover.js`) |
| VCA host | `cps-tst.outsystemsenterprise.com`. VCA is staying on `outsystemsenterprise.com`, **not** moving to oapps, so neither the oapps default nor the os-switch pin applies. |
| Probes, in order | `/auth-refresh-outbound` (follows the hint, else the default CMS, cin3), `https://cin3.cps.gov.uk/polaris` (real cin3), `/polaris` (the proxied CMS). cin2/4/5 have no `/polaris` of their own; they are reached through the proxied one. |

Order matters only when more than one session is live: the first wins.

## What it depends on

- **Polaris's `skip-entra` patch** (`infra/proxy/polaris-pending/auth-handover.drop2.entra/skip-entra.patch`).
  Wherever `/init` runs drop2's Entra round trip (QA, UAT and dev today), Entra answers the
  silent sign-in with an HTML page, which the browser refuses as a script
  (`ERR_BLOCKED_BY_ORB`). Without the patch, a live session reads as `failed to load`. QA was
  hand-patched on 2026-11-20. Any Polaris deploy to QA erases it, so check the ledger first.
- **The handover's allow-list.** Polaris's `AUTH_HANDOVER_WHITELIST` must allow VCA's host (QA
  allows `https://cps-tst.outsystemsenterprise.com/`).
- **Config with the VCA keys** for VCA's host. QA's `config.test.cps.json` has them. **Prod's
  config deliberately doesn't**: adding them gives every prod user one extra token hop at
  handover. Decide that before any prod rollout.

## Deploying

`scripts/deploy-launch-vca.local.sh` (gitignored, like the other deploy helpers): builds, checks
the files, uploads the `.js` then the `.conf` to `features/global-components.launch-vca/` in the
config blob container, and restarts the App Service. Dry run by default.

```
DRY_RUN=0 ./scripts/deploy-launch-vca.local.sh deploy
```

Then open `/launch-vca?stay=1` in Edge while logged in to CMS: it should list one `found`.

## Removing it

`DRY_RUN=0 ./scripts/deploy-launch-vca.local.sh remove`, then delete this folder, its line in
`scripts/build.sh`, its test in `package.json`, its docker layer
(`docker/docker-compose.launch-vca.yml` and its block in `run-tests.sh`), and its section in
`infra/proxy/README.md`. Nothing else depends on it.

## Tests

- **Unit** (`tests/…unit.test.js`, in `pnpm test`): the route (hosts, methods, headers), the
  page config, and the page's own script run in a node vm against a fake browser: probe URL
  shape, order, first winner, timeouts, late answers, nothing found, `stay`.
- **Integration** (`tests/…integration.test.js`, layer `launch-vca` in `run-tests.sh`): the conf
  loads beside everything else, the njs loads under real njs, and the route answers per Host.
