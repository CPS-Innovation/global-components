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

## Applying

**For the PR**, in a Polaris worktree off `origin/development` (from its repo root). The path below is the main checkout; use this branch's worktree until it merges:

```
git apply --check ~/code/CPS/global-components/infra/proxy/polaris-pending/auth-handover.drop2.entra/*.patch
```

```
git apply ~/code/CPS/global-components/infra/proxy/polaris-pending/auth-handover.drop2.entra/*.patch
```

Then run the feature's tests in `polaris-terraform/main-terraform/proxy/config/features/auth-handover.drop2.entra/`:

```
node auth-handover.drop2.entra.unit.test.js
```

**To re-apply to an environment by hand** (only `claims-cookie.patch`; the others are tests and
docs):

1. Download the deployed blob and keep a copy as the rollback.
2. Check it still matches the base: `patch --dry-run <file> < claims-cookie.patch` must apply cleanly. If it doesn't, the
   deployed file has moved on. Stop and rebase the patch.
3. Apply, upload, restart the App Service, and check the proxy answers `200`.
4. Verify as in the ledger entry. To roll back, upload the copy and restart.

Record every hand-patch, and every Polaris deploy that erased one, in the ledger entry.
