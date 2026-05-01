# Deploy workflows

Each environment (`accessibility`, `dev`, `test`, `prod`) is deployed to its own Azure blob
container of the same name, plus a sibling static-web path under `$web/<env>/static/` for the
HTML harness.

## Entry-point workflows

| Workflow                    | Trigger             | Environments                                |
| --------------------------- | ------------------- | ------------------------------------------- |
| `deploy-ci-cd-pre-prod.yml` | push to `main`      | accessibility, dev, test                    |
| `deploy-all.yml`            | manual, from `main` | accessibility, dev, test, prod              |
| `rollback.yml`              | manual, from `main` | accessibility, dev, test (HEAD^ redeployed) |

All three call `sub-workflow-core-deploy.yml`, which fans out over the env matrix into
`sub-workflow-deploy-script.yml` (blob container) and `sub-workflow-deploy-harnesses.yml`
(static-web harness).

## Files deployed to `<env>/` blob container

Every env gets the same filenames. Content of the stub and JSON configs varies per env; all
other files are byte-identical across envs.

| File                                   | Source                                      | Per-env variation                                                                                                        |
| -------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `global-components.js` (+ `.map`)      | `packages/cps-global-components/dist/`      | none — byte-identical                                                                                                    |
| `cps-global-components.js`             | `packages/cps-global-script-redirect/dist/` | `script.src` substituted from `REDIRECT_SCRIPT_URL` at deploy time                                                       |
| `auth-handover.js` (+ `.map`)          | `packages/cps-global-os-handover/dist/`     | none — byte-identical (folded MSAL termination on the `os-ad-redirect` dispatch fetches AD_CLIENT_ID / AD_TENANT_AUTHORITY from sibling `config.json` at runtime; cookie/token return paths skip the fetch) |
| `global-components-msal-redirect.html` | `packages/cps-global-auth/`                 | none — byte-identical (same-origin termination page; loader script injects sibling `msal-redirect.js` for top-frame loads, bails for silent-SSO iframes); referenced from `msalRedirectUrl` in configs |
| `msal-redirect.js` (+ `.map`)          | `packages/cps-global-auth/dist/`            | none — byte-identical IIFE bundle; loaded by `global-components-msal-redirect.html` and fetches sibling `config.json` for `AD_CLIENT_ID` / `AD_TENANT_AUTHORITY` before running `handleRedirectPromise()` |
| `probe-iframe-load.html`               | `packages/cps-global-components/src/services/diagnostics/` | none — byte-identical (LNA diagnostic probe page)                                                         |
| `config.json`                          | `configuration/config.<env>.json`           | entire contents                                                                                                          |
| `preview/`                             | `packages/cps-global-preview/dist/`         | none — byte-identical                                                                                                    |
| `accessibility/`                       | `packages/cps-global-accessibility/dist/`   | none — byte-identical                                                                                                    |

Conditional — only uploaded when the source file exists:

| File                | Source                                         |
| ------------------- | ---------------------------------------------- |
| `notification.json` | `configuration/config.<env>.notification.json` |

Current source-file matrix:

| Env           | `notification.json` |
| ------------- | :-----------------: |
| accessibility |          —          |
| dev           |          —          |
| test          |          ✓          |
| prod          |          —          |

## Redirect stub (`cps-global-components.js`)

This file is the legacy URL; host apps that still point at `<env>/cps-global-components.js`
get redirected to the real bundle. The stub ships from the build with two placeholders —
`{{SCRIPT_URL}}` and `{{BEACON_URL}}` — that `sub-workflow-deploy-script.yml` substitutes
at deploy time via `sed`.

**`{{SCRIPT_URL}}`** — the redirect target. Sourced from the env's `REDIRECT_SCRIPT_URL`
in `config.json`. Fallback: `./global-components.js` (same-origin sibling).

| Env           | Stub target                                                                         |
| ------------- | ----------------------------------------------------------------------------------- |
| dev           | `https://polaris-qa-notprod.cps.gov.uk/global-components/dev/global-components.js`  |
| test          | `https://polaris-qa-notprod.cps.gov.uk/global-components/test/global-components.js` |
| prod          | `https://polaris.cps.gov.uk/global-components/prod/global-components.js`            |
| accessibility | `./global-components.js` (default — no `REDIRECT_SCRIPT_URL` in config)             |

**`{{BEACON_URL}}`** — a beacon the stub fires via `new Image().src` before creating the
redirect script tag. Substituted to
`https://<account>.blob.core.windows.net/<env>/legacy-caller-beacon`. The stub appends
`?page=<encoded window.location.href>` at runtime. No file needs to exist at that path —
blob storage logs 404s, and the query string reveals which host page loaded the legacy URL
(blob `Referer` is routinely empty in diagnostics). The account name is extracted from
`BLOB_STORAGE_CONNECTION_STRING` in the workflow, same pattern as `sub-workflow-deploy-harnesses.yml`.

## Artifact isolation

`sub-workflow-deploy-script.yml` downloads the build artifact into `./to-deploy/` (set via the
`path:` input on `actions/download-artifact`). `az storage blob upload-batch --source ./to-deploy`
uploads only that directory — nothing else from the checked-out repo. Keep `--source` pointed at
`./to-deploy` to avoid leaking workflow files, scripts, lockfiles, or configuration overrides from
other environments into the container.

`upload-batch` only adds or overwrites blobs with the same name; it does **not** delete blobs
that aren't in the source. Cruft from past deploys has to be purged manually with
`az storage blob delete-batch`.

## Harness

`sub-workflow-deploy-harnesses.yml` builds `apps/harness-html` with
`GLOBAL_SCRIPT_URL=https://<account>.blob.core.windows.net/<env>/global-components.js` and uploads
the result to `$web/<env>/static/` on the same storage account. That path is what
`config.<env>.json` references in test-data `path` patterns.
