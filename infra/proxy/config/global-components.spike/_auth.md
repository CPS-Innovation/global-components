# init?

| Step             | URL                        | Inbound params                                                      | Responsibilities                                                                 |
| ---------------- | -------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Reauth outbound  | `proxy/init/outbound`      | `r`                                                                 | 1) Switch to IE mode; 2) Figure out `/polaris`                                   |
| Append cookie    | `[proxy or CMS]/polaris`   | `[r or legacy params],*,correlation`                                | 1) Convert cookies to query                                                      |
| Receiving cookie | `proxy/init/(orchestrate)` | `[r or legacy params],correlation,cookie,is-proxy-session`          | 1) Switch out of IE mode; 2) Reconcile flow (cwa legacy, ping) and coerce `r`    |
| Token            | `proxy/init/token`         | `r,correlation,cookie,is-proxy-session`                             | 1) Get and verify modern token                                                   |
| AD               | `proxy/init/entra`         | `r,correlation,cookie,is-proxy-session,modern-token`                | 1) Initiate AD flow                                                              |
| AD callback      | `proxy/init/inbound`       | `r,correlation,cookie,is-proxy-session,modern-token,entra-id-token` | 1) Validate AD token 2) store cms auth 3)set cms-session-hint 4) redirect to `r` |

## V2

| Step             | URL                      | Inbound params                                                      | Responsibilities                                                                                                   |
| ---------------- | ------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Reauth outbound  | `proxy/init/outbound`    | `*`                                                                 | 1) Switch to IE mode; 2) add correlations 3) Figure out `/polaris`                                                 |
| Append cookie    | `[proxy or CMS]/polaris` | `*,correlation`                                                     | 1) Convert cookies to query 2) add is-proxy-session                                                                |
| Receiving cookie | `proxy/init/`            | `*,correlation,is-proxy-session,cookie`                             | 1) Switch out of IE mode; 2) Get and verify modern token                                                           |
| AD               | `proxy/init/entra`       | `*,correlation,is-proxy-session,cookie,modern-token`                | 1) Initiate AD flow                                                                                                |
| AD callback      | `proxy/init/inbound`     | `*,correlation,is-proxy-session,cookie,modern-token,entra-id-token` | 1) Validate AD token 2) store cms auth 3)set cms-session-hint 4) Reconcile flow (cwa legacy, ping) redirect to `r` |
| -                | -                        | -                                                                   | -                                                                                                                  |
| Error            | `proxy/init/error`       | `correlation,error-code`                                            | 1) Report to user the failure                                                                                      |

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
