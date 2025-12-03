/**
 * Proxy integration tests
 *
 * These tests verify the nginx proxy behavior, particularly around
 * header/cookie handling and URL rewriting.
 *
 * Prerequisites:
 *   - Docker compose stack running (nginx proxy + mock-server)
 *   - Run with: node infra/proxy/tests/proxy.integration.test.js
 *
 * The mock server echoes back headers it receives, allowing us to verify
 * what the proxy sends upstream.
 */

const PROXY_BASE = process.env.PROXY_BASE || "http://localhost:8080"
const TEST_ENDPOINT = `${PROXY_BASE}/api/global-components/test`

// Test results tracking
let passed = 0
let failed = 0
const results = []

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message}\n  Expected: ${JSON.stringify(
        expected
      )}\n  Actual:   ${JSON.stringify(actual)}`
    )
  }
}

async function test(name, fn) {
  try {
    await fn()
    passed++
    results.push({ name, status: "PASS" })
    console.log(`  ✓ ${name}`)
  } catch (err) {
    failed++
    results.push({ name, status: "FAIL", error: err.message })
    console.log(`  ✗ ${name}`)
    console.log(`    ${err.message}`)
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    // Accept self-signed certs in dev
    ...(process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ? {} : {}),
  })
  return response.json()
}

// =============================================================================
// Upstream Proxy Authentication Tests
// =============================================================================
// Note: The catch-all route now requires token validation via auth_request.
// These tests verify that unauthenticated requests are rejected.
// The actual Cms-Auth-Values header/cookie processing is tested in unit tests.

async function testUpstreamProxyAuth() {
  console.log("\nUpstream Proxy Authentication Tests:")

  await test("returns 401 when no Authorization header is provided", async () => {
    const response = await fetch(TEST_ENDPOINT)
    assertEqual(
      response.status,
      401,
      "Should return 401 without Authorization header"
    )
  })

  await test("returns 401 when invalid Authorization header is provided", async () => {
    const response = await fetch(TEST_ENDPOINT, {
      headers: { Authorization: "Bearer invalid-token" },
    })
    assertEqual(response.status, 401, "Should return 401 for invalid token")
  })

  await test("returns 401 even with Cms-Auth-Values header", async () => {
    const response = await fetch(TEST_ENDPOINT, {
      headers: { "Cms-Auth-Values": "userId=123" },
    })
    assertEqual(
      response.status,
      401,
      "Should return 401 - auth required before proxy"
    )
  })

  await test("returns 401 even with Cms-Auth-Values cookie", async () => {
    const response = await fetch(TEST_ENDPOINT, {
      headers: { Cookie: "Cms-Auth-Values=userId=123" },
    })
    assertEqual(
      response.status,
      401,
      "Should return 401 - auth required before proxy"
    )
  })

  // Note: Successful proxy requests require a valid Microsoft Graph token.
  // When authenticated, the proxy will:
  // - Pass through Cms-Auth-Values header/cookie (decoded) to upstream
  // - Add x-functions-key header
  // - Strip Authorization header from upstream request
}

// =============================================================================
// Swagger URL Rewriting Tests
// =============================================================================

async function testSwaggerRewriting() {
  console.log("\nSwagger URL Rewriting Tests:")

  await test("rewrites upstream URL in swagger.json", async () => {
    const response = await fetch(
      `${PROXY_BASE}/global-components/swagger.json`
    )
    const text = await response.text()

    // Should NOT contain the upstream URL
    assert(
      !text.includes("mock-upstream:3000"),
      "Should not contain upstream URL"
    )

    // Should contain the proxy URL
    assert(
      text.includes("/global-components"),
      "Should contain proxy path prefix"
    )
  })

  await test("rewrites API paths in swagger.json", async () => {
    const response = await fetch(
      `${PROXY_BASE}/global-components/swagger.json`
    )
    const json = await response.json()

    // Paths should be prefixed with /global-components
    const paths = Object.keys(json.paths || {})
    for (const path of paths) {
      assert(
        path.startsWith("/global-components"),
        `Path ${path} should start with /global-components`
      )
    }
  })
}

// =============================================================================
// x-functions-key Header Tests
// =============================================================================
// Note: These tests require a valid Microsoft Graph token to reach upstream.
// The header injection is verified via unit tests in global-components.unit.test.js.
// When auth is working, the proxy adds x-functions-key to upstream requests.

// =============================================================================
// CORS Tests
// =============================================================================

async function testCors() {
  console.log("\nCORS Tests:")

  await test("returns CORS headers on regular requests", async () => {
    const response = await fetch(TEST_ENDPOINT, {
      headers: { Origin: "https://example.com" },
    })
    const corsHeader = response.headers.get("access-control-allow-origin")
    assert(
      corsHeader !== null,
      "Should have Access-Control-Allow-Origin header"
    )
  })

  await test("handles OPTIONS preflight request", async () => {
    const response = await fetch(TEST_ENDPOINT, {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "POST",
      },
    })
    assertEqual(response.status, 204, "OPTIONS should return 204")

    const allowMethods = response.headers.get("access-control-allow-methods")
    assert(
      allowMethods !== null,
      "Should have Access-Control-Allow-Methods header"
    )
  })
}

// =============================================================================
// Authorization Header Stripping Tests
// =============================================================================
// Note: These tests require a valid Microsoft Graph token to reach upstream.
// The Authorization stripping is verified via nginx config inspection.
// When auth is working, the proxy strips Authorization before proxying upstream.

// =============================================================================
// Health Check Tests
// =============================================================================

async function testHealthCheck() {
  console.log("\nHealth Check Tests:")

  await test("base endpoint returns JSON with status and version", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components`)
    assertEqual(response.status, 200, "Health endpoint should return 200")
    const contentType = response.headers.get("content-type")
    assert(contentType.includes("application/json"), "Should return JSON")
    const body = await response.json()
    assertEqual(body.status, "online", "Should have status online")
    assert(typeof body.version === "number", "Should have numeric version")
  })
}

// =============================================================================
// Session Hint Tests
// =============================================================================

async function testSessionHint() {
  console.log("\nSession Hint Tests (/global-components/session-hint):")

  const SESSION_HINT_ENDPOINT = `${PROXY_BASE}/global-components/session-hint`

  await test('returns "null" when no cms-session-hint cookie is present', async () => {
    const response = await fetch(SESSION_HINT_ENDPOINT)
    const text = await response.text()
    assertEqual(response.status, 200, "Should return 200")
    assertEqual(text, "null", 'Should return "null" when no cookie present')
  })

  await test("returns cookie value when cms-session-hint cookie is present", async () => {
    const hintValue = JSON.stringify({
      cmsDomains: ["foo.cps.gov.uk"],
      isProxySession: false,
      handoverEndpoint: null,
    })
    const response = await fetch(SESSION_HINT_ENDPOINT, {
      headers: { Cookie: `cms-session-hint=${encodeURIComponent(hintValue)}` },
    })
    const text = await response.text()
    assertEqual(response.status, 200, "Should return 200")
    assertEqual(text, hintValue, "Should return decoded cookie value")
  })

  await test("decodes URL-encoded cookie value", async () => {
    const hintValue = JSON.stringify({
      cmsDomains: ["test.cps.gov.uk"],
      isProxySession: true,
      handoverEndpoint: "https://test.cps.gov.uk/polaris",
    })
    const encodedValue = encodeURIComponent(hintValue)
    const response = await fetch(SESSION_HINT_ENDPOINT, {
      headers: { Cookie: `cms-session-hint=${encodedValue}` },
    })
    const text = await response.text()
    assertEqual(response.status, 200, "Should return 200")
    // The value should be decoded
    const parsed = JSON.parse(text)
    assert(Array.isArray(parsed.cmsDomains), "Should have cmsDomains array")
    assertEqual(parsed.isProxySession, true, "Should have isProxySession true")
    assertEqual(
      parsed.handoverEndpoint,
      "https://test.cps.gov.uk/polaris",
      "Should have correct handoverEndpoint"
    )
  })

  await test("handles cookie among other cookies", async () => {
    const hintValue = JSON.stringify({
      cmsDomains: [],
      isProxySession: false,
      handoverEndpoint: null,
    })
    const response = await fetch(SESSION_HINT_ENDPOINT, {
      headers: {
        Cookie: `other=value; cms-session-hint=${encodeURIComponent(
          hintValue
        )}; another=cookie`,
      },
    })
    const text = await response.text()
    assertEqual(response.status, 200, "Should return 200")
    assertEqual(
      text,
      hintValue,
      "Should extract correct cookie from multiple cookies"
    )
  })

  await test("handles OPTIONS preflight request", async () => {
    const response = await fetch(SESSION_HINT_ENDPOINT, {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "GET",
      },
    })
    assertEqual(response.status, 204, "OPTIONS should return 204")
    const allowMethods = response.headers.get("access-control-allow-methods")
    assert(
      allowMethods !== null,
      "Should have Access-Control-Allow-Methods header"
    )
  })

  await test("returns CORS headers on regular requests", async () => {
    const response = await fetch(SESSION_HINT_ENDPOINT, {
      headers: { Origin: "https://example.com" },
    })
    const corsHeader = response.headers.get("access-control-allow-origin")
    assert(
      corsHeader !== null,
      "Should have Access-Control-Allow-Origin header"
    )
    const credentialsHeader = response.headers.get(
      "access-control-allow-credentials"
    )
    assertEqual(
      credentialsHeader,
      "true",
      "Should have Access-Control-Allow-Credentials: true"
    )
  })
}

// =============================================================================
// Preview Page Tests
// =============================================================================

async function testPreviewPage() {
  console.log("\nPreview Page Tests (/global-components/preview):")

  const PREVIEW_ENDPOINT = `${PROXY_BASE}/global-components/preview`

  await test("returns HTML content", async () => {
    const response = await fetch(PREVIEW_ENDPOINT)
    assertEqual(response.status, 200, "Should return 200")
    const text = await response.text()
    assert(
      text.includes("<!DOCTYPE html>") || text.includes("<html"),
      "Should return HTML content"
    )
  })

  await test("returns Content-Type text/html", async () => {
    const response = await fetch(PREVIEW_ENDPOINT)
    const contentType = response.headers.get("content-type")
    assert(
      contentType !== null && contentType.includes("text/html"),
      `Content-Type should be text/html, got: ${contentType}`
    )
  })

  await test("handles OPTIONS preflight request", async () => {
    const response = await fetch(PREVIEW_ENDPOINT, {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "GET",
      },
    })
    assertEqual(response.status, 204, "OPTIONS should return 204")
    const allowMethods = response.headers.get("access-control-allow-methods")
    assert(
      allowMethods !== null,
      "Should have Access-Control-Allow-Methods header"
    )
  })
}

// =============================================================================
// State Endpoint Tests
// =============================================================================
// GET is public only for whitelisted keys (e.g. "preview"), PUT always requires auth.

async function testStateEndpoint() {
  console.log("\nState Endpoint Tests (/global-components/state/*):")

  const PREVIEW_ENDPOINT = `${PROXY_BASE}/global-components/state/preview`
  const OTHER_ENDPOINT = `${PROXY_BASE}/global-components/state/other-key`

  await test("GET on whitelisted key (preview) returns 200 without auth", async () => {
    const response = await fetch(PREVIEW_ENDPOINT)
    assertEqual(response.status, 200, "GET should return 200 without auth")
    const text = await response.text()
    assertEqual(text, "null", 'Should return "null" when no cookie present')
  })

  await test("GET on whitelisted key returns cookie value without auth", async () => {
    const stateValue = JSON.stringify({ foo: "bar" })
    const response = await fetch(PREVIEW_ENDPOINT, {
      headers: {
        Cookie: `cps-global-components-state=${encodeURIComponent(stateValue)}`,
      },
    })
    assertEqual(response.status, 200, "GET should return 200")
    const text = await response.text()
    assertEqual(text, stateValue, "Should return cookie value")
  })

  await test("GET on non-whitelisted key returns 401 without auth", async () => {
    const response = await fetch(OTHER_ENDPOINT)
    assertEqual(
      response.status,
      401,
      "GET should return 401 for non-whitelisted key"
    )
  })

  await test("PUT returns 401 when no Authorization header is provided", async () => {
    const response = await fetch(PREVIEW_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test: "data" }),
    })
    assertEqual(
      response.status,
      401,
      "Should return 401 without Authorization header"
    )
  })

  await test("PUT returns 401 when invalid Authorization header is provided", async () => {
    const response = await fetch(PREVIEW_ENDPOINT, {
      method: "PUT",
      headers: {
        Authorization: "Bearer invalid-token-12345",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ test: "data" }),
    })
    assertEqual(response.status, 401, "Should return 401 for invalid token")
  })

  await test("handles OPTIONS preflight request", async () => {
    const response = await fetch(PREVIEW_ENDPOINT, {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "PUT",
      },
    })
    assertEqual(response.status, 204, "OPTIONS should return 204")
    const allowMethods = response.headers.get("access-control-allow-methods")
    assert(
      allowMethods !== null,
      "Should have Access-Control-Allow-Methods header"
    )
    assert(allowMethods.includes("PUT"), "Should allow PUT method")
  })

  // Note: We cannot test successful PUT operations without a valid
  // Microsoft Graph API token. PUT requires valid token with correct tid/appid.
}

// =============================================================================
// Upstream Handover Health Check Tests
// =============================================================================

async function testUpstreamHealthCheck() {
  console.log("\nUpstream Handover Health Check Tests:")

  const HEALTH_CHECK_ENDPOINT = `${PROXY_BASE}/global-components/upstream-handover-health-check`

  await test("returns 400 when url parameter is missing", async () => {
    const response = await fetch(HEALTH_CHECK_ENDPOINT)
    const json = await response.json()
    assertEqual(response.status, 400, "Should return 400")
    assertEqual(
      json.error,
      "url parameter required",
      "Should have correct error message"
    )
  })

  await test("returns 403 when url is not in whitelist", async () => {
    const response = await fetch(`${HEALTH_CHECK_ENDPOINT}?url=http://evil.com`)
    const json = await response.json()
    assertEqual(response.status, 403, "Should return 403")
    assertEqual(
      json.error,
      "url not in whitelist",
      "Should have correct error message"
    )
    assertEqual(json.url, "http://evil.com", "Should include the rejected url")
  })

  await test("returns health check result for whitelisted url", async () => {
    const whitelistedUrl = "http://mock-upstream:3000/api/health"
    const response = await fetch(
      `${HEALTH_CHECK_ENDPOINT}?url=${encodeURIComponent(whitelistedUrl)}`
    )
    const json = await response.json()
    assertEqual(response.status, 200, "Should return 200")
    assertEqual(json.url, whitelistedUrl, "Should include the checked url")
    assert(typeof json.status === "number", "Should include numeric status")
    assert(
      typeof json.healthy === "boolean",
      "Should include boolean healthy flag"
    )
  })

  await test("returns Content-Type application/json", async () => {
    const response = await fetch(HEALTH_CHECK_ENDPOINT)
    const contentType = response.headers.get("content-type")
    assert(
      contentType !== null && contentType.includes("application/json"),
      "Content-Type should be application/json"
    )
  })
}

// =============================================================================
// Auth Redirect Tests (/init endpoint)
// =============================================================================

async function testAuthRedirect() {
  console.log("\nAuth Redirect Tests (/init endpoint):")

  const INIT_ENDPOINT = `${PROXY_BASE}/init`

  await test("redirects to whitelisted URL with cookie appended", async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=session%3Dabc123`,
      {
        redirect: "manual",
        headers: {
          "X-Forwarded-Proto": "https",
          Host: "localhost:8080",
        },
      }
    )
    assertEqual(response.status, 302, "Should return 302 redirect")
    const location = response.headers.get("location")
    assert(location !== null, "Should have Location header")
    assert(
      location.includes("/auth-refresh-inbound"),
      `Should redirect to auth-refresh-inbound, got: ${location}`
    )
    assert(
      location.includes("cc="),
      `Should include cc param, got: ${location}`
    )
  })

  await test("returns 403 for non-whitelisted URL", async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=http://evil.com/callback&cookie=session%3Dabc`,
      {
        redirect: "manual",
        headers: {
          "X-Forwarded-Proto": "https",
          Host: "localhost:8080",
        },
      }
    )
    assertEqual(
      response.status,
      403,
      "Should return 403 for non-whitelisted URL"
    )
  })

  await test("sets cms-session-hint cookie with correct attributes", async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=PREFIX-foo.cps.gov.uk_POOL%3Dvalue`,
      {
        redirect: "manual",
        headers: {
          "X-Forwarded-Proto": "https",
          Host: "localhost:8080",
        },
      }
    )
    const setCookie = response.headers.get("set-cookie")
    assert(setCookie !== null, "Should have Set-Cookie header")
    assert(
      setCookie.includes("cms-session-hint="),
      "Should set cms-session-hint cookie"
    )
    assert(setCookie.includes("Path=/"), "Should have Path=/")
    assert(setCookie.includes("Secure"), "Should have Secure attribute")
    assert(setCookie.includes("SameSite=None"), "Should have SameSite=None")
    assert(setCookie.includes("Expires="), "Should have Expires attribute")
  })

  await test("session hint cookie contains valid JSON with cmsDomains array", async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=PREFIX-foo.bar.cps.gov.uk_POOL%3Dx%3BPREFIX-other.cps.gov.uk_POOL%3Dy`,
      {
        redirect: "manual",
        headers: {
          "X-Forwarded-Proto": "https",
          Host: "localhost:8080",
        },
      }
    )
    const setCookie = response.headers.get("set-cookie")
    const match = setCookie.match(/cms-session-hint=([^;]+)/)
    assert(match !== null, "Should be able to extract cookie value")
    const hint = JSON.parse(decodeURIComponent(match[1]))
    assert(Array.isArray(hint.cmsDomains), "cmsDomains should be an array")
    assert(
      hint.cmsDomains.includes("foo.bar.cps.gov.uk"),
      `Should include first CMS domain, got: ${JSON.stringify(hint.cmsDomains)}`
    )
    assert(
      hint.cmsDomains.includes("other.cps.gov.uk"),
      `Should include second CMS domain, got: ${JSON.stringify(
        hint.cmsDomains
      )}`
    )
  })

  await test("session hint cookie has isProxySession false by default", async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=PREFIX-foo.cps.gov.uk_POOL%3Dvalue`,
      {
        redirect: "manual",
        headers: {
          "X-Forwarded-Proto": "https",
          Host: "localhost:8080",
        },
      }
    )
    const setCookie = response.headers.get("set-cookie")
    const match = setCookie.match(/cms-session-hint=([^;]+)/)
    const hint = JSON.parse(decodeURIComponent(match[1]))
    assertEqual(
      hint.isProxySession,
      false,
      "isProxySession should be false by default"
    )
  })

  await test("session hint cookie has isProxySession true when param set", async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=PREFIX-foo.cps.gov.uk_POOL%3Dvalue&is-proxy-session=true`,
      {
        redirect: "manual",
        headers: {
          "X-Forwarded-Proto": "https",
          Host: "localhost:8080",
        },
      }
    )
    const setCookie = response.headers.get("set-cookie")
    const match = setCookie.match(/cms-session-hint=([^;]+)/)
    const hint = JSON.parse(decodeURIComponent(match[1]))
    assertEqual(
      hint.isProxySession,
      true,
      "isProxySession should be true when param set"
    )
  })

  await test("session hint has handoverEndpoint using host when isProxySession true", async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=PREFIX-foo.cps.gov.uk_POOL%3Dvalue&is-proxy-session=true`,
      {
        redirect: "manual",
        headers: {
          "X-Forwarded-Proto": "https",
          Host: "localhost:8080",
        },
      }
    )
    const setCookie = response.headers.get("set-cookie")
    const match = setCookie.match(/cms-session-hint=([^;]+)/)
    const hint = JSON.parse(decodeURIComponent(match[1]))
    assertEqual(
      hint.handoverEndpoint,
      "https://localhost:8080/polaris",
      "handoverEndpoint should use request host when isProxySession"
    )
  })

  await test("session hint has handoverEndpoint using first cmsDomain when not proxy session", async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=PREFIX-foo.cps.gov.uk_POOL%3Dvalue`,
      {
        redirect: "manual",
        headers: {
          "X-Forwarded-Proto": "https",
          Host: "localhost:8080",
        },
      }
    )
    const setCookie = response.headers.get("set-cookie")
    const match = setCookie.match(/cms-session-hint=([^;]+)/)
    const hint = JSON.parse(decodeURIComponent(match[1]))
    assertEqual(
      hint.handoverEndpoint,
      "https://foo.cps.gov.uk/polaris",
      "handoverEndpoint should use first cmsDomain when not proxy session"
    )
  })

  await test("session hint has null handoverEndpoint when no CMS cookies", async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=regular%3Dcookie`,
      {
        redirect: "manual",
        headers: {
          "X-Forwarded-Proto": "https",
          Host: "localhost:8080",
        },
      }
    )
    const setCookie = response.headers.get("set-cookie")
    const match = setCookie.match(/cms-session-hint=([^;]+)/)
    const hint = JSON.parse(decodeURIComponent(match[1]))
    assertEqual(
      hint.handoverEndpoint,
      null,
      "handoverEndpoint should be null when no CMS cookies"
    )
  })

  await test("session hint cookie has empty cmsDomains when no CMS cookies", async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=regular%3Dcookie`,
      {
        redirect: "manual",
        headers: {
          "X-Forwarded-Proto": "https",
          Host: "localhost:8080",
        },
      }
    )
    const setCookie = response.headers.get("set-cookie")
    const match = setCookie.match(/cms-session-hint=([^;]+)/)
    const hint = JSON.parse(decodeURIComponent(match[1]))
    assertEqual(
      hint.cmsDomains.length,
      0,
      "cmsDomains should be empty array when no CMS cookies"
    )
  })
}

// =============================================================================
// Polaris Auth Redirect Tests (/polaris endpoint)
// =============================================================================

async function testPolarisRedirect() {
  console.log("\nPolaris Auth Redirect Tests (/polaris endpoint):")

  const POLARIS_ENDPOINT = `${PROXY_BASE}/polaris`

  await test("redirects to /init with query params and cookies", async () => {
    const response = await fetch(`${POLARIS_ENDPOINT}?q=12345`, {
      redirect: "manual",
      headers: {
        "X-Forwarded-Proto": "https",
        Host: "localhost:8080",
        Cookie: "session=abc123",
        Referer: "http://cms.example.org/page",
      },
    })
    assertEqual(response.status, 302, "Should return 302 redirect")
    const location = response.headers.get("location")
    assert(location !== null, "Should have Location header")
    assert(
      location.includes("/init?"),
      `Should redirect to /init, got: ${location}`
    )
    assert(
      location.includes("q=12345"),
      `Should include original q param, got: ${location}`
    )
    assert(
      location.includes("cookie="),
      `Should include cookie param, got: ${location}`
    )
    assert(
      location.includes("is-proxy-session=true"),
      `Should include is-proxy-session=true, got: ${location}`
    )
  })

  await test("includes referer in redirect URL", async () => {
    const response = await fetch(`${POLARIS_ENDPOINT}`, {
      redirect: "manual",
      headers: {
        "X-Forwarded-Proto": "https",
        Host: "localhost:8080",
        Cookie: "session=abc",
        Referer: "http://cms.example.org/somepage",
      },
    })
    const location = response.headers.get("location")
    assert(
      location.includes("referer="),
      `Should include referer param, got: ${location}`
    )
  })
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log("=".repeat(60))
  console.log("Proxy Integration Tests")
  console.log(`Target: ${PROXY_BASE}`)
  console.log("=".repeat(60))

  // Disable TLS verification for self-signed certs
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

  try {
    await testHealthCheck()
    await testUpstreamProxyAuth()
    // testCookieRoute is commented out - handleCookieRoute is disabled
    await testSessionHint()
    await testPreviewPage()
    await testStateEndpoint()
    await testUpstreamHealthCheck()
    await testAuthRedirect()
    await testPolarisRedirect()
    await testCors()
    await testSwaggerRewriting()
  } catch (err) {
    console.error("\nTest suite error:", err.message)
  }

  console.log("\n" + "=".repeat(60))
  console.log(`Results: ${passed} passed, ${failed} failed`)
  console.log("=".repeat(60))

  process.exit(failed > 0 ? 1 : 0)
}

main()
