# Spike: CMS Auth — Azure AD OIDC + Table Storage on nginx/njs

## Goal

Prove that the QA proxy (nginx/njs) can perform a complete encapsulated CMS authentication flow:

1. Receive an inbound request carrying a landing URL and cookie value
2. Redirect the user through Azure AD OIDC authentication
3. Exchange the authorization code for tokens server-side
4. Validate the id_token (nonce, tenant, issuer, expiry)
5. Extract the user's OID from the token
6. Write the OID-to-cookie mapping to Azure Table Storage
7. Read it back to confirm persistence

All of this happens within the proxy layer — no application code changes required.

## Architecture

```
Browser
  │
  ▼
/polaris?polaris-ui-url=/global-components/cms-auth/login
  │
  ▼  (existing init flow passes r + cc params)
/global-components/cms-auth/login
  │  njs: generate state/nonce, encode into cookie, redirect
  ▼
Azure AD /oauth2/v2.0/authorize
  │  user authenticates (SSO or interactive)
  ▼
/global-components/cms-auth/callback?code=...&state=...
  │  njs: exchange code → tokens (POST to Azure AD)
  │  njs: validate id_token
  │  njs: write OID → cookie to Table Storage (PUT)
  │  njs: read back from Table Storage (GET)
  ▼
Diagnostic HTML page (all results displayed)
```

## Files

| File | Purpose |
|------|---------|
| `global-components.cms-auth.ts` | njs module — login redirect + callback handler + Table Storage helpers |
| `global-components.cms-auth.conf` | nginx config — two locations (`/login` and `/callback`) |
| `.env` | Environment variables (secrets, not committed with values) |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CPS_GLOBAL_COMPONENTS_CMS_AUTH_TENANT_ID` | Azure AD tenant ID |
| `CPS_GLOBAL_COMPONENTS_CMS_AUTH_CLIENT_ID` | App registration client ID |
| `CPS_GLOBAL_COMPONENTS_CMS_AUTH_CLIENT_SECRET` | App registration client secret |
| `CPS_GLOBAL_COMPONENTS_CMS_AUTH_REDIRECT_URI` | OAuth callback URL |
| `CPS_GLOBAL_COMPONENTS_CMS_AUTH_STORAGE_ACCOUNT` | Azure Table Storage account name |
| `CPS_GLOBAL_COMPONENTS_CMS_AUTH_STORAGE_KEY` | Azure Table Storage account key |

## Table Storage Schema

- **Table**: `cmsauth`
- **PartitionKey**: user's OID (from id_token `oid` claim)
- **RowKey**: `cmsAuth`
- **Value**: the cookie value (`cc` param from the init flow)

Authentication uses SharedKeyLite (HMAC-SHA256).

## Token Validation

The id_token is validated for:

1. **Nonce** — matches the nonce stored in the state cookie
2. **Tenant ID** — `tid` claim matches configured tenant
3. **Issuer** — `iss` is one of the valid Azure AD issuer URLs
4. **Expiry** — `exp` is in the future

No JWKS signature verification (not available in njs without external modules).

## Results

Tested on QA deployment (`polaris-qa-notprod.cps.gov.uk`). All steps pass:

- AD authentication: PASS
- Token validation: PASS
- Storage write: PASS
- Storage read-back: PASS (correct cookie value returned)

### Timing (representative run)

| Event | Elapsed | Delta |
|-------|---------|-------|
| Login handler | 0 ms | — |
| Redirect to AD | 1 ms | +1 ms |
| Callback start | 396 ms | +395 ms |
| Token exchange start | 396 ms | +0 ms |
| Token exchange done | 578 ms | +182 ms |
| Token validation start | 578 ms | +0 ms |
| Token validation done | 578 ms | +0 ms |
| Storage write start | 578 ms | +0 ms |
| Storage write done | 599 ms | +21 ms |
| Storage read start | 599 ms | +0 ms |
| Storage read done | 618 ms | +19 ms |
| Render page | 618 ms | +0 ms |

**Total server-side processing: 618 ms** (of which ~395 ms is the AD redirect round-trip through the browser, ~182 ms is the token exchange, and ~40 ms is the two Table Storage operations).

## Conclusions

- The nginx/njs proxy can handle the full OIDC flow + Table Storage persistence in ~220 ms of server-side work (excluding the browser redirect to AD).
- Table Storage round-trips are ~20 ms each — fast enough for inline use during auth.
- The approach is viable for encapsulating CMS authentication entirely within the proxy layer.
