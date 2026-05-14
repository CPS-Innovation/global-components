# External entry — `stage=ensure-ad`

Public contract for landing a user on a target page with valid AD auth
already in place. Used by:

- External entities (the nginx / njs proxy layer, sibling apps) that want
  to drop a user into the host app pre-authenticated.
- The OS handover paths (`os-cookie-return`, `os-token-return`), which
  bounce through `ensure-ad` before reaching the OS app so the AD check
  happens on the handover endpoint rather than after the OS app has booted.

## Contract

Navigate the user to:

```
https://<host>/<path-to>/auth-handover.html
  ?src=<polaris-bundle-url>
  &stage=ensure-ad
  &returnTo=<final-url>
```

Required params:

| Param      | Purpose                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src`      | Polaris-hosted `auth-handover.js` bundle URL — same allowlisted host that the existing flows use                             |
| `stage`    | Must be `ensure-ad`                                                                                                          |
| `returnTo` | Same-origin URL the user should land at once AD auth is confirmed. Cross-origin values fall back to the handover origin root |

## Behaviour

1. Bundle loads; `dispatchHandover` reads `stage=ensure-ad`.
2. Builds a transient MSAL `PublicClientApplication`. Looks for a cached
   account in localStorage; if one exists, calls `acquireTokenSilent` with
   `User.Read` scope.
3. **Silent success**: user is navigated to `returnTo` via
   `window.location.replace`. No AAD round-trip. No flicker. Same-origin
   validation on `returnTo`.
4. **No cached account, or silent token rejected**: falls through to a
   full-page MSAL `loginRedirect`. AAD prompts (or silently consents),
   bounces back to the same handover endpoint with `stage=ad-redirect`,
   `handleMsalTermination` consumes the response, and the existing
   `MSAL_REDIRECT_RETURN_TO_KEY` stash drives the final navigation to
   `returnTo` from the host's view.
5. **Iframe context**: no-op. The contract is for top-frame navigation.

## Security notes

- `returnTo` is validated same-origin against `window.location.origin`. A
  cross-origin or unparseable value falls back to `${origin}/`, so the
  endpoint can never be used as an open redirector.
- The `src=` host must be on the runtime allowlist embedded in
  `auth-handover.html`. Off-allowlist values cause the bundle injection to
  be skipped silently — the page does nothing.

## AAD app registration

Both forms of the redirect URI must be registered on the AAD app:

```
https://<host>/<path-to>/auth-handover.html?src=<polaris-bundle-url>
https://<host>/<path-to>/auth-handover.html?src=<polaris-bundle-url>&stage=ad-redirect
```

The `ensure-ad` endpoint itself is not a redirect URI — AAD never sees it.
It's an interior dispatcher that either skips the AAD round-trip entirely
(silent path) or transitions to the `ad-redirect` URI for the AAD round-trip
(redirect path).
