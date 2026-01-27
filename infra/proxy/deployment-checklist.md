# Blob Storage Proxy Migration Checklist

Promoting the blob storage proxy locations from vnext to the parent project's main config.

## Status

- [x] Step 1: Deploy vnext with `_bc` suffixed names (backwards-compatibility)
- [ ] Step 2: PR to parent project with canonical names
- [ ] Step 3: Deploy parent project
- [ ] Step 4: Clean up vnext backwards-compatibility artifacts
- [ ] Step 5: Deploy vnext cleanup

## Step 4: Clean up vnext

Once the parent project is deployed with the canonical blob proxy locations, remove the backwards-compatibility artifacts from vnext.

### vnext.conf

Remove the `js_set` line:

```
js_set $blob_index_suffix_bc glocovnext.computeBlobIndexSuffix;
```

Remove both blob proxy location blocks (the redirect and the proxy):

```
location ~ ^/global-components/(?:dev|test|prod)/[^.]*[^/]$ { ... }
location ~ ^/global-components/(dev|test|prod)(/.*)$ { ... }
```

### deploy.sh

Remove `GLOBAL_COMPONENTS_BLOB_STORAGE_URL` from:

- `ENVSUBST_VARS` (line ~141)
- `APP_SETTINGS_VARS` (line ~88)
- `REQUIRED_VARS` (line ~62)
- The echo in the missing secrets.env error message (line ~54)

### vnext.ts

The `computeBlobIndexSuffix` function can remain in vnext.ts (it does no harm and main has its own copy). Optionally remove it and its export if you want to keep things tidy.

## Step 5: Deploy vnext

Deploy the cleanup from step 4. The parent project's main config now owns blob storage serving entirely.

## After completion

Delete this file.
