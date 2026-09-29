# TODO: OutSystems multi-targeting (QA) and the oapps cutover

Branch: `feature/FCT2-22099_CSP_rules`.

## Background

OutSystems is moving behind CPS reverse proxies, one per environment. It's a pure host swap:
same paths, same apps.

| Env  | Today                               | After cutover                       |
| ---- | ----------------------------------- | ----------------------------------- |
| dev  | `cps-dev.outsystemsenterprise.com`  | `oapps-dev-notprod.int.cps.gov.uk`  |
| test | `cps-tst.outsystemsenterprise.com`  | `oapps-qa-notprod.int.cps.gov.uk`   |
| uat  | `cps-tst1.outsystemsenterprise.com` | `oapps-uat-notprod.int.cps.gov.uk` (assumed shape) |
| prod | `cps.outsystemsenterprise.com`      | `oapps.int.cps.gov.uk`              |

**Principle: one true OutSystems domain per environment at any given time.**
- Each env config names exactly one OS host, written out literally.
- There's no runtime host rewriting, no per-user host pins in the component, and no
  multi-host alternation in context paths.
- Putting some users on a different host is done by serving them a **different config
  file**, chosen by a switch that's known at C-button time (see multi-targeting below).

### Baseline (done)

- **`is-outsystems-host.ts`** (`packages/cps-global-configuration`) is the single answer to
  "is this OutSystems?".
  - It recognises `*.outsystemsenterprise.com` and `oapps(-<env>-notprod)?.int.cps.gov.uk`.
  - Used by `isOutSystemsApp` (the `isOutSystems` flag and the menu/banner link adapter) and
    by the CSP check targets.
  - It only classifies a host, so no code changes at cutover. If UAT's real domain doesn't
    fit the pattern, widen it first.
- **`outsystems-host-consistency.spec.ts`:**
  - each env config names exactly one OS host across its URLs, and every OS context path
    matches that host
  - each variant (`config.<env>.<variant>.json`) is its environment's config with only the
    host swapped
- **The triage shim's activation regex** no longer depends on the host.
- **The FCT2-16735 tasklist-filter reset** is gated by
  `OS_RESET_TASKLIST_FILTERS_ON_FRESH_TOKEN` (true in test and uat), not by a `cps-tst`
  hostname check.
- **nginx `/case-review-redirect/{osHost}/{envFolder}`** accepts a full host (restricted to
  `*.cps.gov.uk` / `*.outsystemsenterprise.com`) as well as the old subdomain form.
- **Removed: the London / FCT2-20670 preview-region work.**
  - The component no longer loads on `cpslon*`, except test through the `cps-lon` variant.
  - This doesn't matter in UAT or prod: London never ran in prod, and UAT is unrestricted.
- **CORS:** `oapps-*` hosts end in `.cps.gov.uk`, which the suffix rule in `readCorsOrigin`
  already allows. They're also same-site with `polaris-*.cps.gov.uk`, so the state cookies
  are first-party.

### Multi-targeting in QA: how it works

- **Variant configs:**
  - `configuration/config.test.oapps.json` (`oapps-qa-notprod.int.cps.gov.uk`)
  - `configuration/config.test.cps-lon.json` (`cpslon-tst.outsystemsenterprise.com`)
  - Both deploy as `test/config.<variant>.json` (deploy workflow and `config-sync*.sh`).
- **The switch** is the `Gloco-Os-Target-<env>` cookie on the Polaris host.
  - `Path=/`, `Secure`, `HttpOnly`, `SameSite=Lax`, and its value is the OS host.
  - It's per environment because dev and test share `polaris-qa-notprod`.
  - Set via `PUT`/`DELETE /global-components/os-target/<env>`, from the preview page's
    "OutSystems host" control. Anyone with access to the preview page can switch.
- **The vnext proxy** (`infra/proxy/config/global-components.vnext`):
  - `OS_HOST_VARIANTS` maps each variant to its host. A unit test checks it against the
    variant files in both directions.
  - `/global-components/<env>/config.json` serves, in order of preference: the variant for
    the requesting OS page's own host (by `Origin`); the variant the cookie names (CWA); or
    `config.json`.
  - Config always matches the page it's running on, because auth state is per origin.
- **Polaris `/init` (`appAuthRedirect`)** is where every route into OutSystems passes
  through: the C-button, CWA links and case-review. It forces Edge mode, so it can read the
  cookie.
  - Drafted as `_toOsTarget` in our copy, `infra/proxy/config/main/nginx.js`.
  - It works out the environment from the handover's `src`, then swaps the host in `r` and
    in its nested destination.
  - It only uses the swap if `AUTH_HANDOVER_WHITELIST` accepts it, so a stale cookie never
    causes a 403.
  - Polaris's `/launch/*` doesn't change.
- **Component and handover code are unchanged.**
- **The live CSP checker** also probes the variant hosts (`test.oapps`, `test.cps-lon`).
- **Analytics:** `GloCo_PageViews.kql` folds `cps.outsystemsenterprise.com` and
  `oapps.int.cps.gov.uk` into one `OsUrl` prefix, so history is continuous. It's in the
  repo, not yet deployed.

### Reference: AAD redirect URIs

App reg `8d6133af-9593-47c6-94d0-5c65e9e310f1` needs both forms as SPA redirect URIs for
each host (per `packages/cps-global-handover/EXTERNAL-ENTRY.md`):

```
https://<host>/Casework_Patterns/auth-handover.html?src=<encoded src>
https://<host>/Casework_Patterns/auth-handover.html?src=<encoded src>&stage=ad-redirect
```

`<encoded src>` for each environment:
- dev: `https%3A%2F%2Fpolaris-qa-notprod.cps.gov.uk%2Fglobal-components%2Fdev%2Fauth-handover.js`
- test: `https%3A%2F%2Fpolaris-qa-notprod.cps.gov.uk%2Fglobal-components%2Ftest%2Fauth-handover.js`
- uat: `https%3A%2F%2Fpolaris-uat-notprod.cps.gov.uk%2Fglobal-components%2Fuat%2Fauth-handover.js`
- prod: `https%3A%2F%2Fpolaris.cps.gov.uk%2Fglobal-components%2Fprod%2Fauth-handover.js`

## QA multi-targeting: to get it working on test

- [ ] Run the proxy integration tests: `pnpm -w test:proxy`. They include six new vnext
      tests; none have been run yet.
- [ ] **Polaris PR for `/init`:** transpose `_toOsTarget` and the `appAuthRedirect` change
      from `infra/proxy/config/main/nginx.js`, plus the "OS switch" tests in
      `nginx.unit.test.ts`. Note that njs has no destructuring and no `URL` class.
- [ ] **Polaris PR for main-conf CORS:** add `https://cpslon-tst.outsystemsenterprise.com`
      to `CORS_ALLOWED_ORIGINS` in `infra/proxy/config/main/global-components.ts`.
- [ ] Deploy the vnext layer (`infra/proxy/deploy/deploy.sh`).
- [ ] Deploy the variant configs, via the release workflow or `scripts/config-sync.sh`.
- [ ] **External entries,** for both `oapps-qa-notprod.int.cps.gov.uk` and
      `cpslon-tst.outsystemsenterprise.com`:
  - [ ] AAD redirect URIs, both forms, with the test `src` (see the reference above).
  - [ ] `AUTH_HANDOVER_WHITELIST`: add `https://<host>/Casework_Patterns/auth-handover.html`.
  - [ ] `/api/cms-modern-token` backend (behind `/auth-refresh-cms-modern-token`): confirm it
        accepts a return URL on `<host>`, or add it to the allowlist if there is one.
  - [ ] Confirm `https://<host>/Casework_Patterns/auth-handover.html` is served.
- [ ] **Notifications:** `configuration/config.*.notification.json` `urlRegex` values
      hard-code `\\.outsystemsenterprise\\.com`, so they won't match on oapps pages. Make
      them host-agnostic.
- [ ] **Trial on test:**
  - switch via the preview page
  - C-button, CWA menu links, case-review redirect
  - cold-cache MSAL redirect
  - switching back to Default

## Presence on oapps: to discuss

- On oapps pages (same-site with Polaris), the `SameSite=Lax` `cms-auth-presence-token`
  cookie (`Path=/global-components/case-locking`, set by the CMS-estate auth callback) will
  start being sent with the component's requests.
- `presenceBearer` still lets a client `Authorization` header win. The difference is when
  the component has **no** MSAL token: today that negotiate request gets a 401; on oapps it
  would authenticate with the CMS-estate token instead.
- The component uses SSE or long polling, so after negotiate it talks to `/api/sr/`, which
  never reads the cookie. So only negotiate and REST calls are affected.
- **Options:**
  1. Accept it, and update the comment in `global-components.case-locking.ts`.
  2. *(leaning)* Don't open the hub connection without a token (`case-locking-presence.ts`).
  3. Only let `presenceBearer` fall back to the cookie for CMS-estate callers, by `Origin`.
     This is fragile, since CMS hosts are under `.cps.gov.uk` too.
- **Open question:** does the presence cookie end up in Edge's cookie store or IE mode's?
  If IE mode, the case never happens.

## Chunk 2: the per-environment cutover to oapps

For each environment:

- [ ] External entries: AAD URIs (with that environment's `src`), the whitelist entry, the
      cms-modern-token backend, and confirming the handover page is served on the new host.
- [ ] `configuration/config.<env>.json`: find-and-replace the OS host, including the
      regex-escaped form in context paths (e.g. `cps-tst\\.outsystemsenterprise\\.com`).
      The consistency spec catches misses.
- [ ] Polaris `/launch/*` (their nginx; `infra/proxy/config/main/nginx-full.conf` here is a
      reference copy, not deployed): repoint the hard-coded handover and the double-encoded
      destination.
- [ ] Polaris terraform `case_review_app_redirect_url`: change to
      `/case-review-redirect/<oapps-host>/<env>`.
- [ ] Re-run the CSP tooling (`generate:csp` / `check:csp` in `cps-global-configuration`).
- [ ] After the old host is retired: remove its `CORS_ALLOWED_ORIGINS` entry.
- [ ] Prod only: deploy the `GloCo_PageViews.kql` change before or with the prod cutover.

What to expect on the day:

- Every user starts with empty per-origin state on the new host: MSAL cache, OS ClientVars
  and CMS auth.
  - The first OS page load does one AAD round trip, through the new host's handover.
  - CMS auth arrives through the C-button / handover chain.
- Old-host bookmarks stop getting the component once the config moves. If the old host
  stays live, that's for OutSystems or infra to handle with a redirect, not for multiple
  hosts in our config.

Open questions:

- Will the old OS hosts redirect to oapps at cutover?
  - If yes: flip our config at cutover, and Polaris updates `/launch` whenever convenient.
  - If no: our config flip and Polaris's `/launch` change have to go out together.
- Does the config flip ship through the release workflow or `config-sync.sh`?
