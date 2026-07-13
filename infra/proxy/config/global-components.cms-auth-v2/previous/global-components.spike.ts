import fs from "fs"
import cryptoModule from "crypto"

// ---------------------------------------------------------------------------
// Constants (injected via js_var from nginx env)
// Access: r.variables.spike_tenant_id etc.
// ---------------------------------------------------------------------------

const SPIKE_HTML_PATH = "/etc/nginx/spike.html"

// Azure AD endpoints (constructed at runtime using tenant ID from r.variables)
function authorizeUrl(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`
}

function tokenUrl(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _base64UrlDecode(str: string): string {
  str = str.replace(/-/g, "+").replace(/_/g, "/")
  while (str.length % 4) {
    str += "="
  }
  return atob(str)
}

function _base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function _generateRandomString(length: number): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map(function (b) { return b.toString(16).padStart(2, "0") })
    .join("")
}

function _getCookie(r: NginxHTTPRequest, name: string): string | null {
  const cookies = r.headersIn["Cookie"]
  if (!cookies) return null
  const match = (cookies as string).match(
    new RegExp("(?:^|;\\s*)" + name + "=([^;]*)")
  )
  return match ? match[1] : null
}

function _decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  try {
    return JSON.parse(_base64UrlDecode(parts[1]))
  } catch {
    return null
  }
}

function _getQueryParam(r: NginxHTTPRequest, name: string): string | null {
  // r.args is the raw query string; use r.variables["arg_" + name] for single params
  const v = r.variables["arg_" + name]
  return v !== undefined ? v as string : null
}

// ---------------------------------------------------------------------------
// Graph API token cache (module-level, sufficient for single-worker spike)
// ---------------------------------------------------------------------------

let _graphTokenCache: { token: string; expiresAt: number } | null = null

async function _getGraphToken(r: NginxHTTPRequest): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000)
  if (_graphTokenCache && _graphTokenCache.expiresAt > now) {
    return _graphTokenCache.token
  }

  const tenantId = r.variables.spike_tenant_id as string
  const clientId = r.variables.spike_client_id as string
  const clientSecret = r.variables.spike_client_secret as string

  const body = [
    "client_id=" + encodeURIComponent(clientId),
    "client_secret=" + encodeURIComponent(clientSecret),
    "scope=" + encodeURIComponent("https://graph.microsoft.com/.default"),
    "grant_type=client_credentials",
  ].join("&")

  try {
    const resp = await ngx.fetch(tokenUrl(tenantId), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Host: "login.microsoftonline.com",
      },
      body: body,
    })

    if (!resp.ok) {
      const errText = await resp.text()
      ngx.log(ngx.ERR, "Graph token request failed: " + resp.status + " " + errText)
      return null
    }

    const respText = await resp.text()
    const data = JSON.parse(respText)
    _graphTokenCache = {
      token: data.access_token,
      expiresAt: now + (data.expires_in - 300), // 5 min buffer
    }
    return _graphTokenCache.token
  } catch (e) {
    ngx.log(ngx.ERR, "Graph token fetch error: " + String(e))
    return null
  }
}

// ---------------------------------------------------------------------------
// Token validation helper
// ---------------------------------------------------------------------------

interface ValidateResult {
  valid: boolean
  claims: Record<string, unknown>
  error?: string
}

function _validateBearerToken(r: NginxHTTPRequest): ValidateResult {
  const authHeader = r.headersIn["Authorization"] as string | undefined
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { valid: false, claims: {}, error: "Missing or invalid Authorization header" }
  }

  const token = authHeader.substring(7)
  const claims = _decodeJwtPayload(token)
  if (!claims) {
    return { valid: false, claims: {}, error: "Invalid JWT format" }
  }

  const tenantId = r.variables.spike_tenant_id as string

  // Check tenant ID
  if (claims.tid !== tenantId) {
    return { valid: false, claims, error: "Tenant ID mismatch" }
  }

  // Check issuer (accept both v1 and v2 formats)
  const iss = claims.iss as string
  const validIssuers = [
    `https://sts.windows.net/${tenantId}/`,
    `https://login.microsoftonline.com/${tenantId}/v2.0`,
  ]
  if (!validIssuers.includes(iss)) {
    return { valid: false, claims, error: "Issuer mismatch: " + iss }
  }

  // Check expiry
  const exp = claims.exp as number
  if (!exp || exp < Math.floor(Date.now() / 1000)) {
    return { valid: false, claims, error: "Token expired" }
  }

  return { valid: true, claims }
}

// ---------------------------------------------------------------------------
// Extension property helpers
// ---------------------------------------------------------------------------

function _extensionName(r: NginxHTTPRequest): string {
  const clientId = r.variables.spike_client_id as string
  const noDashes = clientId.replace(/-/g, "")
  return `extension_${noDashes}_spikeValue`
}

async function _writeExtension(
  r: NginxHTTPRequest,
  oid: string,
  value: string
): Promise<boolean> {
  const graphToken = await _getGraphToken(r)
  if (!graphToken) return false

  const extName = _extensionName(r)
  const body = JSON.stringify({ [extName]: value })

  try {
    const resp = await ngx.fetch(
      `https://graph.microsoft.com/v1.0/users/${oid}`,
      {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + graphToken,
          "Content-Type": "application/json",
          Host: "graph.microsoft.com",
        },
        body: body,
      }
    )

    if (!resp.ok) {
      const errText = await resp.text()
      ngx.log(ngx.ERR, "Graph PATCH failed: " + resp.status + " " + errText)
      return false
    }
    return true
  } catch (e) {
    ngx.log(ngx.ERR, "Graph PATCH error: " + String(e))
    return false
  }
}

async function _readExtension(
  r: NginxHTTPRequest,
  oid: string
): Promise<string | null> {
  const graphToken = await _getGraphToken(r)
  if (!graphToken) return null

  const extName = _extensionName(r)

  try {
    const resp = await ngx.fetch(
      `https://graph.microsoft.com/v1.0/users/${oid}?$select=${extName}`,
      {
        method: "GET",
        headers: {
          Authorization: "Bearer " + graphToken,
          Host: "graph.microsoft.com",
        },
      }
    )

    if (!resp.ok) {
      const errText = await resp.text()
      ngx.log(ngx.ERR, "Graph GET failed: " + resp.status + " " + errText)
      return null
    }

    const respText = await resp.text()
    const data = JSON.parse(respText)
    return data[extName] || null
  } catch (e) {
    ngx.log(ngx.ERR, "Graph GET error: " + String(e))
    return null
  }
}

// ---------------------------------------------------------------------------
// Azure Table Storage helpers (SharedKeyLite auth)
// ---------------------------------------------------------------------------

function _tableStorageAuth(
  account: string,
  key: string,
  dateStr: string,
  canonicalizedResource: string
): string {
  // SharedKeyLite: StringToSign = Date + "\n" + CanonicalizedResource
  const stringToSign = dateStr + "\n" + "/" + account + "/" + canonicalizedResource
  const keyBuffer = Buffer.from(key, "base64")
  const hmac = cryptoModule.createHmac("sha256", keyBuffer).update(stringToSign).digest("base64")
  return "SharedKeyLite " + account + ":" + hmac
}

async function _writeTable(
  r: NginxHTTPRequest,
  oid: string,
  value: string
): Promise<boolean> {
  const account = r.variables.spike_storage_account as string
  const key = r.variables.spike_storage_key as string
  const table = "cmsauth"

  // Upsert entity: PUT with merge
  const url = `https://${account}.table.core.windows.net/${table}(PartitionKey='${oid}',RowKey='cmsAuth')`
  const dateStr = new Date().toUTCString()
  const auth = _tableStorageAuth(account, key, dateStr, `${table}(PartitionKey='${oid}',RowKey='cmsAuth')`)

  const body = JSON.stringify({
    PartitionKey: oid,
    RowKey: "cmsAuth",
    Value: value,
  })

  try {
    const resp = await ngx.fetch(url, {
      method: "PUT",
      headers: {
        Authorization: auth,
        "x-ms-date": dateStr,
        "x-ms-version": "2019-02-02",
        "Content-Type": "application/json",
        Accept: "application/json;odata=nometadata",
        Host: account + ".table.core.windows.net",
      },
      body: body,
    })

    if (!resp.ok) {
      const errText = await resp.text()
      ngx.log(ngx.ERR, "Table Storage PUT failed: " + resp.status + " " + errText)
      return false
    }
    return true
  } catch (e) {
    ngx.log(ngx.ERR, "Table Storage PUT error: " + String(e))
    return false
  }
}

async function _readTable(
  r: NginxHTTPRequest,
  oid: string
): Promise<string | null> {
  const account = r.variables.spike_storage_account as string
  const key = r.variables.spike_storage_key as string
  const table = "cmsauth"

  const url = `https://${account}.table.core.windows.net/${table}(PartitionKey='${oid}',RowKey='cmsAuth')`
  const dateStr = new Date().toUTCString()
  const auth = _tableStorageAuth(account, key, dateStr, `${table}(PartitionKey='${oid}',RowKey='cmsAuth')`)

  try {
    const resp = await ngx.fetch(url, {
      method: "GET",
      headers: {
        Authorization: auth,
        "x-ms-date": dateStr,
        "x-ms-version": "2019-02-02",
        Accept: "application/json;odata=nometadata",
        Host: account + ".table.core.windows.net",
      },
    })

    if (resp.status === 404) {
      return null
    }

    if (!resp.ok) {
      const errText = await resp.text()
      ngx.log(ngx.ERR, "Table Storage GET failed: " + resp.status + " " + errText)
      return null
    }

    const respText = await resp.text()
    const data = JSON.parse(respText)
    return data.Value || null
  } catch (e) {
    ngx.log(ngx.ERR, "Table Storage GET error: " + String(e))
    return null
  }
}

// ---------------------------------------------------------------------------
// ASCII ↔ Unicode compression (inline from cookie-utils)
// ---------------------------------------------------------------------------

function _asciiToUnicode(ascii: string): string {
  const len = ascii.length
  const isOdd = len % 2 !== 0
  const pairCount = Math.floor(len / 2)
  let result = ""

  for (let i = 0; i < pairCount; i++) {
    const hi = ascii.charCodeAt(i * 2)
    const lo = ascii.charCodeAt(i * 2 + 1)
    result += String.fromCharCode((hi << 8) | lo)
  }

  if (isOdd) {
    result += String.fromCharCode(ascii.charCodeAt(len - 1))
    result += String.fromCharCode(0xFFFF)
  }

  return result
}

function _unicodeToAscii(packed: string): string {
  const len = packed.length
  let result = ""

  const isOdd = len >= 2 && packed.charCodeAt(len - 1) === 0xFFFF
  const pairCount = isOdd ? len - 2 : len

  for (let i = 0; i < pairCount; i++) {
    const code = packed.charCodeAt(i)
    result += String.fromCharCode((code >> 8) & 0xFF)
    result += String.fromCharCode(code & 0xFF)
  }

  if (isOdd) {
    result += String.fromCharCode(packed.charCodeAt(len - 2) & 0xFF)
  }

  return result
}

// ---------------------------------------------------------------------------
// OIDC token exchange helper
// ---------------------------------------------------------------------------

interface TokenExchangeResult {
  ok: boolean
  idToken?: string
  accessToken?: string
  claims?: Record<string, unknown>
  error?: string
}

async function _exchangeCodeForTokens(
  r: NginxHTTPRequest,
  code: string,
  redirectUri: string
): Promise<TokenExchangeResult> {
  const tenantId = r.variables.spike_tenant_id as string
  const clientId = r.variables.spike_client_id as string
  const clientSecret = r.variables.spike_client_secret as string

  const body = [
    "client_id=" + encodeURIComponent(clientId),
    "client_secret=" + encodeURIComponent(clientSecret),
    "code=" + encodeURIComponent(code),
    "redirect_uri=" + encodeURIComponent(redirectUri),
    "grant_type=authorization_code",
    "scope=" + encodeURIComponent("openid profile email"),
  ].join("&")

  try {
    const resp = await ngx.fetch(tokenUrl(tenantId), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Host: "login.microsoftonline.com",
      },
      body: body,
    })

    const text = await resp.text()
    if (!resp.ok) {
      return { ok: false, error: "Token exchange failed: " + resp.status + " " + text }
    }

    const data = JSON.parse(text)
    const claims = _decodeJwtPayload(data.id_token)
    if (!claims) {
      return { ok: false, error: "Failed to decode id_token" }
    }

    return {
      ok: true,
      idToken: data.id_token,
      accessToken: data.access_token,
      claims,
    }
  } catch (e) {
    return { ok: false, error: "Token exchange error: " + String(e) }
  }
}

// ---------------------------------------------------------------------------
// Increment 1: OIDC Login + Callback
// ---------------------------------------------------------------------------

function handleLogin(r: NginxHTTPRequest): void {
  const tenantId = r.variables.spike_tenant_id as string
  const clientId = r.variables.spike_client_id as string
  const redirectUri = r.variables.spike_redirect_uri as string

  const state = _generateRandomString(16)
  const nonce = _generateRandomString(16)

  // Set HttpOnly cookies for state and nonce
  const cookieOpts = "; Path=/spike; HttpOnly; SameSite=Lax; Secure; Max-Age=300"
  r.headersOut["Set-Cookie"] = [
    "spike_state=" + state + cookieOpts,
    "spike_nonce=" + nonce + cookieOpts,
  ]

  const params = [
    "client_id=" + encodeURIComponent(clientId),
    "response_type=code",
    "redirect_uri=" + encodeURIComponent(redirectUri),
    "scope=" + encodeURIComponent("openid profile email"),
    "state=" + state,
    "nonce=" + nonce,
    "response_mode=query",
  ].join("&")

  r.return(302, authorizeUrl(tenantId) + "?" + params)
}

async function handleCallback(r: NginxHTTPRequest): Promise<void> {
  r.headersOut["Content-Type"] = "text/html; charset=utf-8"

  // Check for Azure AD errors
  const error = _getQueryParam(r, "error")
  if (error) {
    const desc = _getQueryParam(r, "error_description") || "Unknown error"
    r.return(400, _htmlPage("Auth Error", `<p><strong>${error}</strong></p><p>${desc}</p>`))
    return
  }

  // Validate state
  const stateParam = _getQueryParam(r, "state")
  const stateCookie = _getCookie(r, "spike_state")
  if (!stateParam || !stateCookie || stateParam !== stateCookie) {
    r.return(400, _htmlPage("State Mismatch", "<p>State parameter does not match cookie.</p>"))
    return
  }

  // Exchange code for tokens
  const code = _getQueryParam(r, "code")
  if (!code) {
    r.return(400, _htmlPage("Missing Code", "<p>No authorization code received.</p>"))
    return
  }

  const redirectUri = r.variables.spike_redirect_uri as string
  const result = await _exchangeCodeForTokens(r, code, redirectUri)

  if (!result.ok || !result.claims) {
    r.return(500, _htmlPage("Token Exchange Failed", `<p>${result.error}</p>`))
    return
  }

  // Validate nonce
  const nonceCookie = _getCookie(r, "spike_nonce")
  if (result.claims.nonce !== nonceCookie) {
    r.return(400, _htmlPage("Nonce Mismatch", "<p>Nonce in id_token does not match cookie.</p>"))
    return
  }

  // Clear auth cookies
  const clearOpts = "; Path=/spike; HttpOnly; SameSite=Lax; Secure; Max-Age=0"
  r.headersOut["Set-Cookie"] = [
    "spike_state=deleted" + clearOpts,
    "spike_nonce=deleted" + clearOpts,
  ]

  // Display the claims
  const claims = result.claims
  const rows = Object.entries(claims)
    .map(function (entry) { return `<tr><td><strong>${entry[0]}</strong></td><td>${String(entry[1])}</td></tr>` })
    .join("\n")

  r.return(
    200,
    _htmlPage(
      "OIDC Login Success (Increment 1)",
      `<p>Successfully authenticated via App A OIDC flow.</p>
       <table border="1" cellpadding="8" cellspacing="0">
         <thead><tr><th>Claim</th><th>Value</th></tr></thead>
         <tbody>${rows}</tbody>
       </table>
       <p><a href="/spike/">Go to test page</a> | <a href="/spike/login">Login again</a></p>`
    )
  )
}

// ---------------------------------------------------------------------------
// Increment 2: Test Page + Validate Endpoint
// ---------------------------------------------------------------------------

function handleTestPage(r: NginxHTTPRequest): void {
  r.headersOut["Content-Type"] = "text/html; charset=utf-8"
  try {
    const html = fs.readFileSync(SPIKE_HTML_PATH, "utf8")
    r.return(200, html)
  } catch (e) {
    r.return(500, _htmlPage("Error", "<p>Could not load spike.html: " + String(e) + "</p>"))
  }
}

function handleValidate(r: NginxHTTPRequest): void {
  r.headersOut["Content-Type"] = "application/json"
  r.headersOut["Access-Control-Allow-Origin"] = r.headersIn["Origin"] as string || "*"
  r.headersOut["Access-Control-Allow-Headers"] = "Authorization, Content-Type"

  if (r.method === "OPTIONS") {
    r.return(204, "")
    return
  }

  const result = _validateBearerToken(r)
  if (!result.valid) {
    r.return(401, JSON.stringify({ error: result.error }))
    return
  }

  const c = result.claims
  r.return(
    200,
    JSON.stringify({
      oid: c.oid,
      tid: c.tid,
      preferred_username: c.preferred_username,
      name: c.name,
      iss: c.iss,
      exp: c.exp,
      appid: c.appid || c.azp,
    })
  )
}

// ---------------------------------------------------------------------------
// Increment 3: Store Value (Bearer token + POST body)
// ---------------------------------------------------------------------------

async function handleStore(r: NginxHTTPRequest): Promise<void> {
  r.headersOut["Content-Type"] = "application/json"
  r.headersOut["Access-Control-Allow-Origin"] = r.headersIn["Origin"] as string || "*"
  r.headersOut["Access-Control-Allow-Headers"] = "Authorization, Content-Type"

  if (r.method === "OPTIONS") {
    r.return(204, "")
    return
  }

  const tokenResult = _validateBearerToken(r)
  if (!tokenResult.valid) {
    r.return(401, JSON.stringify({ error: tokenResult.error }))
    return
  }

  const oid = tokenResult.claims.oid as string
  if (!oid) {
    r.return(401, JSON.stringify({ error: "No oid claim in token" }))
    return
  }

  let body: { value: string }
  try {
    body = JSON.parse(r.requestText || "")
  } catch {
    r.return(400, JSON.stringify({ error: "Invalid JSON body" }))
    return
  }

  if (!body.value) {
    r.return(400, JSON.stringify({ error: "Missing value in body" }))
    return
  }

  const stored = await _writeExtension(r, oid, body.value)

  if (!stored) {
    r.return(500, JSON.stringify({ error: "Failed to write extension property", oid }))
    return
  }

  r.return(200, JSON.stringify({
    oid,
    storedValue: body.value,
    extensionName: _extensionName(r),
  }))
}

// ---------------------------------------------------------------------------
// Increment 5: Table Storage Store (Bearer token + POST body)
// ---------------------------------------------------------------------------

async function handleTableStore(r: NginxHTTPRequest): Promise<void> {
  r.headersOut["Content-Type"] = "application/json"
  r.headersOut["Access-Control-Allow-Origin"] = r.headersIn["Origin"] as string || "*"
  r.headersOut["Access-Control-Allow-Headers"] = "Authorization, Content-Type"

  if (r.method === "OPTIONS") {
    r.return(204, "")
    return
  }

  const tokenResult = _validateBearerToken(r)
  if (!tokenResult.valid) {
    r.return(401, JSON.stringify({ error: tokenResult.error }))
    return
  }

  const oid = tokenResult.claims.oid as string
  if (!oid) {
    r.return(401, JSON.stringify({ error: "No oid claim in token" }))
    return
  }

  let body: { value: string }
  try {
    body = JSON.parse(r.requestText || "")
  } catch {
    r.return(400, JSON.stringify({ error: "Invalid JSON body" }))
    return
  }

  if (!body.value) {
    r.return(400, JSON.stringify({ error: "Missing value in body" }))
    return
  }

  const stored = await _writeTable(r, oid, body.value)

  if (!stored) {
    r.return(500, JSON.stringify({ error: "Failed to write to Table Storage", oid }))
    return
  }

  const account = r.variables.spike_storage_account as string
  r.return(200, JSON.stringify({
    oid,
    storedValue: body.value,
    storage: account + "/cmsauth",
  }))
}

async function handleTableRead(r: NginxHTTPRequest): Promise<void> {
  r.headersOut["Content-Type"] = "application/json"
  r.headersOut["Access-Control-Allow-Origin"] = r.headersIn["Origin"] as string || "*"
  r.headersOut["Access-Control-Allow-Headers"] = "Authorization, Content-Type"

  if (r.method === "OPTIONS") {
    r.return(204, "")
    return
  }

  const tokenResult = _validateBearerToken(r)
  if (!tokenResult.valid) {
    r.return(401, JSON.stringify({ error: tokenResult.error }))
    return
  }

  const oid = tokenResult.claims.oid as string
  if (!oid) {
    r.return(401, JSON.stringify({ error: "No oid claim in token" }))
    return
  }

  const storedValue = await _readTable(r, oid)
  const account = r.variables.spike_storage_account as string

  r.return(
    200,
    JSON.stringify({
      oid: oid,
      storedValue: storedValue,
      storage: account + "/cmsauth",
    })
  )
}

// ---------------------------------------------------------------------------
// Increment 4: Read Extension Property
// ---------------------------------------------------------------------------

async function handleRead(r: NginxHTTPRequest): Promise<void> {
  r.headersOut["Content-Type"] = "application/json"
  r.headersOut["Access-Control-Allow-Origin"] = r.headersIn["Origin"] as string || "*"
  r.headersOut["Access-Control-Allow-Headers"] = "Authorization, Content-Type"

  if (r.method === "OPTIONS") {
    r.return(204, "")
    return
  }

  // Validate the Bearer token (from App B)
  const tokenResult = _validateBearerToken(r)
  if (!tokenResult.valid) {
    r.return(401, JSON.stringify({ error: tokenResult.error }))
    return
  }

  const oid = tokenResult.claims.oid as string
  if (!oid) {
    r.return(401, JSON.stringify({ error: "No oid claim in token" }))
    return
  }

  // Read extension property using App A credentials
  const storedValue = await _readExtension(r, oid)

  r.return(
    200,
    JSON.stringify({
      oid: oid,
      storedValue: storedValue,
      extensionName: _extensionName(r),
    })
  )
}

// ---------------------------------------------------------------------------
// Increment 6: Compressed Extension Property Store (Bearer token + POST body)
// ---------------------------------------------------------------------------

async function handleExtCompressStore(r: NginxHTTPRequest): Promise<void> {
  r.headersOut["Content-Type"] = "application/json"
  r.headersOut["Access-Control-Allow-Origin"] = r.headersIn["Origin"] as string || "*"
  r.headersOut["Access-Control-Allow-Headers"] = "Authorization, Content-Type"

  if (r.method === "OPTIONS") {
    r.return(204, "")
    return
  }

  const tokenResult = _validateBearerToken(r)
  if (!tokenResult.valid) {
    r.return(401, JSON.stringify({ error: tokenResult.error }))
    return
  }

  const oid = tokenResult.claims.oid as string
  if (!oid) {
    r.return(401, JSON.stringify({ error: "No oid claim in token" }))
    return
  }

  let body: { value: string }
  try {
    body = JSON.parse(r.requestText || "")
  } catch {
    r.return(400, JSON.stringify({ error: "Invalid JSON body" }))
    return
  }

  if (!body.value) {
    r.return(400, JSON.stringify({ error: "Missing value in body" }))
    return
  }

  // Compress ASCII value into Unicode
  const compressed = _asciiToUnicode(body.value)
  const asciiLen = body.value.length
  const unicodeLen = compressed.length

  if (unicodeLen > 256) {
    r.return(400, JSON.stringify({
      error: "Compressed value exceeds 256-char limit",
      asciiLength: asciiLen,
      compressedLength: unicodeLen,
      maxAsciiInput: 512,
    }))
    return
  }

  const stored = await _writeExtension(r, oid, compressed)

  if (!stored) {
    r.return(500, JSON.stringify({ error: "Failed to write compressed extension property", oid }))
    return
  }

  r.return(200, JSON.stringify({
    oid,
    asciiLength: asciiLen,
    compressedLength: unicodeLen,
    extensionName: _extensionName(r),
  }))
}

async function handleExtCompressRead(r: NginxHTTPRequest): Promise<void> {
  r.headersOut["Content-Type"] = "application/json"
  r.headersOut["Access-Control-Allow-Origin"] = r.headersIn["Origin"] as string || "*"
  r.headersOut["Access-Control-Allow-Headers"] = "Authorization, Content-Type"

  if (r.method === "OPTIONS") {
    r.return(204, "")
    return
  }

  const tokenResult = _validateBearerToken(r)
  if (!tokenResult.valid) {
    r.return(401, JSON.stringify({ error: tokenResult.error }))
    return
  }

  const oid = tokenResult.claims.oid as string
  if (!oid) {
    r.return(401, JSON.stringify({ error: "No oid claim in token" }))
    return
  }

  // Read compressed value from extension property
  const compressed = await _readExtension(r, oid)

  if (!compressed) {
    r.return(
      200,
      JSON.stringify({
        oid: oid,
        storedValue: null,
        compressedLength: null,
        extensionName: _extensionName(r),
      })
    )
    return
  }

  // Decompress Unicode back to ASCII
  const decompressed = _unicodeToAscii(compressed)

  r.return(
    200,
    JSON.stringify({
      oid: oid,
      storedValue: decompressed,
      compressedLength: compressed.length,
      decompressedLength: decompressed.length,
      extensionName: _extensionName(r),
    })
  )
}

// ---------------------------------------------------------------------------
// HTML helper
// ---------------------------------------------------------------------------

function _htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Spike: ${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    td, th { text-align: left; padding: 8px; border: 1px solid #ddd; }
    th { background: #f5f5f5; }
    td:first-child { width: 200px; white-space: nowrap; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
    a { color: #0066cc; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${body}
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export default {
  handleLogin,
  handleCallback,
  handleTestPage,
  handleValidate,
  handleStore,
  handleRead,
  handleTableStore,
  handleTableRead,
  handleExtCompressStore,
  handleExtCompressRead,
}
