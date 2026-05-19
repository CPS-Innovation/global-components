# AD redirect failure modes

Reference inventory of failure modes during a full-page MSAL redirect: what
the failure is, where the user ends up, and whether our code gets a chance
to handle it.

## The two-bucket model

Every AAD failure ends up in one of two places:

1. **Stuck on Microsoft.** AAD refuses to redirect, or never reaches our
   `redirectUri` for some other reason. The user looks at a Microsoft-branded
   error page or a browser error. Our code is not invoked.
2. **Bounces back to us** with `#error=…&error_description=…` in the URL
   fragment. Our `auth-handover.js` loads, `handleRedirectPromise()` parses
   the fragment and rejects. We are in our code and can decide what to do.

Assuming the app registration is correct in AAD, the bounce-back bucket
dominates — probably 90%+ of failures.

---

## Stuck on Microsoft (~5–10% of failures)

| Error                               | Cause                                                                                   | What the user sees                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| AADSTS50011                         | `redirectUri` we sent doesn't match what's registered                                   | AAD error page: "The reply URL specified in the request does not match…" |
| AADSTS650056 / 650052               | App reg mis-configuration, multi-tenant consent version mismatch                        | AAD error page                                                           |
| Network failure during `/authorize` | DNS, TLS, host unreachable while the browser is navigating to login.microsoftonline.com | Browser-native error page (chrome://...etc)                              |
| AAD signin server down              | Rare. ~99.99% SLA in normal operation                                                   | AAD 5xx page                                                             |
| User navigates away                 | Closes tab, hits back during AAD prompt                                                 | They're gone — no failure event reaches us                               |

---

## Bounces back to us (~90%+ of failures)

All of these reach `auth-handover.html` with `#error=…` in the fragment.
MSAL rejects in the catch in `handleMsalTermination`.

### User-initiated

| Error                  | Cause                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `access_denied`        | User explicitly clicked Cancel / refused consent at the AAD prompt                                                                                     |
| `interaction_required` | `prompt=none` flow needed UI it couldn't show. Only `ssoSilent` (iframe) path emits this in normal use — full-page redirect doesn't pass `prompt=none` |

### Identity / account state

| Error                         | Cause                                                                                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| AADSTS50105                   | User is not assigned to the app (when assignment is required)                                                                                  |
| AADSTS50057                   | User account is disabled in the directory                                                                                                      |
| AADSTS50034                   | User account does not exist                                                                                                                    |
| AADSTS500011                  | Resource tenant mismatch — user signed in to a different tenant                                                                                |
| AADSTS160021                  | Invalid session — sid mismatch. We work around this on `ssoSilent` via `loginHint`, but the full-redirect path can still trip it on edge cases |
| `MultipleIdentitiesAuthError` | MSAL detects conflicting accounts in cache                                                                                                     |

### MFA / Conditional Access

| Error               | Cause                                             |
| ------------------- | ------------------------------------------------- |
| AADSTS50076 / 50079 | MFA required, session expired                     |
| AADSTS50158         | External security challenge / MFA flow incomplete |
| AADSTS50173         | Fresh token needed (sign-in frequency policy)     |

### Consent

| Error                       | Cause                                                 |
| --------------------------- | ----------------------------------------------------- |
| AADSTS65001 / 65004 / 90094 | User or admin consent required for one or more scopes |

### Server / protocol

| Error                                | Cause                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| AADSTS50196                          | Server-side error in AAD                                                                        |
| AADSTS70008                          | Refresh token expired or revoked                                                                |
| Token endpoint failure post-redirect | Network drop between AAD bounce-back and our `/oauth2/v2.0/token` POST. MSAL `BrowserAuthError` |
| State validation failure             | Mangled URL / expired response state. MSAL rejects                                              |

### Our own infra

| Symptom                                  | Cause                                        |
| ---------------------------------------- | -------------------------------------------- |
| `config.json` fetch fails                | CDN issue, CORS misconfiguration             |
| `auth-handover.js` 404 / blocked         | CDN deploy gap or CSP issue on the host page |
| `handleRedirectPromise()` internal throw | Rare. Ends up in the same catch              |
