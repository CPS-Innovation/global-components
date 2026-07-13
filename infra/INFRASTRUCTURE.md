# Global Components — Infrastructure Summary

An "if I were to Terraform this up" checklist of the Azure + Entra resources this
project **owns**. Everything below is derived from what the repo actually
references (`configuration/config.*.json`, `infra/analytics/scripts/.env`,
the GitHub deploy workflows, and the proxy config). Values marked _⚠ confirm
via az_ still need to be checked against the live resource — commands are at the
bottom.

> Scope note: this covers resources **we** own, plus (§6) the Polaris nginx
> **proxy** config we author but don't deploy. The OutSystems tenants, the CMS
> upstream, and the `WM_MDS` Azure Functions backend are **host/parent-project**
> dependencies we only integrate with — listed under
> [External dependencies](#external-dependencies-not-ours-to-provision) for
> context only.

> Redacted for check-in: subscription IDs and a few identifiers that live only in
> the gitignored `.env` files are shown as `<placeholders>` (`<subscription-id>`,
> `<platform-subscription-id>`, `<workspace-guid>`, `<notifier-client-id>`). Real
> values are in `infra/analytics/scripts/.env` or via the `az` commands at the
> bottom — kept out of git to match the repo's existing posture (`dashboard.json`
> already templates the subscription as `__SUBSCRIPTION_ID__`).

---

## 1. Storage account — static asset hosting

**`sacpsglobalcomponents`** (`*.blob.core.windows.net`)

The single most important resource: it serves the component bundle and the
accessibility static site, and its access logs feed the analytics.

Values confirmed via `az` (2026-07).

| Property                | Terraform concern?   | Value / notes                                                                                                                                 |
| ----------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Account name            | Yes                  | `sacpsglobalcomponents`                                                                                                                       |
| Subscription / RG       | Yes                  | `<subscription-id>` / `rg-global-nav-dev` (uksouth)                                                                                           |
| Kind / SKU              | Yes                  | `StorageV2` / `Standard_LRS`                                                                                                                  |
| TLS / HTTPS-only        | Yes                  | `TLS1_2` / HTTPS-only enabled                                                                                                                 |
| `allowBlobPublicAccess` | Yes                  | **true** (anonymous access is enabled at the account level)                                                                                   |
| Blob containers (live)  | No — CI-owned        | `dev`, `test`, `uat`, `prod`, `staging`, `unstable`, `prod-safe`, `accessibility`, `analytics`, `case-locking`, `msal-test`, `$web`           |
| Container public access | No — CI-owned        | Most are **`container`** (anonymous blob read); **`analytics`** and **`prod-safe`** are **private**                                           |
| Container provisioning  | No — CI-owned        | **Created on demand by CI, not pre-provisioned** — see note below                                                                             |
| Served assets           | No — CI content      | `global-components.js`, `auth-handover.js`, `auth-handover.html`, `statement.html`                                                            |
| Cache-Control on upload | No — CI, upload-time | `max-age=20, stale-while-revalidate=3600, stale-if-error=3600`                                                                                |
| Blob metadata           | No — CI, per-deploy  | `buildsha`, `buildrunid`, `buildtimestamp`, `branch` (stamped per deploy)                                                                     |
| Static website ($web)   | Yes                  | Enabled — web endpoint `https://sacpsglobalcomponents.z33.web.core.windows.net/` (accessibility harness)                                      |
| Diagnostic setting      | Yes                  | ✓ `la-global-nav-dev` on `blobServices/default` — `allLogs` + `Transaction` metrics → workspace `la-global-nav-dev` (feeds `StorageBlobLogs`) |

_Terraform concern? — **Yes** = a property/resource Terraform declares; **No** = not
managed by Terraform (CI-set content, or a CI-owned resource like the containers)._

> **⚠ The blob containers are created on demand by the GitHub Actions deploy, not
> pre-provisioned.** `sub-workflow-deploy-script.yml` runs
> `az storage container create --name <env> --public-access container` (and
> `sub-workflow-deploy-harnesses.yml` similarly) immediately before uploading, so
> a container springs into existence the first time an environment is deployed —
> which is why the account key (not a scoped role) is used and why the live
> container list has grown organically. **Decision: the containers are CI-owned and
> are deliberately NOT managed by Terraform** — do not declare
> `azurerm_storage_container` for them. Leaving them out of Terraform does **not**
> delete them: Terraform only ever touches resources in its own state, so
> CI-created containers sit outside its scope entirely. (Bringing them into TF
> would mean `terraform import`-ing each one and removing the
> `az ... container create` step so the two don't fight — which we are not doing.)

**Terraform checklist**

- `azurerm_storage_account` — `StorageV2`, `Standard_LRS`, `min_tls_version = "TLS1_2"`, `allow_nested_items_to_be_public = true`, `https_traffic_only_enabled = true`, in `rg-global-nav-dev`
- **Containers — NOT in Terraform.** The 12 containers (`dev`/`test`/`uat`/`prod`/`staging`/`unstable`/`accessibility`/`case-locking`/`msal-test`/`analytics`/`prod-safe`/`$web`) are created and owned by CI on demand (see note above). Do **not** declare `azurerm_storage_container` — leaving them out does not delete them.
- `azurerm_storage_account_static_website` (the `z33.web` endpoint)
- `azurerm_monitor_diagnostic_setting` on `blobServices/default` → workspace `la-global-nav-dev` (`allLogs` + `Transaction` metrics)

---

## 2. Log Analytics + Application Insights — telemetry

One App Insights instance shared across **all** environments (env is a dimension
in the telemetry, not a separate resource). Only the **ingestion endpoint**
differs per env — telemetry is routed through the Polaris proxy rather than sent
direct to Azure.

| Property                         | Value / notes                                                                                                                                                                                                                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App Insights Instrumentation Key | `e572c03c-8d38-4771-b193-962f13da1b1a` (identical in dev/test/uat/prod)                                                                                                                                                                                                                                              |
| App Insights Application ID      | `3dafc37d-8c9c-4480-90fc-532ac2b8bba2` (shared)                                                                                                                                                                                                                                                                      |
| Region                           | uksouth (SDK posts to `uksouth-1.in.applicationinsights.azure.com`)                                                                                                                                                                                                                                                  |
| Ingestion endpoint (per env)     | Proxied via `https://{polaris-host}/global-components/analytics/` → proxy `proxy_pass`es to `uksouth-1.in.applicationinsights.azure.com`. Accessibility mode posts **direct**.                                                                                                                                       |
| Log Analytics workspace          | `la-global-nav-dev` · RG `rg-global-nav-dev` · sub `<subscription-id>` · uksouth                                                                                                                                                                                                                                     |
| Workspace GUID (customerId)      | `<workspace-guid>`                                                                                                                                                                                                                                                                                                   |
| Workspace SKU / retention        | `pergb2018` / **30 days**, no daily cap; created 2025-04-29                                                                                                                                                                                                                                                          |
| **Network**                      | ⚠ `publicNetworkAccessForIngestion` **and** `…ForQuery` = **`SecuredByPerimeter`** — the workspace is inside an **Azure Monitor Private Link Scope** (`glob-ampls-uks-vft01`, in sub `<platform-subscription-id>` / RG `uks-rg-vft01`). Ingestion/query are network-restricted; TF must model the AMPLS association. |
| App Insights component           | ✓ `ai-global-nav-dev` (RG `rg-global-nav-dev`, uksouth) — workspace-based; telemetry lands in the `App*` tables (`AppPageViews`/`AppEvents`/`AppExceptions`)                                                                                                                                                         |

**Terraform checklist**

- `azurerm_log_analytics_workspace` `la-global-nav-dev` — `pergb2018`, `retention_in_days = 30`, `internet_ingestion_enabled`/`internet_query_enabled` reflecting `SecuredByPerimeter`
- `azurerm_application_insights` `ai-global-nav-dev` (workspace-based, `workspace_id = <LA>`)
- AMPLS association — the workspace joins private-link scope `glob-ampls-uks-vft01`
  (**`<platform-subscription-id>` / `uks-rg-vft01`** — a shared networking resource likely owned by
  a platform team, so probably a data-source + `azurerm_monitor_private_link_scoped_service`
  rather than something you create)

---

## 3. Analytics content — dashboard, workbook, KQL functions

These live **inside** the Log Analytics workspace / a portal dashboard and are
version-controlled in `infra/analytics/`. Deploy/export tooling is in
`infra/analytics/scripts/` (runs `az rest` / `az monitor log-analytics` via an
SSH bastion — see `AWS_REMOTE` in `.env`).

All live in RG `rg-global-nav-dev` / workspace `la-global-nav-dev`.

| Artifact                  | Resource type                       | Name / GUID                                                   | Source of truth in repo                            |
| ------------------------- | ----------------------------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| Portal dashboard          | `Microsoft.Portal/dashboards`       | `028650ca-6b89-4dc9-a048-70643d7e90de`                        | `infra/analytics/dashboard/dashboard.json`         |
| Workbook                  | `Microsoft.Insights/workbooks`      | `b9e1e051-ca8c-4f5e-9e9f-d6c8acaa1023` (`case-review-totals`) | `infra/analytics/workbook/case-review-totals.json` |
| KQL functions (`GloCo_*`) | LA saved searches (`functionAlias`) | ~30 functions                                                 | `infra/analytics/kql/*.kql` (+ `dependencies.md`)  |

Source tables the functions read: `AppPageViews`, `AppEvents`, `AppExceptions`,
`AppDependencies`, `StorageBlobLogs`. Note `GloCo_BlobLogs.kql` hardcodes proxy
egress IPs (`10.7.204.126` prod, `10.7.198.126` QA) — infra-coupled values.

**Terraform checklist**

- `azurerm_portal_dashboard` (dashboard JSON, subscription ID templated as `__SUBSCRIPTION_ID__`)
- `azurerm_application_insights_workbook` (or `azapi` for `Microsoft.Insights/workbooks`)
- `azurerm_log_analytics_saved_search` × N for the `GloCo_*` functions
  _(note: these are currently deployed imperatively via `functions-deploy.sh`; a
  Terraform import would need the saved-search IDs from `deployed-functions.json`)_

---

## 4. Entra ID (Azure AD) — app registration

**Two app registrations, split by environment tier** (same tenant). A **pre-prod**
registration (`FCT Global Components (dev)`) backs dev/test/uat, and a dedicated
**prod** registration (`FCT Global Components (prod)`) backs production. Entra app
registrations are Terraformable via the `azuread` provider (`azuread_application` /
`azuread_application_redirect_uris`), though many orgs keep them out of TF — either
way this is the authoritative record.

Values below are **confirmed from the live registrations** (`az ad app show`, 2026-07).

| Property                | Pre-prod (dev/test/uat)                                                            | Prod                                   |
| ----------------------- | --------------------------------------------------------------------------------- | -------------------------------------- |
| Display name            | `FCT Global Components (dev)` (name is legacy; it covers dev/test/uat)             | `FCT Global Components (prod)`         |
| Tenant ID               | `00dd0d1d-d7e6-4338-ac51-565339c7088c`                                             | _(same tenant)_                        |
| Authority               | `https://login.microsoftonline.com/00dd0d1d-d7e6-4338-ac51-565339c7088c`          | _(same authority)_                     |
| Client (application) ID | `8d6133af-9593-47c6-94d0-5c65e9e310f1`                                             | `295ecc3c-ae64-45c1-941d-b54b539b30aa` |
| Object ID               | `8ced5c11-0b02-4923-b85e-a1ce3939ec7e`                                             | `c86509e4-bddb-4fc7-825c-45a4921d8605` |
| Sign-in audience        | `AzureADMyOrg` (single tenant) ✓                                                   | `AzureADMyOrg` (single tenant) ✓       |
| Platforms               | **SPA** (MSAL redirect flow, `cacheLocation: localStorage`) **and Web** (confidential client — CMS-auth OIDC, has a client secret) | **SPA** (MSAL redirect flow) |

### API permissions (registered)

Both registrations request **more than the runtime code uses**. At runtime the
component only ever asks for Graph `User.Read` (`AD_GATEWAY_SCOPES`; `get-me.ts`
calls Graph `/me` for department/jobTitle). The two regs carry **different** grants
— Terraform's `required_resource_access` must model each (resolved via `az`, 2026-07).

**Pre-prod reg (`8d6133af`)** — a broad, partly **privileged** grant, all against
Microsoft Graph (`00000003-…`):

| Type      | Permission                                    |
| --------- | --------------------------------------------- |
| Delegated | **User.Read** ← the only one the runtime uses |
| Delegated | User.Read.All                                 |
| Delegated | GroupMember.Read.All                          |
| Delegated | GroupMember.ReadWrite.All                     |
| App role  | User.Read.All                                 |
| App role  | **GroupMember.ReadWrite.All**                 |

**Prod reg (`295ecc3c`)** — a minimal delegated set, Microsoft Graph only:

| Type      | Permission           |
| --------- | -------------------- |
| Delegated | **User.Read**        |
| Delegated | GroupMember.Read.All |

> The Polaris gateway `user_impersonation` scope
> (`…/fa-polaris-qa-gateway/user_impersonation`) is **not** declared on either
> registration's `requiredResourceAccess` — it's requested dynamically at runtime
> from the local `src/config.json` default only; the deployed configs set
> `AD_GATEWAY_SCOPES: ["User.Read"]`, so no env asks for a gateway scope.

**⚠ Pre-prod is over-permissioned — worth a review.** The component's code only
uses `User.Read`, yet the pre-prod registration holds `GroupMember.ReadWrite.All`
and `User.Read.All` as **application roles** (require admin consent, usable via
client-credentials with no signed-in user) plus write-level group scopes. Either
these back a flow not visible in this repo (case-locking? a backend job?) or
they're stale over-grants that should be pruned. The prod reg deliberately keeps
only the minimal delegated set.

**Terraform checklist**

- `azuread_application` ×2 — one per reg (pre-prod `8d6133af`, prod `295ecc3c`),
  `sign_in_audience = "AzureADMyOrg"`; pre-prod is **SPA + Web** with the full
  privileged `required_resource_access` (Graph delegated + app roles), prod is
  **SPA** with the minimal delegated Graph set
- client secret (pre-prod Web platform) → source from Key Vault, not inline
- SPA redirect URIs — the **registered** lists below

### Registered redirect URIs (authoritative, from `az ad app show`)

Entra matches redirect URIs by exact string, so the registrations are the source of
truth — **not** the config. Redirect URIs are **split by tier**: prod handovers on
the prod reg (`295ecc3c`), dev/test/uat handovers on the pre-prod reg (`8d6133af`).
Key observations:

- **Two stage variants**: `&stage=ad-redirect` (MSAL/Polaris path) and
  `&stage=os-ad-redirect` (OutSystems path).
- `global-components-msal-redirect.html` termination-page variants on `housekeeping*`
  hosts appear on both regs (shared, env-less termination pages).

**Prod reg (`295ecc3c`) — SPA:**

- `https://polaris.cps.gov.uk/global-components/prod/auth-handover.html?src=…%2Fprod%2Fauth-handover.js&stage=ad-redirect`
- `https://cps.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=…%2Fprod%2Fauth-handover.js&stage=ad-redirect`
- `https://housekeeping.cps.gov.uk/global-components-msal-redirect.html`

The prod reg has **no** Web-platform redirect URIs registered.

**Pre-prod reg (`8d6133af`) — SPA:** the dev/test/uat handover hosts
(`polaris-qa-notprod`, `polaris-uat-notprod`, `lacc-app-ui-spa-*`, and the `cps-dev` /
`cps-tst` / `cps-tst1` OutSystems tenants), plus the `housekeeping*`
`global-components-msal-redirect.html` termination pages.

**Pre-prod reg (`8d6133af`) — Web platform** (confidential client — CMS-auth OIDC):
✓ confirmed registered

- `https://polaris-qa-notprod.cps.gov.uk/init-v2/callback`
- `https://polaris-qa-notprod.cps.gov.uk/global-components/cms-auth/callback`

> Do **not** call `handleRedirectPromise()` in host context — as a guest
> component it picks up the host app's redirect state (same tenant, different
> client) → AADSTS50196 loops. See `create-msal-instance.ts`.

> The full literal list is retrievable any time via the `az ad app show` command
> in [Verifying against Azure](#verifying-against-azure--az-commands) (`spaRedirects` / `webRedirects`);
> it's intentionally not duplicated here to avoid drift.

### Other Entra app registrations

- **Analytics Teams notifier** — `FCT global components dashboard`, client
  `<notifier-client-id>` (same CPS tenant, `AzureADMyOrg`,
  **public client** ✓). Device-code + refresh-token flow used by
  `infra/analytics/scripts/teams-msg.sh` to post to a Teams chat. Provision if you
  Terraform the analytics tooling.
- **`global-components.cms-auth-v2/` PoC** — a proxy-side CMS auth spike in a
  _different_ tenant (tenant + client ids in the gitignored `.env`, storage
  `saspike`). The current v2 approach is deployed **out-of-band** (by hand), not
  via the main build; the earlier superseded variants are archived under
  `global-components.cms-auth-v2/previous/`. Do **not** provision from the main flow.

---

## 5. CI/CD identity

Deployment (`.github/workflows/`) uploads the built bundle to blob storage using
a **storage account connection string** (account key), stored as the GitHub
Actions secret `BLOB_STORAGE_CONNECTION_STRING`. There is no service principal /
OIDC federation for the asset deploy today.

**Terraform / hardening note:** if formalising, consider replacing the shared
account key with a federated GitHub OIDC credential + `Storage Blob Data
Contributor` role assignment (`azuread_application` + `azurerm_role_assignment`).

---

## 6. Polaris nginx proxy — config we author, the Polaris team deploys

`polaris*.cps.gov.uk` is fronted by an **nginx + njs reverse proxy** (an Azure App
Service). It routes the `/global-components/*` paths the component depends on.
**We do not own or deploy the proxy** — a separate team owns its repo and
deployment pipeline — **but we own the `global-components` slice of its config**
and hand our changes to that team.

**What we maintain here (source of truth in this repo):**

- `infra/proxy/config/main/global-components.conf` — the nginx `location` blocks
- `infra/proxy/config/main/global-components.ts` — the njs module (compiled to
  `templates/global-components.js`, imported as `gloco`) with header / cookie /
  session-hint / state logic
- Integration-tested via `pnpm -w test:proxy` before hand-off; the `vnext` layer
  under `infra/proxy/config/` is where new routing is prototyped before it's PR'd
  into the parent proxy repo (see `infra/proxy/README.md`)

**Routes it provides** (from `global-components.conf`):

| Location                                   | Purpose                         | Upstream / handler                                  |
| ------------------------------------------ | ------------------------------- | --------------------------------------------------- |
| `/global-components/cms-session-hint`      | which cin/cms env + proxied?    | njs `handleSessionHint`                             |
| `/global-components/api/*`                 | MDS/DDEI API surface            | `${WM_MDS_BASE_URL}` (+ `x-functions-key`)          |
| `/api/global-components/*`                 | legacy cookie-path clients      | rewrite → `/global-components/api/*`                |
| `/global-components/{dev,test,uat,prod}/*` | static bundle assets            | blob `${CPS_GLOBAL_COMPONENTS_BLOB_STORAGE_DOMAIN}` |
| `/global-components/state/*`               | cookie-backed state (preview…)  | njs `handleState`                                   |
| `/global-components/analytics/*`           | App Insights ingestion (§2)     | `uksouth-1.in.applicationinsights.azure.com`        |
| `/global-components/navigate-cms`          | CMS navigation                  | njs `handleNavigateCms`                             |
| `/case-review-redirect/`                   | Case Review auth-handover chain | njs `handleCaseReviewRedirect`                      |

**Runtime env vars the proxy needs** (supplied by the proxy App Service / its
secrets — **not** by us): `WM_MDS_BASE_URL`, `WM_MDS_ACCESS_KEY`,
`CPS_GLOBAL_COMPONENTS_BLOB_STORAGE_DOMAIN`, `WEBSITE_DNS_SERVER`.

**Terraform concern?** No — the proxy App Service and its deployment belong to the
Polaris team. Our deliverable is the config + njs above, handed off; there is no
resource here for **us** to provision. Track it so whoever Terraforms the proxy
knows our config slice exists and where it lives.

---

## External dependencies (not ours to provision)

Listed so the boundary is explicit — these are host/parent resources we
integrate with:

- **Polaris proxy** — `polaris.cps.gov.uk` / `polaris-*-notprod.cps.gov.uk`
  (`GATEWAY_URL`; the host is Polaris's own term). The nginx/njs reverse proxy in
  front of the component; another team owns and deploys it. **We author its
  `/global-components/*` config — see [§6](#6-polaris-nginx-proxy--config-we-author-the-polaris-team-deploys).**
- **OutSystems** — `*.outsystemsenterprise.com` (`cps-dev` / `cps-tst1` / `cps`)
  auth-handover landing pages.
- **CMS upstream** — proxied via `WM_MDS_BASE_URL` (Azure Functions,
  `*.azurewebsites.net`) + `WM_MDS_ACCESS_KEY`; consumed by the proxy njs.
- **LACC / housekeeping apps** — additional host pages that embed the component
  (their redirect pages appear in the redirect-URI list above).

---

## Hardening flags (worth addressing when formalising)

- **No Key Vault, Front Door, CDN, or App Configuration** exists — secrets are
  shipped as plaintext. The real secret `.env` files (`config/main/.env`,
  `deploy/secrets.env`, `vnext/.env`, `spike/.env`, `analytics/scripts/.env`)
  are **gitignored and untracked** ✓ (only `docker/*.mock.env`, with placeholder
  values, are committed). But the `WM_MDS_ACCESS_KEY`, a CMS-auth **client
  secret**, and storage keys still live in plaintext on-disk / on the deploy
  host — and the CMS-auth client secret is baked as a default in
  `infra/proxy/config/global-components.cms-auth-v2-deployed.js` (a `.js`, so
  check its tracked status separately). Migrate these to Key Vault +
  Terraform-managed secrets / GitHub OIDC.
- **Tenant GUID typo** in `infra/proxy/config/global-components.vnext/global-components.vnext.ts:7`
  — `…-6338-…` instead of `…-4338-…`. Dormant only because
  `VALIDATE_TOKEN_AGAINST_AD = false`; would reject all tokens if enabled.
- **Asset deploy uses a storage account key** (GitHub secret
  `BLOB_STORAGE_CONNECTION_STRING`), not a federated identity — see §5.
- **Pre-prod app registration is over-permissioned** — `8d6133af` holds
  `GroupMember.ReadWrite.All` and `User.Read.All` (delegated **and** application
  roles) while the code only uses `User.Read`. Review whether anything actually
  needs the group-write / app-role grants; prune or justify before Terraforming.
  The prod reg (`295ecc3c`) keeps only the minimal delegated set (see §4).

## Verifying against Azure — `az` commands

> **Subscription context matters.** Entra (`az ad …`) is tenant-scoped and works
> from any subscription. But the storage account and Log Analytics workspace live
> in the **`<subscription-id>`** subscription (real value in
> `infra/analytics/scripts/.env` as `SUBSCRIPTION`, or via `az account list`) — if
> your default is another subscription, the ARM/management-plane calls 404 or
> `AuthorizationFailed`. Select it first:
>
> ```bash
> az account list -o table                 # see what you can reach
> az account set --subscription <subscription-id>
> ```
>
> (The `az storage container list --auth-mode login` call works regardless because
> it's data-plane — that's why it succeeded while `az storage account show` didn't.)

All resources are now **confirmed** via `az` (values inline above) — nothing
outstanding. To re-verify from scratch (e.g. after infra changes):

```bash
az account set --subscription <subscription-id>  # storage + LA + AI live here

az ad app show --id 8d6133af-9593-47c6-94d0-5c65e9e310f1 \
  --query "{name:displayName, audience:signInAudience, spa:spa.redirectUris, web:web.redirectUris}" -o json  # pre-prod reg
az ad app show --id 295ecc3c-ae64-45c1-941d-b54b539b30aa \
  --query "{name:displayName, audience:signInAudience, spa:spa.redirectUris, web:web.redirectUris}" -o json  # prod reg
az storage account show -n sacpsglobalcomponents -g rg-global-nav-dev -o json
az storage container list --account-name sacpsglobalcomponents --auth-mode login -o table
az monitor log-analytics workspace show -n la-global-nav-dev -g rg-global-nav-dev -o json
az resource list -g rg-global-nav-dev --resource-type microsoft.insights/components -o table  # ai-global-nav-dev
```
