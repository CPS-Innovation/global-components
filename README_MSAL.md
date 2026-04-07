# MSAL Authentication — Analysis and Mitigations

## Background

Global-components is a web component (header/menu) that lives as a guest on multiple host app pages. It authenticates users via `@azure/msal-browser` v4 using Azure AD's silent iframe flow (`ssoSilent`). The host apps have their own MSAL instances (same Azure AD tenant, different client IDs) and their own redirect flows that we cannot control.

## The problem

Production analysis of ~2,000 auth errors over 48 hours revealed three categories:

| Error                    | %   | Cause                                                         |
| ------------------------ | --- | ------------------------------------------------------------- |
| `network_error`          | 77% | Page redirects away, killing the fetch to `/token` mid-flight |
| `monitor_window_timeout` | 14% | `ssoSilent` iframe times out after 10 seconds                 |
| AADSTS16000              | 7%  | Multiple AD accounts, no hint, can't disambiguate             |

Correlation with Entra AD sign-in logs showed that **Azure AD processes 100% of requests successfully** — all failures are client-side. 42% of all auth attempts are orphaned (Azure AD issues an auth code but the browser never exchanges it for tokens).

## Root cause: AADSTS50196 loop detection

Using a test rig (`apps/msal-redirect-repro/`), we reproduced the failure:

1. `ssoSilent` starts on a page, the host app redirects, the iframe is killed
2. On the next page, `ssoSilent` starts again — Azure AD is happy, auth succeeds
3. After ~3-4 rapid aborted attempts, Azure AD detects a "client request loop"
4. Azure AD returns **AADSTS50196** as an HTML error page inside the iframe (HTTP 200 instead of 302 redirect)
5. MSAL can't read the cross-origin error page, times out after 10 seconds
6. The user is stuck until Azure AD's loop detection resets

The error rendered inside the iframe:

```
AADSTS50196: The server terminated an operation because it encountered
a client request loop. Please contact your app vendor.
```

Each aborted `ssoSilent` on a redirecting page counts as a "strike" toward the loop detection threshold. Users who navigate through multiple interstitial/redirect pages accumulate strikes and get blocked.

## What does NOT work

### `handleRedirectPromise()`

Standard MSAL guidance says to call `handleRedirectPromise()` after `initialize()`. **Do not do this.** As a guest component, it picks up redirect state from the host app's MSAL flows (shared sessionStorage, same tenant) and causes AADSTS50196 redirect loops. This was deployed to test on 2026-04-02 and immediately broke auth. See the commented-out code in `create-msal-instance.ts` and the warning in `CLAUDE.md`.

### MSAL v5 upgrade

MSAL v5's throttling only covers the `/token` endpoint, not the `/authorize` iframe requests that trigger loop detection. v5 does not help with this problem.

### Third-party cookie blocking

Initial hypothesis was that browser cookie blocking prevented the iframe from completing. Analysis of Entra logs proved Azure AD processes all requests successfully — the iframe completes on Azure AD's side. The failure is AADSTS50196 loop detection, not cookie blocking.

## Mitigations implemented

### 1. `acquireTokenSilent` in the auth fallback chain

**File**: `get-ad-user-account.ts`

`acquireTokenSilent` is now the **primary** auth method, replacing the previous `getActiveAccount()` bare cache check:

```
acquireTokenSilent()     -> cache + refresh token (no iframe, validates tokens are viable)
ssoSilent()              -> iframe to /authorize (only if above fails, with configurable delay)
loginPopup()             -> user interaction (feature-flagged off in prod)
```

Why not `getActiveAccount()` first? It returns an account as long as the account entity exists in localStorage, regardless of whether the tokens are still valid. After a weekend (64h), it would return a stale account — the user appears "authed" but API calls fail because the refresh token is dead. `acquireTokenSilent` actually validates the tokens.

`acquireTokenSilent` is called with `CacheLookupPolicy.AccessTokenAndRefreshToken` which:
- Checks localStorage for a valid access token (with 5-minute expiry buffer) — if found, returns instantly (~7ms)
- If expired, uses the refresh token to POST to `/token` — gets new access token + new refresh token (~200ms, no iframe)
- If the refresh token is also expired — **fails cleanly without falling back to iframe**

The refresh token is rejuvenated on each use, so it stays valid as long as the user visits within ~24 hours. The `getTokenFactory` (used for API calls) also calls `acquireTokenSilent` on every request, proactively refreshing tokens before they expire.

**Impact**: Eliminates the iframe for all returning users within the refresh token lifetime. Only truly cold starts (first visit ever, or after >24h absence) fall through to `ssoSilent`.

### 2. Configurable delay before `ssoSilent`

**File**: `get-ad-user-account.ts`
**Config**: `SSO_SILENT_DELAY_MS` (default: 0, set to 2000 in all environments)

When `acquireTokenSilent` fails (no cached account, or refresh token expired), the code waits until `performance.now()` exceeds `SSO_SILENT_DELAY_MS` before attempting `ssoSilent`. This gives redirecting pages time to navigate away before the iframe fires.

```
Page loads at 0ms
  Host app bootstraps, our component loads...
  acquireTokenSilent() at ~500ms -> no cached accounts, skip
  waitForPageStability() -> 1500ms remaining until 2000ms threshold
  ... if page redirects at 800ms, ssoSilent never fires ...
  ... if page is stable, ssoSilent fires at 2000ms ...
```

**Impact**: Pages that redirect within the configured delay (host app AD redirects, cookie redirects, `/go` interstitials) never fire `ssoSilent`. Zero loop detection strikes are spent on interstitial pages. The one attempt on the stable destination page succeeds.

**Diagnostics**: The delay logs `ssoSilentDelayConfigMs`, `ssoSilentDelayElapsedAtCheckMs`, and `ssoSilentDelayActualWaitMs` for monitoring.

## Key architectural constraints

- **We are a guest component.** We don't own the page. Host apps can redirect at any time. Standard MSAL guidance assumes page ownership and does not apply.
- **We share Azure AD tenant with host apps.** Same tenant, different client IDs. Session state (sessionStorage, cookies) is contested territory.
- **`ssoSilent` uses iframes.** Each call makes a `/authorize` request to Azure AD. Too many rapid requests trigger AADSTS50196 loop detection. This is a server-side limit we cannot change.
- **localStorage persists on the same origin.** MSAL tokens, accounts, and the active account pointer survive page navigations and reloads within the same origin. This is what makes `acquireTokenSilent` from cache work.
- **Refresh tokens rejuvenate.** Each use issues a new refresh token (~24h lifetime for SPAs). As long as the user visits within 24h, the refresh token stays valid indefinitely.

## Test rig

`apps/msal-redirect-repro/` is a standalone HTML page for testing MSAL behaviour with redirects. It can:

- Run `ssoSilent` with configurable redirect delays
- Auto-repro the full abort-redirect-retry cycle
- Log MSAL verbose output and localStorage/sessionStorage state
- Test `acquireTokenSilent` from cache vs refresh token

Use any Azure AD app registration with `http://localhost:3000/` as a registered redirect URI.

## Future work

- **Entry-flow AD redirect + sid hint** — establish the winning AD account before users reach host apps, storing the `sid` in a cross-domain cookie. Solves AADSTS16000 (multiple accounts) and eliminates cold-start `ssoSilent` entirely.
- **Refactor `global-script.ts` authPhase** — move auth to the contextChange phase for better SPA navigation support. Not needed for loop detection (the delay handles that) but improves the overall architecture. See `PLAN-GLOBAL-SCRIPT-ANATOMY.md`.
- **MSAL v5 upgrade** — may be needed for Chrome 142+ iframe security changes, but does not help with loop detection.
