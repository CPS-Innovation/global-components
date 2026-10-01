# deploy-cms-auth-presence — deploy steps

## Prerequisites

- `az` logged in as a principal with **Storage Blob Data Contributor** on the storage
  account, and rights to restart the App Service.
- Node + npm (to build via `npx tsc`).

## Inputs

### Config

| Name              | Meaning                                                   | Example                                       |
| ----------------- | --------------------------------------------------------- | --------------------------------------------- |
| `STORAGE_ACCOUNT` | Blob storage account the deployed nginx reads config from | `sacpsqapolaris`                              |
| `CONTAINER`       | Blob container for the target environment                 | `content`                                     |
| `APP_SERVICE`     | App Service hosting the nginx instance                    | `polaris-qa-cmsproxy`                         |
| `RESOURCE_GROUP`  | Its resource group                                        | `rg-polaris-qa`                               |
| `BLOB_CONF_NAME`  | Blob name for the nginx conf (live-monolith world)        | `global-components.cms-auth-presence.conf.template` |
| `BLOB_CONF_NEXT`  | Blob name for the SAME conf (refactored "next" world)     | `features/global-components.cms-auth-presence/global-components.cms-auth-presence.conf.template` |
| `BLOB_JS_NAME`    | Blob name for the compiled bundle                         | `global-components.cms-auth-presence.js`            |

### Secrets

| Name            | Replaces token in the built JS                     |
| --------------- | -------------------------------------------------- |
| `CLIENT_SECRET` | `@@CPS_GLOBAL_COMPONENTS_CMS_AUTH_CLIENT_SECRET@@` |
| `STORAGE_KEY`   | `@@CPS_GLOBAL_COMPONENTS_CMS_AUTH_STORAGE_KEY@@`   |

### Paths (relative to the proxy project root)

- `CONF_SRC` = `config/global-components.cms-auth-presence/global-components.cms-auth-presence.conf`
- `JS_SRC` = `dist/global-components.cms-auth-presence/global-components.cms-auth-presence.js` (tsc output — note the subdirectory)

## Steps

```
1. BUILD  (bash-free; no pnpm required)
   - npm install     (installs typescript + njs-types + @types/node)
   - npx tsc         (compiles config/**/*.ts into dist/, mirroring the source tree)
   - Artifact = JS_SRC  (dist/global-components.cms-auth-presence/global-components.cms-auth-presence.js)

2. INJECT SECRETS
   - Copy JS_SRC to a temp file.
   - In the temp file, LITERAL string-replace (not regex — values contain + / = ~ @):
       @@CPS_GLOBAL_COMPONENTS_CMS_AUTH_CLIENT_SECRET@@  ->  CLIENT_SECRET
       @@CPS_GLOBAL_COMPONENTS_CMS_AUTH_STORAGE_KEY@@    ->  STORAGE_KEY
   - The temp file now holds real secrets — delete it after step 5.

3. UPLOAD CONF — TWICE, same file  (upload unchanged — it contains ${...} placeholders the
   server resolves; do not substitute). The proxy may run the live monolith (loads root
   `global-components*.conf`) or the refactored next config (loads only `features/*/*.conf`),
   both from this container, so the conf must be in both places. The JS (step 4) is shared.
   See Polaris polaris-terraform/main-terraform/proxy/docs/PROXY.md §6.8.
   - az storage blob upload
       --account-name   {STORAGE_ACCOUNT}
       --container-name {CONTAINER}
       --auth-mode      login
       --overwrite      true
       --name           {BLOB_CONF_NAME}
       --file           {CONF_SRC}
   - az storage blob upload   (same flags)
       --name           {BLOB_CONF_NEXT}
       --file           {CONF_SRC}

4. UPLOAD JS
   - az storage blob upload
       --account-name   {STORAGE_ACCOUNT}
       --container-name {CONTAINER}
       --auth-mode      login
       --overwrite      true
       --name           {BLOB_JS_NAME}
       --file           {temp file from step 2}

5. RESTART
   - az webapp restart --name {APP_SERVICE} --resource-group {RESOURCE_GROUP}

6. Delete the temp file from step 2.
```
