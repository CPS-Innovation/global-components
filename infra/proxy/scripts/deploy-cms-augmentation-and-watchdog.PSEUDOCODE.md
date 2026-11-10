# deploy cms-augmentation + watchdog — deploy steps

What `deploy.local.sh` does for its two proxy modules, without the bash. (It also
publishes the presence clients; that part is in `packages/cps-global-presence/README.md`.)

## Prerequisites

- `az` logged in as a principal with **Storage Blob Data Contributor** on the config
  storage account, and rights to restart the App Service.
- Node + npm (to build via `npx tsc`).

## Inputs

### Config

| Name              | Meaning                                                   | Example                          |
| ----------------- | --------------------------------------------------------- | -------------------------------- |
| `STORAGE_ACCOUNT` | Blob storage account the deployed nginx reads config from | `sacpsqapolaris`                 |
| `CONTAINER`       | Blob container                                            | `content`                        |
| `APP_SERVICE`     | App Service hosting the nginx instance                    | `polaris-qa-cmsproxy`            |
| `RESOURCE_GROUP`  | Its resource group                                        | `rg-polaris-qa`                  |
| `SCRIPT_BASE`     | Where the injected clients are served from                | `/global-components/test`        |

### The one setting

| Name                              | Where it goes                                                   |
| --------------------------------- | --------------------------------------------------------------- |
| `GLOBAL_COMPONENTS_WATCHDOG_HOST` | An App Service app setting (preferred — the njs reads it first), or baked into the watchdog JS as `@@GLOBAL_COMPONENTS_WATCHDOG_HOST@@` |

Not a secret. There are no secrets in either module any more.

### Blobs (new-generation config only: it loads `features/*/*.conf`)

| Source (relative to the proxy project root)                                         | Blob |
| ----------------------------------------------------------------------------------- | ---- |
| `dist/global-components.cms-augmentation.js`                                        | `features/global-components.cms-augmentation/global-components.cms-augmentation.js` |
| `config/global-components.cms-augmentation/global-components.cms-augmentation.conf` (after step 2) | `features/global-components.cms-augmentation/global-components.cms-augmentation.conf.template` |
| `dist/global-components.watchdog.js` (after step 3)                                 | `features/global-components.watchdog/global-components.watchdog.js` |
| `config/global-components.watchdog/global-components.watchdog.conf`                 | `features/global-components.watchdog/global-components.watchdog.conf.template` |

## Steps

```
1. BUILD
   - npm install; ./scripts/build.sh   (tsc, then flattens the JS into dist/)

2. CMS-AUGMENTATION CONF: replace @@SCRIPT_BASE@@ with SCRIPT_BASE (literal replace)
   into a temp copy. Leave nginx's ${...} placeholders alone — the server resolves them.

3. WATCHDOG JS: if the app setting is NOT set on the App Service, replace
   @@GLOBAL_COMPONENTS_WATCHDOG_HOST@@ with the host (literal replace) in a temp copy.
   (With the app setting set, upload dist/ as is: the token is ignored when the
   setting exists.)

4. RETIRE THE PRE-RENAME MODULES — BEFORE STEP 5, and only if they exist:
     features/global-components.cms-auth-presence/global-components.cms-auth-presence.{conf.template,js}
     features/global-components.case-locking/global-components.case-locking.{conf.template,js}
   Old and new loaded together define the same locations twice and nginx will not
   start. Deleting first means a restart that lands mid-deploy meets neither (routes
   missing, nginx up) rather than both (nginx down). Check they are gone.

5. UPLOAD, each module's JS BEFORE its conf (a restart between the two must never
   meet a conf whose JS is missing):
   - az storage blob upload --account-name {STORAGE_ACCOUNT} --container-name {CONTAINER}
       --auth-mode login --overwrite true --name {blob} --file {source}

6. RESTART
   - az webapp restart --name {APP_SERVICE} --resource-group {RESOURCE_GROUP}
```
