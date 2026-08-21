# deploy-cms-auth-v2 — deploy steps

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
| `BLOB_CONF_NAME`  | Blob name for the nginx conf                              | `global-components.cms-auth-v2.conf.template` |
| `BLOB_JS_NAME`    | Blob name for the compiled bundle                         | `global-components.cms-auth-v2.js`            |

### Secrets

| Name            | Replaces token in the built JS                     |
| --------------- | -------------------------------------------------- |
| `CLIENT_SECRET` | `@@CPS_GLOBAL_COMPONENTS_CMS_AUTH_CLIENT_SECRET@@` |
| `STORAGE_KEY`   | `@@CPS_GLOBAL_COMPONENTS_CMS_AUTH_STORAGE_KEY@@`   |

### Paths (relative to the proxy project root)

- `CONF_SRC` = `config/global-components.cms-auth-v2/global-components.cms-auth-v2.conf`
- `JS_SRC` = `dist/global-components.cms-auth-v2/global-components.cms-auth-v2.js` (tsc output — note the subdirectory)

## Steps

```
1. BUILD  (bash-free; no pnpm required)
   - npm install     (installs typescript + njs-types + @types/node)
   - npx tsc         (compiles config/**/*.ts into dist/, mirroring the source tree)
   - Artifact = JS_SRC  (dist/global-components.cms-auth-v2/global-components.cms-auth-v2.js)

2. INJECT SECRETS
   - Copy JS_SRC to a temp file.
   - In the temp file, LITERAL string-replace (not regex — values contain + / = ~ @):
       @@CPS_GLOBAL_COMPONENTS_CMS_AUTH_CLIENT_SECRET@@  ->  CLIENT_SECRET
       @@CPS_GLOBAL_COMPONENTS_CMS_AUTH_STORAGE_KEY@@    ->  STORAGE_KEY
   - The temp file now holds real secrets — delete it after step 5.

3. UPLOAD CONF  (upload unchanged — it contains ${...} placeholders the server resolves; do not substitute)
   - az storage blob upload
       --account-name   {STORAGE_ACCOUNT}
       --container-name {CONTAINER}
       --auth-mode      login
       --overwrite      true
       --name           {BLOB_CONF_NAME}
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
