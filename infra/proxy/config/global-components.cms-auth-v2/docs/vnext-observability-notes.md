# Recovered notes — soft-mode auth validation & structured logging

These are the substantive vnext-side ideas from the FCT2-14290 encapsulated-CMS-auth spike. They were rejected during patch recovery because vnext has since been restructured (state and cases moved to `main/`). They are independent of the spike itself and worth porting onto whichever module ends up owning the protected routes.

## Soft-mode token validation

The classic shape — `auth_request` returns 200 or 401 — blocks traffic on auth failure. The spike replaces this with a soft mode: **always return 200, never block, but stamp the outcome onto response headers** so downstream filters / logs can see what happened.

```ts
async function handleValidateToken(r: NginxHTTPRequest): Promise<void> {
  const result = _extractAndValidateClaims(r);

  r.headersOut["X-Auth-Oid"] = result.claims.oid || "-";
  r.headersOut["X-Auth-Upn"] =
    result.claims.upn || result.claims.email || result.claims.preferred_username || "-";

  if (result.status !== "ok") {
    r.headersOut["X-Auth-Status"] = result.status;
    r.return(200, "");
    return;
  }

  // Local claims passed — round-trip to Graph as the final check.
  try {
    const response = await ngx.fetch(_adAuthEndpoint, {
      method: "GET",
      headers: { Authorization: r.headersIn["Authorization"] as string },
    });
    r.headersOut["X-Auth-Status"] = response.ok ? "ok" : "graph-rejected";
  } catch (e) {
    r.headersOut["X-Auth-Status"] = "graph-error";
  }
  r.return(200, "");
}
```

### Why soft mode

- **Observability first, enforcement later.** Lets you measure the real-world distribution of auth failures in prod before turning blocking on. Avoids the "we enabled validation and broke 5% of users" outage.
- **No need for a feature flag inside njs.** Hard-mode is a one-line change (`r.return(result.status === "ok" ? 200 : 401, "")`).
- **Rich diagnostics survive** even when the request succeeds at the upstream — the `X-Auth-*` headers travel with the response and can be picked up by `js_header_filter` or downstream logs.

### Status taxonomy

| Status | Meaning |
|---|---|
| `no-token` | No `Authorization: Bearer ...` header |
| `malformed-token` | Bearer header present but the token didn't have 3 dot-separated parts |
| `invalid-claims-empty` | JWT decoded but payload was falsy |
| `invalid-claims-tid[got\|expected]` | Wrong tenant ID — embeds both values for diagnosis |
| `invalid-claims-appid[got\|expected]` | Wrong application ID — embeds both values |
| `decode-error` | Base64 / JSON parse threw |
| `graph-rejected` | Local claims OK but Graph `/v1.0/me` returned non-2xx |
| `graph-error` | Local claims OK but the Graph fetch threw (network, DNS, etc.) |
| `ok` | Local claims valid AND Graph confirmed |

The bracketed `[got\|expected]` form is deliberate — the failure value is preserved, so the log line carries enough context to root-cause without rerunning.

## Structured logging via js_header_filter

`js_header_filter` runs after `proxy_pass` response headers arrive but before the body is sent — it's the right hook for emitting one log line per request including upstream status, timings, and the auth outcome.

Crucial constraint: **header filters cannot `ngx.fetch`.** Sync-only. So the filter cannot re-validate the token against Graph; it can only re-extract claims from the bearer token. That's why `_extractAndValidateClaims` was split out from the Graph round-trip — it has to be callable both async (in the auth_request handler) and sync (in the header filter).

```ts
function logRequest(r: NginxHTTPRequest): void {
  const result = _extractAndValidateClaims(r); // sync — no Graph call
  const oid = result.claims.oid || "-";
  const upn = result.claims.upn || result.claims.email || result.claims.preferred_username || "-";

  r.warn(JSON.stringify({
    tag: "GLOBAL-COMPONENTS",
    x_forwarded_for: r.variables.http_x_forwarded_for || "",
    referer: r.variables.http_referer || "",
    request: r.variables.request || "",
    status: Number(r.variables.status || 0),
    request_length: Number(r.variables.request_length || 0),
    request_time: Number(r.variables.request_time || 0),
    body_bytes_sent: Number(r.variables.body_bytes_sent || 0),
    upstream_response_time: r.variables.upstream_response_time || "",
    upstream_connect_time: r.variables.upstream_connect_time || "",
    upstream_status: r.variables.upstream_status || "",
    oid, upn,
    auth_status: result.status,
  }));
}
```

(The original used manual string concatenation — `JSON.stringify` works in njs and is cleaner.)

### Wiring

```nginx
location ^~ /global-components/api/cases/ {
  location ~ ^/global-components/api/(cases/\d+/(summary|monitoring-codes))$ {
    js_header_filter glocovnext.logRequest;
    # ... proxy_pass etc
  }
  return 404;
}
```

The outer `location ^~ /global-components/api/cases/` wrapper is **not** stylistic — `^~` prefix matches beat regex matches in nginx's location ordering. Without it, a regex location elsewhere can win and the protected route silently isn't protected. The inner regex location keeps the existing matching logic; the wrapper only affects precedence. The `return 404;` catches paths under `/api/cases/` that don't match the inner regex (instead of falling through to whatever else might pick them up).

## Output: where the log lands

`r.warn(...)` writes to nginx's error log at warn level. In Azure App Service the error log is shipped to Application Insights `traces` table. The `tag: "GLOBAL-COMPONENTS"` prefix makes it filterable from generic nginx noise:

```kql
traces
| where message has 'GLOBAL-COMPONENTS'
| extend payload = parse_json(extract(@'(\{.*\})', 1, message))
| project timestamp, oid = payload.oid, upn = payload.upn, auth_status = payload.auth_status, status = payload.status
```

## Other breadcrumbs

- **TENANT_ID typo fix** — current `vnext.ts` has `00dd0d1d-d7e6-`**6338**`-...`; the spike (and `cms-auth-v2.ts`) uses `4338`. One of these is wrong. The spike's value matches what's hardcoded in the cms-auth-v2 default, suggesting `4338` is the real tenant.
- **`APPLICATION_ID` baked in as a constant** rather than read from `process.env` / `r.variables` — simplifies the validation path and removes a config surface, at the cost of needing a redeploy to change tenants. Trade-off worth making for production where tenant doesn't change.
- **`AD_AUTH_ENDPOINT` env-readable with a default** — useful pattern for tests / mock-upstream integration, where you want to override the Graph endpoint to a local mock without changing the real default.
