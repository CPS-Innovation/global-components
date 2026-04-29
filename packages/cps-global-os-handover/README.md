# OS Auth Handover

When users navigate between CMS (proxied via Polaris) and OutSystems apps, authentication needs to be transferred. The proxy handles cookie collection server-side; the client-side code manages token acquisition, stores the resulting auth in OS localStorage, and redirects to the target.

This package produces two artifacts:

- **`dist/auth-handover.js`** — IIFE browser bundle, deployed via CI alongside `global-components.js` to the Polaris-hosted blob container. Loaded by `auth-handover.html` at runtime.
- **`dist/index.js`** — workspace ES module, consumed by `cps-global-components` (`createOutboundUrlDirect`, `synchroniseOsAuth`).

## `auth-handover.html` (manual deployment by OutSystems team)

`auth-handover.html` lives in the root of this package and is **not** auto-deployed. The OutSystems team uploads it manually as a Resource into each OS environment, under the path embedded in `OS_HANDOVER_URL` in `configuration/config.{env}.json` (currently `Casework_Patterns/auth-handover.html`).

The file is environment-agnostic — the same bytes ship to dev, test and prod. It accepts a `?src=` query parameter that must point to a whitelisted Polaris host (`polaris.cps.gov.uk` or `polaris-qa-notprod.cps.gov.uk`). When the host check passes, it injects `auth-handover.js` (the bundle this package builds) as a `<script>` tag.

**To replace it in OutSystems:**

1. In each environment's `Casework_Patterns` (or equivalent) module, upload the file to `Data` → `Resources`.
2. Set `Public: Yes` and `Deploy Action: Deploy to Target Directory`.
3. Publish.

Updates to this HTML file are rare because it is just the host-side allowlist shim — the actual handover logic lives in `auth-handover.js`, which deploys via CI. See `outsystems-support/readme.md` for the full OS embedding instructions.

## Configuration

- **`OS_HANDOVER_URL`** — the `auth-handover.html` page hosted on the OutSystems domain (e.g. `https://cps-dev.outsystemsenterprise.com/Casework_Patterns/auth-handover.html`). The only remaining per-environment config value for auth handover.
- **script origin** — both `global-components.js` and `auth-handover.js` derive their origin at runtime from their own script URL (via `import.meta.url` / `document.currentScript.src`). This is used to construct:
  - `${origin}/auth-refresh-outbound` — the proxy's auth refresh endpoint, which examines the `Cms-Session-Hint` cookie to find the correct CMS `/polaris` endpoint
  - `${origin}/auth-refresh-cms-modern-token` — the proxy's token endpoint, which proxies to DDEI's `/api/cms-modern-token/`

## Flow 1: Menu link navigation (non-OS to OS app)

When a user is on a proxied CMS page and clicks a menu link targeting OutSystems:

```
+---------------------------------------------------------------------+
| User clicks OS link in menu (e.g. "Work Management")                |
| linkHandoverAdapter detects target is OS app                        |
|                                                                     |
| createOutboundUrlDirect builds URL:                                 |
|   {origin}/auth-refresh-outbound?r={OS_HANDOVER_URL}                |
|              ?stage=os-cookie-return&r={targetUrl}                   |
+----------------------------------+----------------------------------+
                                   |
                                   v
+---------------------------------------------------------------------+
| PROXY: /auth-refresh-outbound                                       |
|                                                                     |
| Examines Cms-Session-Hint cookie to find handoverEndpoint.          |
| Falls back to DEFAULT_UPSTREAM_CMS_DOMAIN_NAME.                     |
| Redirects to {handoverEndpoint}?r={...} (the CMS /polaris endpoint) |
+----------------------------------+----------------------------------+
                                   |
                                   v
+---------------------------------------------------------------------+
| CMS: /polaris -> PROXY: /init                                       |
|                                                                     |
| Validates redirect URL against AUTH_HANDOVER_WHITELIST.              |
| Appends cookies via ?cc= param.                                     |
| Sets Cms-Session-Hint cookie.                                       |
| Redirects to:                                                        |
|   {OS_HANDOVER_URL}?stage=os-cookie-return&r={targetUrl}&cc={...}   |
+----------------------------------+----------------------------------+
                                   |
                                   v
+---------------------------------------------------------------------+
| OS DOMAIN: auth-handover.html                                       |
| Loads auth-handover.js -> handleOsRedirect()                        |
|                                                                     |
| Stage: os-cookie-return                                              |
|  - Extracts cc (cookies) from URL                                   |
|  - If cookies match localStorage: skip to target (auth still valid) |
|  - If not: redirect to TOKEN_HANDOVER_URL with stage=os-token-return|
+----------------------------------+----------------------------------+
                                   |
                    (if token needed)
                                   v
+---------------------------------------------------------------------+
| PROXY: /auth-refresh-cms-modern-token                               |
|                                                                     |
| Proxies to DDEI's /api/cms-modern-token/                            |
| Returns redirect with cms-modern-token param                        |
+----------------------------------+----------------------------------+
                                   |
                                   v
+---------------------------------------------------------------------+
| OS DOMAIN: auth-handover.html (second visit)                        |
|                                                                     |
| Stage: os-token-return                                               |
|  - Extracts cc, cms-modern-token, r (target) from URL               |
|  - Stores auth (cookies + token) in OS localStorage                 |
|  - Sets CmsSessionHint if target is /Casework_Blocks/               |
|  - window.location.replace(targetUrl)                               |
+----------------------------------+----------------------------------+
                                   |
                                   v
+---------------------------------------------------------------------+
| TARGET: OutSystems app page                                          |
| User arrives with CMS auth stored in localStorage                   |
+---------------------------------------------------------------------+
```

## Flow 2: Case review redirect (proxy-initiated)

When the proxy itself orchestrates navigation to CaseReview:

```
+---------------------------------------------------------------------+
| PROXY: /case-review-redirect?CMSCaseId=42&URN=12AB3456789           |
|                                                                     |
| handleCaseReviewRedirect():                                         |
|  - Extracts handoverEndpoint from Cms-Session-Hint cookie           |
|  - Falls back to DEFAULT_UPSTREAM_CMS_DOMAIN_NAME                   |
|  - Redirects to /auth-refresh-outbound with encoded chain:          |
|    auth-handover.html?stage=os-cookie-return                        |
|                      &src={auth-handover.js}                        |
|                      &r={CaseReview/LandingPage}                    |
+----------------------------------+----------------------------------+
                                   |
                                   v
              (same /auth-refresh-outbound -> CMS /polaris -> /init
               -> auth-handover.html flow as Flow 1)
```

## History

Previously the client-side code had three stages (`os-outbound`, `os-cookie-return`, `os-token-return`) and required three config URLs (`OS_HANDOVER_URL`, `COOKIE_HANDOVER_URL`, `TOKEN_HANDOVER_URL`). Both `COOKIE_HANDOVER_URL` and `TOKEN_HANDOVER_URL` are now derived at runtime from the script origin (`document.currentScript.src`), and `os-outbound` has been removed (it was already bypassed by `createOutboundUrlDirect`). The deploy script no longer injects any values into `auth-handover.js`. This leaves:

- **One config URL**: `OS_HANDOVER_URL` (the auth-handover.html page on the OS domain)
- **Two derived URLs**: `${origin}/auth-refresh-outbound` and `${origin}/auth-refresh-cms-modern-token`
- **Two stages**: `os-cookie-return` (cookie check, skip or fetch token) and `os-token-return` (store auth and redirect)
