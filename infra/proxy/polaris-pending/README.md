# Polaris pending

Changes we need in **Polaris's** proxy code that can't be deployed as an override from our side, kept
here as patches until the PR carrying them merges and deploys.

Two homes for changes headed into Polaris:

- **[`config/global-components.vnext/`](../config/global-components.vnext/README.md)** — for
  routes Polaris declares as prefix or regex. A regex location of ours beats them, so vnext is the
  deployed advance copy *and* the PR source (bronze → silver).
- **Here** — for everything else: Polaris code reached through an exact-match (`=`) location, which
  nothing of ours can beat (a duplicate `=` stops nginx starting), or code that isn't a route at all.

**Nothing here is deployed by any script.** It sits outside `config/`, so `build.sh`, the deploy
scripts and `features.unit.test.js` never see it. Any environment running one of these changes
was hand-patched, and the ledger below says where.

**Patches, not copies.** Each patch is relative to the Polaris repo root and records its base
commit. `git apply --check` against current `development` either applies or names the hunk that
moved, so drift is loud. A full copy would go stale silently.

**No cross-repo tests.** Polaris's tests live in the patch (`*.tests.patch`) and run in Polaris.
Our side of each contract is tested here, in our own modules.

## Ledger

### RPLT-246 — handover claims cookie (`auth-handover.drop2.entra`)

| | |
|---|---|
| What | The `/init` iframe callback sets `cps-handover-claims`: the reader's app-assigned Entra groups from **our** id_token, signed with `ENTRA_STATE_HMAC_SECRET`, `Path=/global-components/presence-jsonp/whoami`. |
| Why not vnext | `= /init/entra-callback` is an exact match, and the id_token exists only inside that callback. |
| Our side | `config/global-components.watchdog/`: the whoami sub-path verifies the cookie (HMAC, `k`/`v`, `oid` bound to the presence token). Tested in its unit and integration tests. |
| Patches | [`auth-handover.drop2.entra/`](auth-handover.drop2.entra/): `claims-cookie.patch` (the `.js`, +48), `claims-cookie.tests.patch` (9 tests; the suite is 111/111), `claims-cookie.docs.patch` (QUIRKS E15, APP-SETTINGS prerequisite). |
| Base | Polaris `origin/development` @ `570d671af` |
| QA | **Hand-patched 2026-11-13** (blob `features/auth-handover.drop2.entra/auth-handover.drop2.entra.js` in `sacpsqapolaris/content`). Any Polaris deploy to QA erases it. |
| UAT, prod | Not applied. |
| PR | Not raised yet. |
| Verify | In Classic (IEChooser, top frameset), after `__ccAuthHandover.runNow()`, a same-origin XHR to `/global-components/presence-jsonp/whoami?callback=w` answers `"groupsFrom":"cookie"`. `no-cookie` means the patch isn't there (or was erased). |
| Retire | Delete this entry and its folder once the PR has merged and deployed to every environment. |

### RPLT-246 Phase A — Entra rollout by CMS user id (`auth-handover`)

| | |
|---|---|
| What | `/init`'s drop2 decision (`_entraOn` → `_entraDecision`) gains a third way in: the CMS user id mod 100 below `ENTRA_ROLLOUT_PERCENT`. The id is `UID`, else a single `CMSUSER<id>` (several distinct ids = ambiguous = out), read from the CMS jar `/polaris` forwards as the `cookie` arg, never the request's own `Cookie` header. Covers the P button and the hidden iframe alike (outside: iframe → `/init/terminal`, P → the usual `cc` 302). Every `/init` writes the decision into `Cms-Session-Hint` as `entraEnabled` and logs an `entra-decision` line (bucket and percent, never the id). |
| Why not vnext | `/init` is Polaris's `auth-handover` feature, not a route vnext can shadow, and the decision is plain code. |
| Our side | `config/global-components.watchdog/`: whoami returns `entraEnabled` (true / false / null). `packages/cps-global-presence` viewer: `false` settles at once (one whoami), and the client shuts both presence gates, the preview flag included. `null` (no flag, or a Polaris without this patch) keeps today's behaviour. |
| Patches | [`auth-handover/`](auth-handover/): `entra-rollout.patch` (the `.js`), `entra-rollout.tests.patch` (18 tests; the suite is 72/72), `entra-rollout.terraform.patch` (`proxy_entra.rollout_percent` → `ENTRA_ROLLOUT_PERCENT` on both slots, `0` in every tfvars, the mock env), `entra-rollout.docs.patch` (APP-SETTINGS row, `/init` conf comment). |
| Base | Polaris `origin/development` @ `ca681939d`. Applies together with the claims-cookie patches above; with both, the whole Polaris njs unit suite passes. |
| QA | Not applied. QA has `store_enabled = true`, so everyone is in and `entraEnabled` would read `true` (via=global). |
| UAT, prod | Not applied. Prod (`store_enabled = false`) is where the percentage does the work. |
| PR | Not raised yet. Goes with the claims-cookie PR: both change `/init`. |
| Verify | In Classic after `__ccAuthHandover.runNow()`, `__ccPresence.whoami().entraEnabled` is `true`/`false`, not `null`. The App Service log has `auth-handover entra-decision on=… via=… bucket=… percent=…` per `/init`. |
| Retire | With the claims-cookie entry. |

### RNAV-2 — C button keeps the case (`app-launch`)

| | |
|---|---|
| What | `/launch/<key>` reads the `q={"caseId":<id>}` CMS already adds on a case page, and lands on `/WorkManagementApp/CaseOverview?CaseId=<id>` on that target's OutSystems host. No valid `q` lands on the casework home page, as before. |
| Why not vnext | It could be: `location /launch/` is a prefix, so a regex of ours would beat it. A patch was chosen so the Polaris PR carries one reviewed commit. |
| Our side | `global-components.os-london-dublin-oapps-switch` builds its own launch URL for users pinned to an OS domain, and applies the same rule. `cps-global-os-handover` also sets the CMS session hint when landing on `/WorkManagementApp/`. |
| Patches | [`app-launch/`](app-launch/): `c-button-case-context.patch` (the `.js`), `c-button-case-context.tests.patch` (21 tests; the feature suite is 39/39), `c-button-case-context.docs.patch` (QUIRKS). |
| Base | Polaris `origin/development` @ `e7fd48270`. |
| QA | **Hand-patched 2026-11-18** (blob `features/app-launch/app-launch.js` in `sacpsqapolaris/content`). Any Polaris deploy to QA erases it. |
| UAT, prod | Not applied. |
| PR | Not raised yet. |
| Verify | `curl -sI "https://polaris-qa-notprod.cps.gov.uk/launch/cin3-proxy?q=%7B%22caseId%22%3A2194728%7D"` answers a `location` containing `CaseOverview`; without `q` it contains `casework`. Then press C on a case and off a case in Classic. |
| Retire | Delete this entry and its folder once the PR has merged and deployed to every environment. |

## Applying

**For the PR**, in a Polaris worktree off `origin/development` (from its repo root). The path below is the main checkout; use this branch's worktree until it merges:

```
git apply --check ~/code/CPS/global-components/infra/proxy/polaris-pending/auth-handover.drop2.entra/*.patch ~/code/CPS/global-components/infra/proxy/polaris-pending/auth-handover/*.patch
```

```
git apply ~/code/CPS/global-components/infra/proxy/polaris-pending/auth-handover.drop2.entra/*.patch ~/code/CPS/global-components/infra/proxy/polaris-pending/auth-handover/*.patch
```

Then run the njs unit suite from `polaris-terraform/main-terraform/proxy/` (it covers both
features, `auth-handover.drop2.entra` and `auth-handover`):

```
bash tests/unit/run-tests.sh
```

**To re-apply to an environment by hand** (only `claims-cookie.patch`, `entra-rollout.patch` and `c-button-case-context.patch`;
the others are tests, terraform and docs. `entra-rollout.patch` without its terraform reads an
unset `ENTRA_ROLLOUT_PERCENT` as 0, which changes nothing but adds the hint flag and the log line):

1. Download the deployed blob and keep a copy as the rollback.
2. Check it still matches the base: `patch --dry-run <file> < claims-cookie.patch` must apply cleanly. If it doesn't, the
   deployed file has moved on. Stop and rebase the patch.
3. Apply, upload, restart the App Service, and check the proxy answers `200`.
4. Verify as in the ledger entry. To roll back, upload the copy and restart.

Record every hand-patch, and every Polaris deploy that erased one, in the ledger entry.
