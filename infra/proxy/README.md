# Proxy Infrastructure

## Overview

Nginx reverse proxy with njs (JavaScript) for header/cookie manipulation. Used to proxy requests to Azure Functions backend.

## Key Files

### Main nginx config (`config/main/`)

- `nginx.conf.template` - main nginx configuration with server block and location routing (uses `${WEBSITE_DNS_SERVER}` env var)
- `nginx.js` - njs module for auth redirect handlers (`appAuthRedirect`, `polarisAuthRedirect`, `taskListAuthRedirect`)
- `global-components.ts` - njs module with header/cookie logic for upstream proxying (compiled to JS)
- `global-components.conf.template` - nginx location blocks for global-components (uses env vars: `${WM_MDS_BASE_URL}`, `${WM_MDS_ACCESS_KEY}`, `${CPS_GLOBAL_COMPONENTS_BLOB_STORAGE_DOMAIN}`)
- `.env` - **gitignored** - contains real upstream URL and functions key
- `.env.example` - template for the above

### Global components vnext config (`config/global-components.vnext/`)

- `global-components.vnext.js` - njs module for state endpoint, status endpoint, token validation, swagger filtering
- `global-components.vnext.conf.template` - nginx location blocks for vnext features (uses env vars: `${GLOBAL_COMPONENTS_APPLICATION_ID}`, `${GLOBAL_COMPONENTS_BLOB_STORAGE_URL}`)
- `.env` - **gitignored** - contains vnext-specific config
- `.env.example` - template for the above

### Global components vnever config (`config/global-components.vnever/`)

- `global-components.vnever.js` - njs module for upstream health check proxy
- `global-components.vnever.conf.template` - nginx location block for health check endpoint
- **Note**: vnever is NOT deployed to production - used for local/Docker testing only

### Docker (`docker/`)

- `Dockerfile.base` - nginx with njs module, runs as non-root `nginx` user on port 8080
- `Dockerfile.mock` - simple Node.js mock server for testing
- `docker-compose.yml` - base config with nginx + mock-upstream + global-components
- `docker-compose.vnext.yml` - vnext layer override
- `docker-compose.vnever.yml` - vnever layer override
- `global-components.mock.env` - mock env vars pointing to mock-upstream for testing
- `global-components.vnext.mock.env` - mock vnext env vars for testing

## Testing

### Unit tests

Run: `pnpm test` (from `infra/proxy`)

Unit tests are located in `tests` subfolders:
- `config/main/tests/global-components.unit.test.ts` - tests for `global-components.ts`
- `config/main/tests/nginx.unit.test.ts` - tests for `nginx.js` auth redirect handlers
- `config/global-components.vnext/tests/global-components.vnext.unit.test.ts` - tests for `global-components.vnext.js`
- `config/global-components.vnever/tests/global-components.vnever.unit.test.ts` - tests for `global-components.vnever.js`

Uses esbuild to bundle njs modules with mocked dependencies. Build artifacts go to `.dist/` (gitignored).

### Integration tests

Run: `pnpm test:integration` (from `infra/proxy`) or `pnpm test:proxy` (from repo root)

Integration tests are located in `tests` subfolders:
- `config/main/tests/nginx.integration.test.js` - tests for auth redirect endpoints
- `config/main/tests/global-components.integration.test.js` - tests for base proxy functionality
- `config/global-components.vnext/tests/global-components.vnext.integration.test.js` - tests for vnext features
- `config/global-components.vnever/tests/global-components.vnever.integration.test.js` - tests for health check endpoint
- `run-tests.sh` - script that rebuilds Docker, runs tests, and cleans up

The integration test script always rebuilds Docker containers to ensure latest code is tested.

### Test coverage

- Cms-Auth-Values header/cookie handling and precedence
- Auth redirect endpoints (`/init`, `/polaris`)
- Session hint cookie (cms-session-hint) with JSON payload
- Swagger URL rewriting
- x-functions-key injection
- CORS headers
- Authorization header stripping
- Upstream health check endpoint

## Auth Redirect Flow

### `/init` endpoint (`appAuthRedirect`)

1. Sets `cms-session-hint` cookie with JSON: `{ cmsDomains: [...], isProxySession: boolean }`
2. Validates redirect URL against `AUTH_HANDOVER_WHITELIST` env var
3. Redirects to whitelisted URL with `cc` param containing encoded cookies
4. Returns 403 for non-whitelisted URLs

### `/polaris` endpoint (`polarisAuthRedirect`)

Simulates the CMS `/polaris` endpoint for proxied CMS users:

1. Captures request cookies and referer
2. Redirects to `/init` with `is-proxy-session=true`

### Session hint cookie

The `cms-session-hint` cookie is URL-encoded JSON:

```json
{
  "cmsDomains": ["foo.cps.gov.uk", "bar.cps.gov.uk"],
  "isProxySession": true
}
```

## Docker Setup

### Non-root containers

Containers run as non-root users for security (checkov compliance):

- nginx listens on port 8080 (not 80) because non-root can't bind to ports < 1024
- `/etc/nginx` ownership changed to `nginx` user
- Mock server runs as `node` user

### Environment variables

**Required for nginx (managed by parent project):**
- `NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx` - enables template processing
- `WEBSITE_DNS_SERVER` - DNS resolver for nginx (use `127.0.0.11` for Docker)
- `AUTH_HANDOVER_WHITELIST` - comma-separated list of allowed redirect URL prefixes

**Global components (managed by parent project):**
- `WM_MDS_BASE_URL` - Azure Functions backend URL (e.g., `https://your-function-app.azurewebsites.net/api/`)
- `WM_MDS_ACCESS_KEY` - Azure Functions access key
- `CPS_GLOBAL_COMPONENTS_BLOB_STORAGE_DOMAIN` - Domain for blob storage proxy (e.g., `sacpsglobalcomponents.blob.core.windows.net`)

**VNext features (from `config/global-components.vnext/.env`):**
- `GLOBAL_COMPONENTS_APPLICATION_ID` - Azure AD application ID for token validation
- `GLOBAL_COMPONENTS_BLOB_STORAGE_URL` - Base URL for blob storage (e.g., `https://sacpsglobalcomponents.blob.core.windows.net`)
- `CPS_GLOBAL_COMPONENTS_BLOB_STORAGE_DOMAIN` - Domain for blob storage (e.g., `sacpsglobalcomponents.blob.core.windows.net`)

Note: `TENANT_ID` is hardcoded in `global-components.vnext.js` as it doesn't change between environments.

### Environment variable substitution

The vnext-specific variables (`GLOBAL_COMPONENTS_APPLICATION_ID`, `GLOBAL_COMPONENTS_BLOB_STORAGE_URL`, `CPS_GLOBAL_COMPONENTS_BLOB_STORAGE_DOMAIN`) are substituted at deployment time using envsubst in deploy.sh. The values come from secrets.env on the deployment machine.

Other variables (`WEBSITE_DNS_SERVER`, `WM_MDS_BASE_URL`, `WM_MDS_ACCESS_KEY`) remain as `${VAR}` placeholders and are substituted at nginx runtime by the App Service container.

## CI/CD

- `.github/workflows/sub-workflow-proxy-tests.yml` - runs proxy tests in parallel with other PR checks

## njs notes

- `r.args` = query string parameters (not headers!)
- `r.headersIn` = request headers
- `r.headersOut` = response headers
- `r.variables` = nginx variables

## Deployment

### Overview

Deployment is done from a remote machine with network access to Azure blob storage. Build artifacts are downloaded from GitHub Actions.

**Note**: The base global-components files (`nginx.js`, `global-components.conf.template`, `global-components.js`) are deployed by the parent project. This deployment only handles vnext-specific files.

### Files deployed by this project

To blob storage (vnext-specific only):
- `global-components.vnext.conf.template` - vnext nginx location blocks (with vnext env vars pre-substituted)
- `global-components.vnext.js` - njs module for vnext features (state, token validation)
- `global-components-deployment.json` - deployment version tracking file

Note: `GLOBAL_COMPONENTS_APPLICATION_ID` and `GLOBAL_COMPONENTS_BLOB_STORAGE_URL` are baked into the config file via envsubst during deployment (from secrets.env). App settings code is commented out but can be re-enabled if needed.

### Files deployed by parent project

- `nginx.js` - njs module for auth redirects
- `global-components.conf.template` - nginx location blocks
- `global-components.js` - njs module for upstream proxying
- `WM_MDS_BASE_URL` and `WM_MDS_ACCESS_KEY` app settings

Note: `global-components.vnever` is NOT deployed - it is only used for local/Docker testing.

### Setup (one-time on remote machine)

1. Create a deployment directory and `secrets.env` with:
   - Azure subscription, resource group, storage account, container, webapp name
   - Status endpoint URL
   - `GLOBAL_COMPONENTS_APPLICATION_ID` and `GLOBAL_COMPONENTS_BLOB_STORAGE_URL`

See `deploy/README.md` for detailed setup instructions.

### Deploy

```bash
curl -sSL https://raw.githubusercontent.com/CPS-Innovation/global-components/main/infra/proxy/deploy/deploy.sh | bash
```

This will:

1. Download build artifact from GitHub Actions
2. Download current files from blob storage as backup
3. Increment deployment version
4. Upload vnext files to blob storage
5. Set app settings on the web app
6. Restart the Azure web app
7. Poll status endpoint until new version is live

### Rollback

```bash
curl -sSL https://raw.githubusercontent.com/CPS-Innovation/global-components/main/infra/proxy/deploy/rollback.sh | bash
```

Lists available backups and lets you select one to restore.

### Status endpoint

`GET /global-components/status` returns:

```json
{ "status": "online", "version": 42 }
```

The version number is read from `/etc/nginx/global-components-deployment.json` on the filesystem. This file is created/updated during deployment and contains `{"version": N}`. If the file doesn't exist, version 0 is returned.

### Files (gitignored)

- `deploy/secrets.env` - Azure credentials and vnext config
- `config/global-components.vnext/.env` - vnext config (app ID, blob storage URL)
- `deploy/backups/` - timestamped backup folders

### Deployment version tracking

The deployment version is tracked in `global-components-deployment.json`:
- Located at `/etc/nginx/global-components-deployment.json` on the server
- Contains `{"version": N}` where N is incremented on each deploy
- During deployment:
  1. Download current file from blob storage (if exists)
  2. Read current version (or 0 if not found)
  3. Increment version
  4. Upload new file to blob storage
- The status endpoint reads this file to report current version

## Known Issues / TODO

### Duplicate CORS headers on OPTIONS preflight

**Problem**: In production, OPTIONS preflight requests return duplicate `Access-Control-Allow-Origin` headers, causing CORS failures.

**Root cause**: In `global-components.conf.template`, the location block uses:
```nginx
if ($request_method = OPTIONS) {
  js_content gloco.handleCorsPreflightRequest;
}
add_header Access-Control-Allow-Origin $cors_origin always;
```

The `add_header ... always` directive applies to ALL responses in that location block, including responses from `js_content`. So CORS headers are added twice:
1. By `handleCorsPreflightRequest` via `r.headersOut`
2. By nginx's `add_header` directive

Note: `proxy_hide_header` only affects proxied responses from upstream - it doesn't prevent `add_header` from adding headers to `js_content` responses.

**Potential solutions**:
1. Use a `map` to return empty string for OPTIONS, so `add_header` doesn't add anything for preflight
2. Move OPTIONS handling to a separate location block
3. Handle all CORS via njs using `js_header_filter`
