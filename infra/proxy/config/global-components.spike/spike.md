# Spike: nginx + njs Azure AD Authentication Proxy

## Goal

Prove that nginx/njs can:

1. Perform a server-side OIDC login flow against Azure AD (App A)
2. Validate Bearer tokens issued by a *different* App Registration (App B) at the same tenant
3. Extract the user's `oid` from an App B token and use App A's client credentials to write a value to a directory extension property on that user
4. Read back that extension property value on subsequent requests
5. Store and read values via Azure Table Storage (no size limit, suitable for values >256 chars)

## Architecture

```
App A = "nginx-spike" App Registration (owns the extension property, server-side OIDC)
App B = "spike-spa"   App Registration (MSAL.js SPA, separate app, same tenant)

┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Browser   │────▶│  nginx (njs)     │────▶│  Azure AD   │
│             │◀────│  localhost:8443   │◀────│   (OIDC)    │
└─────────────┘     └──────────────────┘     └─────────────┘
                           │                        ▲
                           │  Client credentials    │
                           │  (App A) to read/write │
                           │  extension properties  │
                           └──────┬─────────────────┘
                                  │  (via Graph API)
                                  │
                           ┌──────▼──────────┐
                           │  Azure Table    │
                           │  Storage        │
                           │  (SharedKey)    │
                           └─────────────────┘
```

### Key Insight: OID consistency

The `oid` claim (user's Azure AD Object ID) is identical in tokens from *any* App Registration within the same tenant. This means:

- App B token contains `oid = abc123`
- App A's OIDC flow also yields `oid = abc123` for the same user
- nginx can extract `oid` from either token and use App A's credentials to read/write extension properties for that user

### Known Gap

The extension property for a user is empty until someone writes to it. If a user presents an App B token but has never been through the write flow, the read will return nothing. This is expected - the real system would handle this as "user has not yet authenticated through the CMS auth capture flow."

## Increments

### Increment 1: OIDC Login Redirect Cycle (App A)

Prove that njs can perform a complete server-side OIDC authorization code flow.

**Endpoints:**

| Path | Handler | Purpose |
|------|---------|---------|
| `GET /spike/login` | `handleLogin` | Generate state+nonce cookies, 302 to Azure AD authorize |
| `GET /spike/callback` | `handleCallback` | Exchange code for tokens, validate state+nonce, display result |

**What happens:**

1. User visits `/spike/login`
2. njs generates random `state` and `nonce`, sets them as HttpOnly cookies
3. 302 redirect to `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize`
4. User authenticates (or SSO)
5. Azure AD redirects to `/spike/callback?code=xxx&state=xxx`
6. njs validates `state` against cookie
7. njs POSTs to token endpoint to exchange `code` for `id_token` + `access_token`
8. njs validates `nonce` in `id_token` against cookie
9. njs extracts `oid`, `preferred_username`, `name` from `id_token`
10. Returns a simple HTML page showing the extracted claims (proves flow works)

**No Graph API calls in this increment.** We just prove the OIDC handshake works.

### Increment 2: MSAL.js Test Page + Token Validation Endpoint (App B)

Prove that njs can validate tokens issued by a different App Registration and extract the `oid`.

**Endpoints:**

| Path | Handler | Purpose |
|------|---------|---------|
| `GET /spike/` | `handleTestPage` | Serve the MSAL.js HTML test page |
| `GET /spike/validate` | `handleValidate` | Validate Bearer token, return extracted claims as JSON |

**The test page (`spike.html`):**

- Loads MSAL.js from CDN
- Has buttons: "Login (popup)", "Get Token", "Call Validate Endpoint"
- Configures MSAL with App B's client ID and `https://localhost:8443/spike/` as redirect URI
- Acquires a token with `api://{App A client ID}/user_impersonation` scope (or just `openid profile`)
- Calls `/spike/validate` with `Authorization: Bearer <token>`
- Displays the JSON response

**The validate endpoint:**

1. Extracts Bearer token from `Authorization` header
2. Decodes JWT payload (base64url)
3. Validates:
   - `tid` matches configured tenant ID
   - `iss` matches `https://login.microsoftonline.com/{tenant}/v2.0` or `https://sts.windows.net/{tenant}/`
   - `exp` > now
4. Returns JSON: `{ oid, tid, preferred_username, iss, exp, appid/azp }`

**Note:** Signature verification (JWKS) is a stretch goal for this increment. The claims check + Graph API validation (calling `/me` with the token) provides practical security. Full JWKS verification can be added later.

### Increment 3: Store Value via OIDC Flow

Add query parameter capture to the OIDC login flow, and store the value in the user's directory extension property after authentication.

**Endpoint:**

| Path | Handler | Purpose |
|------|---------|---------|
| `GET /spike/store?value=xxx` | `handleStore` | Login flow that captures `value` in OAuth state, stores in extension after callback |
| `GET /spike/store/callback` | `handleStoreCallback` | Callback for the store flow |

**What happens:**

1. User visits `/spike/store?value=hello123`
2. njs encodes `{ value: "hello123", nonce: "xxx" }` into the OAuth `state` parameter
3. Standard OIDC redirect → authenticate → callback
4. On callback, njs exchanges code for tokens, extracts `oid`
5. njs obtains a Graph API token using App A client credentials (`client_credentials` grant)
6. njs PATCHes `https://graph.microsoft.com/v1.0/users/{oid}` with:
   ```json
   { "extension_{appIdNoDashes}_spikeValue": "hello123" }
   ```
7. Returns HTML confirming the value was stored

### Increment 4: Read Extension Property from App B Token

Prove the full cross-app-registration read flow.

**Endpoint:**

| Path | Handler | Purpose |
|------|---------|---------|
| `GET /spike/read` | `handleRead` | Validate App B Bearer token, read extension property via Graph API |

**What happens:**

1. Called from the MSAL.js test page with an App B Bearer token
2. njs validates the token (same as increment 2)
3. Extracts `oid`
4. Obtains Graph API token using App A client credentials
5. GETs `https://graph.microsoft.com/v1.0/users/{oid}?$select=extension_{appIdNoDashes}_spikeValue`
6. Returns JSON: `{ oid, storedValue }` (or `{ oid, storedValue: null }` if not set)

**The test page (increment 2) will be extended** to add a "Read Stored Value" button that calls this endpoint.

### Increment 5: Store & Read via Azure Table Storage

Directory extension properties are limited to 256 characters (see [Findings](#findings-directory-extension-string-limit) below). For values exceeding this limit (e.g. the 1013-char CMS auth value), we use Azure Table Storage instead.

**Endpoints:**

| Path | Handler | Purpose |
|------|---------|---------|
| `GET /spike/table/store?value=xxx` | `handleTableStore` | OIDC login that captures `value` in state, stores in Table Storage after callback |
| `GET /spike/table/store/callback` | `handleTableStoreCallback` | Callback: exchange code, write value to Table Storage |
| `GET /spike/table/read` | `handleTableRead` | Validate App B Bearer token, read value from Table Storage |

**Storage model:**

- **Account:** configured via `SPIKE_STORAGE_ACCOUNT` env var
- **Table:** `cmsauth`
- **PartitionKey:** user's OID (from Azure AD token)
- **RowKey:** `cmsAuth` (fixed)
- **Value:** the stored string (no size limit)

**Authentication to Table Storage:**

Uses `SharedKeyLite` authorization — HMAC-SHA256 over the date and canonicalized resource, signed with the storage account key. No Azure AD token or Graph API needed.

```
StringToSign = Date + "\n" + "/" + AccountName + "/" + CanonicalizedResource
Authorization: SharedKeyLite <AccountName>:<Base64(HMAC-SHA256(StringToSign))>
```

The njs `crypto` module (`import crypto from "crypto"`) provides `createHmac` for signing.

**What happens (store):**

1. User visits `/spike/table/store?value=long-cms-auth-string`
2. Same OIDC redirect flow as Increment 3 (state carries value + nonce)
3. On callback, njs exchanges code for tokens, extracts `oid`
4. njs PUTs entity to `https://{account}.table.core.windows.net/cmsauth(PartitionKey='{oid}',RowKey='cmsAuth')` with SharedKeyLite auth
5. Returns HTML confirming the value was stored

**What happens (read):**

1. Called from MSAL.js test page with App B Bearer token
2. njs validates token, extracts `oid`
3. njs GETs entity from `https://{account}.table.core.windows.net/cmsauth(PartitionKey='{oid}',RowKey='cmsAuth')` with SharedKeyLite auth
4. Returns JSON: `{ oid, storedValue, storage }` (or `storedValue: null` if not found)

**Key difference from Increments 3-4:** No Graph API or Application permissions needed. Authentication to storage uses the account key directly — simpler, faster, and no 256-char limit.

## Files To Create

```
infra/proxy/config/global-components.spike/
├── spike.md                              # This plan (already exists)
├── global-components.spike.conf          # nginx location blocks
├── global-components.spike.ts            # njs handlers (TypeScript)
├── spike.html                            # MSAL.js test page
├── .env.example                          # Template for required env vars
└── .env                                  # Actual values (gitignored)

infra/proxy/docker/
├── docker-compose.spike.yml              # Docker override for spike layer
├── global-components.spike.mock.env      # Mock env (won't work for real auth)
└── certs/
    ├── localhost.key                     # Self-signed key  (gitignored)
    └── localhost.crt                     # Self-signed cert (gitignored)
```

### global-components.spike.conf

```nginx
js_import glocospike from templates/global-components.spike.js;

# Spike env vars
js_var $spike_tenant_id ${SPIKE_TENANT_ID};
js_var $spike_client_id ${SPIKE_CLIENT_ID};
js_var $spike_client_secret ${SPIKE_CLIENT_SECRET};
js_var $spike_redirect_uri ${SPIKE_REDIRECT_URI};
js_var $spike_store_redirect_uri ${SPIKE_STORE_REDIRECT_URI};
js_var $spike_table_store_redirect_uri ${SPIKE_TABLE_STORE_REDIRECT_URI};
js_var $spike_storage_account ${SPIKE_STORAGE_ACCOUNT};
js_var $spike_storage_key ${SPIKE_STORAGE_KEY};

# MSAL.js test page
location = /spike/ {
    js_content glocospike.handleTestPage;
}

# Increment 1: OIDC login
location = /spike/login {
    js_content glocospike.handleLogin;
}

location = /spike/callback {
    js_fetch_verify off;
    js_content glocospike.handleCallback;
}

# Increment 2: Token validation
location = /spike/validate {
    js_content glocospike.handleValidate;
}

# Increment 3: Store value via OIDC
location = /spike/store {
    js_content glocospike.handleStore;
}

location = /spike/store/callback {
    js_fetch_verify off;
    js_content glocospike.handleStoreCallback;
}

# Increment 4: Read extension property
location = /spike/read {
    js_fetch_verify off;
    js_content glocospike.handleRead;
}

# Increment 5: Table Storage
location = /spike/table/store {
    js_content glocospike.handleTableStore;
}

location = /spike/table/store/callback {
    js_fetch_verify off;
    js_content glocospike.handleTableStoreCallback;
}

location = /spike/table/read {
    js_fetch_verify off;
    js_content glocospike.handleTableRead;
}
```

### .env.example

```
# App A: "nginx-spike" - server-side OIDC + extension property owner
SPIKE_TENANT_ID=your-tenant-id
SPIKE_CLIENT_ID=your-app-a-client-id
SPIKE_CLIENT_SECRET=your-app-a-client-secret
SPIKE_REDIRECT_URI=https://localhost:8443/spike/callback
SPIKE_STORE_REDIRECT_URI=https://localhost:8443/spike/store/callback
SPIKE_TABLE_STORE_REDIRECT_URI=https://localhost:8443/spike/table/store/callback

# App B: "spike-spa" - referenced in spike.html only (not in nginx config)
# SPIKE_SPA_CLIENT_ID=your-app-b-client-id

# Azure Table Storage for OID-to-value mapping
SPIKE_STORAGE_ACCOUNT=your-storage-account-name
SPIKE_STORAGE_KEY=your-storage-account-key
```

### docker-compose.spike.yml

```yaml
# Spike layer override
# Use: docker-compose -f docker-compose.yml -f docker-compose.spike.yml up
services:
  nginx:
    ports:
      - "8443:8443"
    env_file:
      - global-components.spike.mock.env
    volumes:
      - ../config/global-components.spike/global-components.spike.conf:/etc/nginx/templates/global-components.spike.conf.template:ro
      - ../dist/global-components.spike.js:/etc/nginx/templates/global-components.spike.js:ro
      - ../config/global-components.spike/spike.html:/etc/nginx/spike.html:ro
      - ./certs/localhost.crt:/etc/nginx/certs/localhost.crt:ro
      - ./certs/localhost.key:/etc/nginx/certs/localhost.key:ro
```

**Note:** The nginx.conf will need an additional `server` block listening on 8443 with SSL, or we modify the existing one. We'll handle this with a spike-specific nginx.conf override or by adding the SSL listener to the main config.

### njs Module Structure (global-components.spike.ts)

```typescript
// Constants injected via js_var from env
// (accessed as r.variables.spike_tenant_id etc.)

// --- Helpers ---
// _base64UrlDecode(str)       - base64url → string
// _base64UrlEncode(str)       - string → base64url
// _generateRandomString(len)  - crypto-random hex string
// _getCookie(r, name)         - extract cookie from request
// _getGraphToken(r)           - client credentials → Graph API token (cached in-memory)
// _decodeJwtPayload(token)    - split + decode JWT payload (no signature check)

// --- Increment 1 ---
// handleLogin(r)              - generate state/nonce, 302 to Azure AD
// handleCallback(r)           - exchange code, validate, show claims

// --- Increment 2 ---
// handleTestPage(r)           - serve spike.html
// handleValidate(r)           - validate Bearer, return claims JSON

// --- Increment 3 ---
// handleStore(r)              - login with value in state
// handleStoreCallback(r)      - exchange code, store value in extension

// --- Increment 4 ---
// handleRead(r)               - validate Bearer, read extension, return value

// --- Increment 5 (Table Storage) ---
// _tableStorageAuth(account, key, date, resource) - SharedKeyLite HMAC-SHA256 auth header
// _writeTable(r, oid, value)  - PUT entity to Azure Table Storage
// _readTable(r, oid)          - GET entity from Azure Table Storage
// handleTableStore(r)         - login with value in state (table variant)
// handleTableStoreCallback(r) - exchange code, store value in table
// handleTableRead(r)          - validate Bearer, read from table, return value

export default {
  handleLogin,
  handleCallback,
  handleTestPage,
  handleValidate,
  handleStore,
  handleStoreCallback,
  handleRead,
  handleTableStore,
  handleTableStoreCallback,
  handleTableRead,
}
```

## Graph API Token Caching

Use `js_shared_dict_zone` in nginx.conf for the Graph client credentials token:

```nginx
js_shared_dict_zone zone=spike_cache:64k;
```

The token is valid for ~1 hour. Cache it with a 55-minute TTL.

Alternatively, since this is a spike, an in-module variable cache is simpler and sufficient for single-worker dev use.

## HTTPS Setup

For MSAL.js and secure cookies, the spike runs on HTTPS with a self-signed certificate.

**Generate certs (one-time, user action):**

```bash
mkdir -p infra/proxy/docker/certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout infra/proxy/docker/certs/localhost.key \
  -out infra/proxy/docker/certs/localhost.crt \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost"
```

**nginx SSL config** (added to the server block or a second server block):

```nginx
listen 8443 ssl;
ssl_certificate /etc/nginx/certs/localhost.crt;
ssl_certificate_key /etc/nginx/certs/localhost.key;
```

## Manual Setup Steps (User Actions)

These steps must be done by the user in the Azure Portal before running the spike.

### Step 1: Create App Registration A ("nginx-spike")

1. Go to Azure Portal → Azure Active Directory → App registrations → New registration
2. Name: `nginx-spike`
3. Supported account types: "Accounts in this organizational directory only"
4. Redirect URI: Web → `https://localhost:8443/spike/callback`
5. Add additional redirect URIs: `https://localhost:8443/spike/store/callback` and `https://localhost:8443/spike/table/store/callback`
6. Under **Certificates & secrets** → New client secret → copy the value
7. Under **API permissions** → Add permission → Microsoft Graph → Application permissions → `User.ReadWrite.All`
8. Click "Grant admin consent" (requires admin role)
9. Note down: **Client ID**, **Client Secret**, **Tenant ID**, and **Object ID** (from Overview)

### Step 2: Register the Extension Property

Using Graph Explorer (https://developer.microsoft.com/en-us/graph/graph-explorer) or `az rest`:

```http
POST https://graph.microsoft.com/v1.0/applications/{appObjectId}/extensionProperties

{
    "name": "spikeValue",
    "dataType": "String",
    "targetObjects": ["User"]
}
```

Use the **Object ID** from Step 1 (not the Client ID).

The response will confirm the full extension name: `extension_{clientIdNoDashes}_spikeValue`.

### Step 3: Create App Registration B ("spike-spa")

1. New registration → Name: `spike-spa`
2. Supported account types: "Accounts in this organizational directory only"
3. Redirect URI: Single-page application (SPA) → `https://localhost:8443/spike/`
4. No client secret needed (SPA uses PKCE)
5. Note down: **Client ID**

### Step 4: Generate Self-Signed Certificate

```bash
mkdir -p infra/proxy/docker/certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout infra/proxy/docker/certs/localhost.key \
  -out infra/proxy/docker/certs/localhost.crt \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost"
```

### Step 5: Create Azure Storage Account

1. Create a storage account (e.g. `saspike`) in any resource group
2. Create a table named `cmsauth` (Portal → Storage account → Tables → + Table)
3. Copy the **Storage account name** and **Access key** (Portal → Access keys)

### Step 6: Configure .env

Copy `.env.example` to `.env` and fill in the values from Steps 1-5:

```
SPIKE_TENANT_ID=<from step 1>
SPIKE_CLIENT_ID=<App A client ID from step 1>
SPIKE_CLIENT_SECRET=<App A secret from step 1>
SPIKE_REDIRECT_URI=https://localhost:8443/spike/callback
SPIKE_STORE_REDIRECT_URI=https://localhost:8443/spike/store/callback
SPIKE_TABLE_STORE_REDIRECT_URI=https://localhost:8443/spike/table/store/callback
SPIKE_STORAGE_ACCOUNT=<from step 5>
SPIKE_STORAGE_KEY=<from step 5>
```

Edit `spike.html` and set the App B client ID and tenant ID in the MSAL config.

### Step 7: Build and Run

```bash
cd infra/proxy
pnpm build
cd docker
docker-compose -f docker-compose.yml -f docker-compose.spike.yml up --build
```

## Testing Sequence

1. **Increment 1:** Visit `https://localhost:8443/spike/login` → authenticate → see claims page
2. **Increment 2:** Visit `https://localhost:8443/spike/` → click "Login" → acquire token → click "Validate" → see claims JSON
3. **Increment 3:** Visit `https://localhost:8443/spike/store?value=test123` → authenticate → see confirmation
4. **Increment 4:** On the test page → click "Read Stored Value" → see `{ oid: "...", storedValue: "test123" }`
5. **Increment 5:** On the test page → enter a value → click "Store in Table" → authenticate → see confirmation → click "Read from Table" → see `{ oid: "...", storedValue: "...", storage: "saspike/cmsauth" }`

## Security Notes (Spike Only)

- Self-signed cert: browser will warn, accept for localhost
- `js_fetch_verify off`: disables TLS verification for njs `ngx.fetch` calls (needed in Docker, do not use in production)
- Client secret in env vars: acceptable for spike, use certificate auth in production
- `User.ReadWrite.All`: broad permission, scope down for production
- No JWKS signature verification in this spike: validate via claims + optionally Graph `/me` call
- State cookie stores the `value` in plaintext (base64url): encrypt for production

## Build Integration

Add to `infra/proxy/scripts/build.sh` (or handle manually):

- Compile `global-components.spike.ts` → `dist/global-components.spike.js`
- The spike HTML file is mounted directly (no build step)

## Findings: Directory Extension String Limit

Directory extension properties of type `String` are limited to **256 characters**. The CMS auth value we need to store is ~1013 characters, so directory extensions cannot hold it in a single property.

**Sources:**

- [AzureAD Schema extensions limits (String 256 characters) - Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/799018/azuread-schema-extensions-limits-(string-256-chara)
- [Azure AD Graph API Directory Schema Extensions - Microsoft Learn](https://learn.microsoft.com/en-us/previous-versions/azure/ad/graph/howto/azure-ad-graph-api-directory-schema-extensions)

**Options considered:**

| Approach | Pros | Cons |
|----------|------|------|
| Split across 4 extension properties | No extra infra | Brittle if value grows, 100 extension limit per object |
| Azure Table Storage keyed by OID | No size limit, pennies/month, simple REST API | Extra storage account |
| Azure Blob Storage keyed by OID | No size limit, already have blob infra | Heavier API for key-value use case |

**Decision:** Proceed with Azure Table/Blob Storage. The OID-to-value lookup is a natural key-value operation. njs can call the Azure Storage REST API using the same `ngx.fetch` pattern used for Graph API.

## Out of Scope

- JWKS signature verification (can add as stretch goal)
- Token refresh / session management
- Production-grade error pages
- Rate limiting
- Extension property cleanup / logout
- Encryption of stored values
