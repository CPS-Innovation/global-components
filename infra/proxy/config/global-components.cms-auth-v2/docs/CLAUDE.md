- You have already made notes in `spike.cms-auth.md` but this design supersedes that.
- This work will create `global-components.cms-auth-v2.conf` and `global-components.cms-auth-v2.conf.ts`
- We will retire `...cms-auth.conf` and `...cms-ping.conf` etc having moved `location = /CMS.24.0.01/User/uaulLogin.aspx` into our v2 conf.
- We will change the `iframe` src in `location = /CMS.24.0.01/User/uaulLogin.aspx` to match our new endpoint

| Step             | URL                 | Inbound params                                                      | Responsibilities                                                                                                   |
| ---------------- | ------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Append cookie    | `/polaris-v2`       | `*`                                                                 | 1) Convert cookies to query 2) add is-proxy-session                                                                |
| Receiving cookie | `/init-v2/`         | `*,is-proxy-session,cookie`                                         | 1) Switch out of IE mode; 2) Get and verify modern token 3) add correlation-id                                     |
| AD callback      | `/init-v2/callback` | `*,is-proxy-session,cookie,correlation,modern-token,entra-id-token` | 1) Validate AD token 2) store cms auth 3)set cms-session-hint 4) Reconcile flow (cwa legacy, ping) redirect to `r` |
| -                | -                   | -                                                                   | -                                                                                                                  |
| Error            | `/init-v2/error`    | `*,correlation,error-code`                                          | 1) Report to user the failure                                                                                      |

`/polaris-v2`

- See an existing implementation in `/polaris-2`
- This is a simulation of an endpoint that is on another domain that we do not control, so we are not changing the behaviour of this.
- Adds `cookies` query param and (because this is the simulation) adds `is-proxy-session=true`
- Redirects to `/init-v2`, retaining incoming query params

`/init-v2/`

- See an existing implementation in `/global-components/cms-modern-token`
- Switch out of IE mode
- Generate a correlation id
- Gets the modern token using fetch and the cookies
- Redirects to whatever `/global-components/cms-auth/login` is doing i.e. initiating AD flow, retains the existing query params and adds `correlation-id` and `token`.

`/init-v2/callback`

- See an existing implementation in `/global-components/cms-auth/callback`
- This is where AD redirects back to
- For the first pass we will create a JSON object of {cookies, token, correlationId} and store it in the table storage
- For the first pass we will end on the diagnostics view and I will manually check the table storage.
- We will retain the timings capture.
