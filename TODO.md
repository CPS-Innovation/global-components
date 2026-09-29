# TODO: OutSystems multi-targeting (QA) and the oapps cutover

Branch: `feature/FCT2-22132_allow_oapps_os_domain_switching`. Work top to bottom: each phase
depends on the ones above it. Background and reference material are at the end.

## 0. Tidy the branch

- [x] Decide what to do with the uncommitted changes to `infra/proxy/config/main/cmsenv.js` and
      `infra/proxy/config/main/nginx-full.conf`. They aren't part of this work.
- [x] Commit, raise the PR, and merge once CI is green (unit tests, config validation, the CSP
      generated-artifact check).

## 1. Release the stable cut (normal release workflow)

- [x] Deploy dev → test → UAT → prod. The test variant configs (`config.oapps.json`,
      `config.cps-lon.json`) upload with it and stay unused until phase 3.
- [x] Smoke test on test:
  - header and menu on the OutSystems pages and on CWA
  - a `triage-submission` event arrives
- [x] Expected: `cpslon*` pages show the header with a "No context found" menu and no auth.
      In test that lasts until phase 3.

## 2. Prerequisites for QA multi-targeting

These are additive and harmless, but must all be done before anyone switches (phase 5).
Otherwise a switched user's CWA links get a 403 from `/init`'s whitelist.

For **`oapps-qa-notprod.int.cps.gov.uk`**:

- [x] AAD app reg: both SPA redirect-URI forms, with the test `src` (see reference below).
- [x] `AUTH_HANDOVER_WHITELIST`: `https://oapps-qa-notprod.int.cps.gov.uk/Casework_Patterns/auth-handover.html`.
- [x] `/api/cms-modern-token` backend: accepts a return URL on this host. (No allowlist: `GetCmsModernToken.cs` in PolarisDDEI redirects to any `r`.)
- [x] `https://oapps-qa-notprod.int.cps.gov.uk/Casework_Patterns/auth-handover.html` is served.

For **`cpslon-tst.outsystemsenterprise.com`**:

- [x] AAD app reg: both SPA redirect-URI forms, with the test `src`.
- [x] `AUTH_HANDOVER_WHITELIST`: `https://cpslon-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html`.
- [x] `/api/cms-modern-token` backend: accepts a return URL on this host. (No allowlist: `GetCmsModernToken.cs` in PolarisDDEI redirects to any `r`.)
- [x] `https://cpslon-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html` is served.

In this repo:

- [x] Make the `urlRegex` values in `configuration/config.*.notification.json` host-agnostic.
      They currently hard-code `\\.outsystemsenterprise\\.com`. Ship it in a release.

## 3. vnext proxy (ours)

- [x] Run `pnpm -w test:proxy` and fix anything it finds. The vnext integration tests for
      variants and the switch have never been run.
- [x] Before deploying: add `CPS_GLOBAL_COMPONENTS_BLOB_STORAGE_DOMAIN` to
      `REQUIRED_APP_SETTINGS` and `'${CPS_GLOBAL_COMPONENTS_BLOB_STORAGE_DOMAIN}'` to
      `REQUIRED_PLACEHOLDERS` in `infra/proxy/scripts/deploy-vnext.local.sh` (gitignored, local).
      The `config.json` route now uses it, and a missing app setting stops nginx starting.
- [ ] Deploy vnext to the **QA** proxy from this branch with `deploy-vnext.local.sh`. It uploads
      the working tree, so it includes the swagger fix from #1134 and the switch from #1126.
      There's no status/version route any more. To confirm it's live, check the routes below,
      which only exist on the new vnext: `/os-target/test` is a 404 before and JSON after, and
      the `X-Gloco-Config` header is absent before and present after. Swagger
      (`/global-components/swagger.json`) should still work.
- [ ] Smoke test:
  - `GET /global-components/test/config.json` returns `X-Gloco-Config: config.json`
  - with `Origin: https://oapps-qa-notprod.int.cps.gov.uk` it returns `config.oapps.json`
  - `GET /global-components/os-target/test` lists `oapps` and `cps-lon`
- [ ] From here, pages opened directly on oapps or London in test get a working component.
- [ ] Hold the **prod** proxy deploy until QA has run for a while. It takes over the
      `config.json` route there too, even though prod has no variants.

## 4. Polaris PRs (yours)

- [ ] `/init`: port `_toOsTarget` and the `appAuthRedirect` change from our
      `infra/proxy/config/main/nginx.js`, plus the "OS switch" tests in `nginx.unit.test.ts`.
      Keep the rule that a rewrite is only used if `AUTH_HANDOVER_WHITELIST` accepts it.
      njs has no destructuring and no `URL` class.
- [ ] Main-conf changes from this branch (`infra/proxy/config/main/global-components.ts` / `.conf`):
  - `cpslon-tst` in `CORS_ALLOWED_ORIGINS`
  - `/case-review-redirect` accepting a full host
- [ ] Deploy them to QA Polaris.

## 5. Trial on test

- [ ] Preview page: switch to `oapps`.
- [ ] CWA: reload; the menu links point at oapps; clicking one lands you on oapps with CMS auth.
- [ ] C-button lands on oapps.
- [ ] The case-review redirect lands on oapps.
- [ ] A cold-cache MSAL redirect goes through the oapps handover and back.
- [ ] Presence, triage capture and page-view analytics all work on oapps.
- [ ] Repeat for `cps-lon`.
- [ ] Switch back to Default and check you land on `cps-tst` again.
- [ ] Run `check:csp`: `test.oapps` and `test.cps-lon` appear in the report.

## 6. Presence decision (before wider use, and certainly before the prod cutover)

- [ ] Find out whether the `cms-auth-presence-token` cookie lands in Edge's cookie store or
      IE mode's (see the presence notes below).
- [ ] Choose an option (leaning towards not opening the hub connection without a token), then
      implement it and update the comment in `global-components.case-locking.ts`.

## 7. Chunk 2: cutover to oapps, one environment at a time (dev → test → UAT → prod)

Answer these first:

- [ ] Will the old OS hosts redirect to oapps at cutover?
  - If yes: flip our config at cutover, and Polaris updates `/launch` whenever convenient.
  - If no: our config flip and Polaris's `/launch` change have to go out together.
- [ ] Will the config flip ship through the release workflow or `config-sync.sh`?

For each environment (dev, test, UAT, prod):

- [ ] External entries for the new host: AAD URIs (with that environment's `src`), whitelist,
      handover page served. (The cms-modern-token backend has no return-URL allowlist, so it needs
      nothing.)
- [ ] `configuration/config.<env>.json`: find-and-replace the OS host, including the
      regex-escaped form in context paths (e.g. `cps-tst\\.outsystemsenterprise\\.com`). The
      consistency spec catches misses.
- [ ] Polaris `/launch/*` and terraform `case_review_app_redirect_url`
      (`/case-review-redirect/<oapps-host>/<env>`), sequenced according to the redirect answer
      above.
- [ ] Re-run `generate:csp` / `check:csp` in `cps-global-configuration`.
- [ ] Prod only: deploy `infra/analytics/kql/GloCo_PageViews.kql` to the workspace before or
      with the flip.

Afterwards:

- [ ] Once each old host is retired, remove its `CORS_ALLOWED_ORIGINS` entry.
- [ ] Revisit the test variants. After test flips, `config.test.oapps.json` duplicates the base
      config, so either drop it or turn it into a `legacy` variant for the old host. Keep
      `OS_HOST_VARIANTS` in step with the files.

---

## Reference

### Hosts

| Env  | Today                               | After cutover                                      |
| ---- | ----------------------------------- | -------------------------------------------------- |
| dev  | `cps-dev.outsystemsenterprise.com`  | `oapps-dev-notprod.int.cps.gov.uk`                 |
| test | `cps-tst.outsystemsenterprise.com`  | `oapps-qa-notprod.int.cps.gov.uk`                  |
| uat  | `cps-tst1.outsystemsenterprise.com` | `oapps-uat-notprod.int.cps.gov.uk` (assumed shape) |
| prod | `cps.outsystemsenterprise.com`      | `oapps.int.cps.gov.uk`                             |

**Principle: one true OutSystems domain per environment at any given time.**

- Each env config names exactly one OS host, written out literally.
- There's no runtime host rewriting and no multi-host context paths.
- Putting some users on a different host is done by serving them a different config file,
  chosen by a switch.

### What the branch already does

- `is-outsystems-host.ts` recognises `*.outsystemsenterprise.com` and
  `oapps(-<env>-notprod)?.int.cps.gov.uk`, so no code changes at cutover. If UAT's real domain
  doesn't fit, widen the pattern.
- `outsystems-host-consistency.spec.ts`:
  - each config names exactly one OS host
  - each variant (`config.<env>.<variant>.json`) is its environment's config with only the host
    swapped
- The triage shim activates on any host; tests cover it on oapps.
- The FCT2-16735 tasklist reset is gated by `OS_RESET_TASKLIST_FILTERS_ON_FRESH_TOKEN`
  (true in test and UAT).
- The London / FCT2-20670 preview-region work is removed.
- **Multi-targeting:**
  - The switch is the `Gloco-Os-Target-<env>` cookie on the Polaris host: `Path=/`,
    `SameSite=Lax`, `HttpOnly`, and its value is the OS host.
  - It's set via `/global-components/os-target/<env>` from the preview page. Anyone with the
    preview page can switch.
  - The vnext proxy serves `config.json` by the page's `Origin` host first, then the cookie,
    then the base file.
  - `/init` moves the handover onto the switched host.
  - Component and handover code are unchanged.
- The CSP checker probes the variant hosts.
- `GloCo_PageViews.kql` treats the old and oapps prod hosts as one. It's in the repo, not yet
  deployed.

### AAD redirect URIs

App reg `8d6133af-9593-47c6-94d0-5c65e9e310f1` needs both forms as SPA redirect URIs for each
host (per `packages/cps-global-handover/EXTERNAL-ENTRY.md`):

```
https://<host>/Casework_Patterns/auth-handover.html?src=<encoded src>
https://<host>/Casework_Patterns/auth-handover.html?src=<encoded src>&stage=ad-redirect
```

`<encoded src>` for each environment:

- dev: `https%3A%2F%2Fpolaris-qa-notprod.cps.gov.uk%2Fglobal-components%2Fdev%2Fauth-handover.js`
- test: `https%3A%2F%2Fpolaris-qa-notprod.cps.gov.uk%2Fglobal-components%2Ftest%2Fauth-handover.js`
- uat: `https%3A%2F%2Fpolaris-uat-notprod.cps.gov.uk%2Fglobal-components%2Fuat%2Fauth-handover.js`
- prod: `https%3A%2F%2Fpolaris.cps.gov.uk%2Fglobal-components%2Fprod%2Fauth-handover.js`

### Presence notes (phase 6)

- On oapps pages, which are same-site with Polaris, the `SameSite=Lax`
  `cms-auth-presence-token` cookie (`Path=/global-components/case-locking`, set by the
  CMS-estate auth callback) will start being sent with the component's requests.
- `presenceBearer` still lets a client `Authorization` header win. The difference is when the
  component has **no** MSAL token: today that negotiate request gets a 401; on oapps it would
  authenticate with the CMS-estate token instead.
- Only negotiate and REST calls are affected. After negotiate, the component (SSE or long
  polling) talks to `/api/sr/`, which never reads the cookie.
- **Options:**
  1. Accept it, and update the comment.
  2. _(leaning)_ Don't open the hub connection without a token (`case-locking-presence.ts`).
  3. Only let `presenceBearer` fall back to the cookie for CMS-estate callers, by `Origin`.
     This is fragile, since CMS hosts are under `.cps.gov.uk` too.

### What to expect on each cutover day

- Every user starts with empty per-origin state on the new host: MSAL cache, OS ClientVars and
  CMS auth.
  - The first OS page load does one AAD round trip, through the new host's handover.
  - CMS auth arrives through the C-button / handover chain.
- Old-host bookmarks stop getting a working component once the config moves. If the old host
  stays live, that's for OutSystems or infra to handle with a redirect, not for multiple hosts
  in our config.
