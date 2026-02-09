# init?

| Step             | URL                    | Params                                                              | Responsibilities                                                 |
| ---------------- | ---------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Reauth outbound  | `/init/outbound`       | `*`                                                                 | 1) Switch to IE mode; 2) Figure out `/polaris`                   |
| Append cookie    | `/polaris`             | `*,correlation`                                                     | 1) Convert cookies to query;                                     |
| Receiving cookie | `/init/(orchestrate)`  | `*,correlation,cookie,is-proxy-session`                             | 1) Switch out of IE mode; 2) Reconcile flow/r (cwa legacy, ping) |
| Token            | `/init/token`          | `r,correlation,cookie,is-proxy-session`                             | 1) Get modern token 2) Verify modern token                       |
| AD               | `/init/entra`          | `r,correlation,cookie,is-proxy-session,modern-token`                | 1) Initiate AD flow                                              |
| AD callback      | `/init/entra-callback` | `r,correlation,cookie,is-proxy-session,modern-token,entra-id-token` | 1) Return from AD flow                                           |

# Core flow

`/auth-outbound`

- switch to IE mode
- [figure out which of real or proxied `/polaris` to go to]
- _redirect to `/polaris`_

# Core Core flow

`/polaris`

- take incoming cookie header and append to redirect URL
- if this is our simulation/proxy then we attach `&is-proxy-session`
- _redirect to `/init?cookie=...`_

`/init`

- switch out of IE mode
- set the session hint cookie based on `&is-proxy-session` existing or not
- converts `&cookies` to `&cc`
- if no `&r` param then create it as `/auth-refresh-inbound`
- checks that `&r` passes a whitelist
- _redirect to `&r`_

# CWA continuation

`/auth-refresh-inbound`

- whitelist cookies for relevance to DDEI/CMS
- get Modern token from cookies (classic: `uainGeneratedScript.aspx`)
- verify that token is current (modern: `getUser`)
- Logging: extract and log failed correlation id
- detect flow variant

| Variant: legacy launch from CMS                                | Variant: (Re)auth flow                 |
| -------------------------------------------------------------- | -------------------------------------- |
| Look for `&q={"caseId":123}`                                   | Define redirectURL = `&polaris-ui-url` |
| Get Urn (modern: `getCaseSummary`)                             |                                        |
| Define redirectURL = `/polaris-ui/case-details/{urn}/{caseId}` |                                        |
| (if problem Define redirectURL = `/polaris-ui`)                |                                        |

- set cookie `CMS-Auth-Values = {Cookies,Token,SessionCorrelationId,SessionCreatedTime,CmsVersionId,UserIpAddress}`
- _redirect to `redirectURL`_

  > Can unify these in nginx

## Out systems

Core flow then

`outsystemsenterprise.com/auth-handover`

`/auth-refresh-cms-modern-token`
