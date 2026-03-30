# OS Auth Handover

When users navigate between CMS (proxied via Polaris) and OutSystems apps, authentication needs to be transferred. The proxy handles cookie collection and token refresh server-side; the client-side code stores the resulting auth in OS localStorage and redirects to the target.

## Configuration

- **`OS_HANDOVER_URL`** — the `auth-handover.html` page hosted on the OutSystems domain (e.g. `https://cps-dev.outsystemsenterprise.com/Casework_Patterns/auth-handover.html`)
- **`origin`** — derived at runtime from the URL that `global-components.js` was loaded from (e.g. `https://polaris-qa-notprod.cps.gov.uk`). Used to construct `${origin}/polaris`, which hits the proxy's own polaris endpoint.

## Flow 1: Menu link navigation (non-OS to OS app)

When a user is on a proxied CMS page and clicks a menu link targeting OutSystems:

```
+---------------------------------------------------------------------+
| User clicks OS link in menu (e.g. "Work Management")                |
| linkHandoverAdapter detects target is OS app                        |
|                                                                     |
| createOutboundUrlDirect builds URL:                                 |
|   {origin}/polaris?r={OS_HANDOVER_URL}?stage=os-cookie-return       |
|                                       &r={targetUrl}                |
+----------------------------------+----------------------------------+
                                   |
                                   v
+---------------------------------------------------------------------+
| PROXY: /polaris                                                     |
|                                                                     |
| The proxy's own polaris endpoint.                                   |
| Collects CMS cookies, appends them as ?cc= param,                  |
| redirects to /init                                                  |
+----------------------------------+----------------------------------+
                                   |
                                   v
+---------------------------------------------------------------------+
| PROXY: /init                                                        |
|                                                                     |
| Validates redirect URL against AUTH_HANDOVER_WHITELIST.             |
| Appends cookies via ?cc= param.                                    |
| Sets Cms-Session-Hint cookie.                                      |
| Redirects to:                                                       |
|   {OS_HANDOVER_URL}?stage=os-cookie-return&r={targetUrl}&cc={...}  |
+----------------------------------+----------------------------------+
                                   |
                                   v
+---------------------------------------------------------------------+
| OS DOMAIN: auth-handover.html                                       |
| Loads auth-handover.js -> handleOsRedirect()                        |
|                                                                     |
| Stage: os-cookie-return                                             |
|  - Extracts cc (cookies), cms-modern-token, r (target) from URL    |
|  - Stores auth in OS localStorage                                  |
|  - Sets CmsSessionHint if target is /Casework_Blocks/              |
|  - window.location.replace(targetUrl)                              |
+----------------------------------+----------------------------------+
                                   |
                                   v
+---------------------------------------------------------------------+
| TARGET: OutSystems app page                                         |
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
+---------------------------------------------------------------------+
| PROXY: /auth-refresh-outbound                                       |
|                                                                     |
| Extracts handoverEndpoint from Cms-Session-Hint cookie.             |
| Sets X-InternetExplorerMode: 1 header.                              |
| Redirects to {handoverEndpoint}?r={encoded chain}                   |
| (This hits the CMS /polaris endpoint to collect cookies)            |
+----------------------------------+----------------------------------+
                                   |
                                   v
              (same /polaris -> /init -> auth-handover.html
               -> target flow as Flow 1)
```

## History

Previously the client-side code had three stages (`os-outbound`, `os-cookie-return`, `os-token-return`) and required three config URLs (`OS_HANDOVER_URL`, `COOKIE_HANDOVER_URL`, `TOKEN_HANDOVER_URL`). The proxy now handles cookie collection and token refresh server-side, so the client only needs:

- **One config URL**: `OS_HANDOVER_URL` (the auth-handover.html page on the OS domain)
- **One derived URL**: `${origin}/polaris` (the proxy's own polaris endpoint)
- **One stage**: `os-cookie-return` (store auth and redirect to target)
