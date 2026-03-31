# OS Auth Handover

When users navigate between CMS (proxied via Polaris) and OutSystems apps, authentication needs to be transferred. The proxy handles cookie collection server-side; the client-side code manages token acquisition, stores the resulting auth in OS localStorage, and redirects to the target.

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
