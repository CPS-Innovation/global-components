#!/usr/bin/env node
/**
 * Build and run unit tests for global-components.js
 *
 * Uses esbuild to bundle the njs module with mocked VARIABLES,
 * then runs the unit tests against the bundled code.
 */

const esbuild = require("esbuild")
const path = require("path")
const fs = require("fs")

const CONFIG_DIR = path.join(__dirname, "..", "config")
const TEST_DIR = __dirname
const DIST_DIR = path.join(TEST_DIR, ".dist")

// Ensure dist directory exists
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true })
}

// Mock VARIABLES for testing
const mockVariables = `
export default {
  upstreamUrl: "http://mock-upstream:3000/api/",
  functionsKey: "test-functions-key",
  healthCheckAllowedUrls: ["http://allowed-url.com/health"],
  healthCheckTimeoutMs: 2000,
  corsAllowedOrigins: ["https://example.com", "https://allowed-origin.com"],
  deployVersion: 42,
  tenantId: "test-tenant-id",
  applicationId: "test-app-id",
  previewHtmlBlobUrl: "http://mock-blob/preview/index.html",
};
`

// Write mock variables file
const mockVarsPath = path.join(DIST_DIR, "mock-vars.js")
fs.writeFileSync(mockVarsPath, mockVariables)

// Bundle the module with mocked imports
async function build() {
  await esbuild.build({
    entryPoints: [path.join(CONFIG_DIR, "global-components.js")],
    bundle: true,
    outfile: path.join(DIST_DIR, "global-components.bundle.js"),
    format: "esm",
    platform: "node",
    alias: {
      "templates/global-components-vars.js": mockVarsPath,
    },
    logLevel: "error",
  })
}

// Run tests
async function runTests() {
  // Dynamic import of the bundled module
  const modulePath = path.join(DIST_DIR, "global-components.bundle.js")
  const module = await import(modulePath)
  const gloco = module.default

  // Test framework
  let passed = 0
  let failed = 0

  function assert(condition, message) {
    if (!condition) throw new Error(message)
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
      console.log(`  \x1b[32m✓\x1b[0m ${name}`)
    } catch (err) {
      failed++
      console.log(`  \x1b[31m✗\x1b[0m ${name}`)
      console.log(`    ${err.message}`)
    }
  }

  function createMockRequest(options = {}) {
    return {
      method: options.method || "GET",
      uri: options.uri || "/global-components/test",
      args: options.args || {},
      headersIn: options.headersIn || {},
      headersOut: {},
      variables: options.variables || {},
      returnCode: null,
      returnBody: null,
      sentBuffer: null,
      sentFlags: null,
      return(code, body) {
        this.returnCode = code
        this.returnBody = body
      },
      sendBuffer(buffer, flags) {
        this.sentBuffer = buffer
        this.sentFlags = flags
      },
    }
  }

  // Mock ngx.fetch globally
  let mockFetchResponse = { status: 200, ok: true }
  let mockFetchError = null
  globalThis.ngx = {
    fetch: async (url, options) => {
      if (mockFetchError) throw mockFetchError
      return mockFetchResponse
    },
  }

  console.log("=".repeat(60))
  console.log("global-components.js Unit Tests")
  console.log("=".repeat(60))

  // --- readCmsAuthValues tests ---
  console.log("\nreadCmsAuthValues:")

  await test("returns header value if present", async () => {
    const r = createMockRequest({
      headersIn: { "Cms-Auth-Values": "userId=123" },
    })
    assertEqual(
      gloco.readCmsAuthValues(r),
      "userId=123",
      "Should return header value"
    )
  })

  await test("decodes encoded header value", async () => {
    const r = createMockRequest({
      headersIn: { "Cms-Auth-Values": "userId%3D123" },
    })
    assertEqual(
      gloco.readCmsAuthValues(r),
      "userId=123",
      "Should decode header value"
    )
  })

  await test("falls back to cookie if header missing", async () => {
    const r = createMockRequest({
      headersIn: { Cookie: "Cms-Auth-Values=fromCookie" },
    })
    assertEqual(
      gloco.readCmsAuthValues(r),
      "fromCookie",
      "Should return cookie value"
    )
  })

  await test("header takes precedence over cookie", async () => {
    const r = createMockRequest({
      headersIn: {
        "Cms-Auth-Values": "fromHeader",
        Cookie: "Cms-Auth-Values=fromCookie",
      },
    })
    assertEqual(
      gloco.readCmsAuthValues(r),
      "fromHeader",
      "Should prefer header"
    )
  })

  await test("returns empty string if neither present", async () => {
    const r = createMockRequest({})
    assertEqual(gloco.readCmsAuthValues(r), "", "Should return empty string")
  })

  // --- readCorsOrigin tests ---
  console.log("\nreadCorsOrigin:")

  await test("returns origin if allowed", async () => {
    const r = createMockRequest({
      headersIn: { Origin: "https://example.com" },
    })
    assertEqual(
      gloco.readCorsOrigin(r),
      "https://example.com",
      "Should return origin"
    )
  })

  await test("returns empty string if not allowed", async () => {
    const r = createMockRequest({
      headersIn: { Origin: "https://evil.com" },
    })
    assertEqual(gloco.readCorsOrigin(r), "", "Should return empty string")
  })

  // --- readUpstreamUrl tests ---
  console.log("\nreadUpstreamUrl:")

  await test("returns upstream URL from VARIABLES", async () => {
    const r = createMockRequest({})
    assertEqual(
      gloco.readUpstreamUrl(r),
      "http://mock-upstream:3000/api/",
      "Should return upstream URL"
    )
  })

  // --- readFunctionsKey tests ---
  console.log("\nreadFunctionsKey:")

  await test("returns functions key from VARIABLES", async () => {
    const r = createMockRequest({})
    assertEqual(
      gloco.readFunctionsKey(r),
      "test-functions-key",
      "Should return functions key"
    )
  })

  // --- swaggerBodyFilter tests ---
  console.log("\nswaggerBodyFilter:")

  await test("replaces upstream URL with proxy URL", async () => {
    const r = createMockRequest({
      headersIn: { Host: "proxy.example.com" },
    })
    const data = '{"server": "http://mock-upstream:3000/api/"}'
    gloco.filterSwaggerBody(r, data, {})
    assert(
      r.sentBuffer.includes("https://proxy.example.com/global-components"),
      `Should replace upstream URL, got: ${r.sentBuffer}`
    )
  })

  await test("rewrites API paths", async () => {
    const r = createMockRequest({
      headersIn: { Host: "proxy.example.com" },
    })
    const data = '{"path": "/api/users"}'
    gloco.filterSwaggerBody(r, data, {})
    assert(
      r.sentBuffer.includes('"/global-components/users"'),
      `Should rewrite API path, got: ${r.sentBuffer}`
    )
  })

  // --- handleHealthCheck tests ---
  console.log("\nhandleHealthCheck:")

  await test("returns 400 if url parameter missing", async () => {
    const r = createMockRequest({ args: {} })
    await gloco.handleHealthCheck(r)
    assertEqual(r.returnCode, 400, "Should return 400")
    assert(
      r.returnBody.includes("url parameter required"),
      "Should have error message"
    )
  })

  await test("returns 403 if url not in whitelist", async () => {
    const r = createMockRequest({ args: { url: "http://evil.com" } })
    await gloco.handleHealthCheck(r)
    assertEqual(r.returnCode, 403, "Should return 403")
    assert(
      r.returnBody.includes("url not in whitelist"),
      "Should have error message"
    )
  })

  await test("returns healthy true for 2xx response", async () => {
    mockFetchResponse = { status: 200 }
    mockFetchError = null
    const r = createMockRequest({
      args: { url: "http://allowed-url.com/health" },
    })
    await gloco.handleHealthCheck(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    const body = JSON.parse(r.returnBody)
    assertEqual(body.healthy, true, "Should be healthy")
    assertEqual(body.status, 200, "Should have status 200")
  })

  await test("returns healthy false for 5xx response", async () => {
    mockFetchResponse = { status: 500 }
    mockFetchError = null
    const r = createMockRequest({
      args: { url: "http://allowed-url.com/health" },
    })
    await gloco.handleHealthCheck(r)
    const body = JSON.parse(r.returnBody)
    assertEqual(body.healthy, false, "Should not be healthy")
    assertEqual(body.status, 500, "Should have status 500")
  })

  await test("returns healthy false on fetch error", async () => {
    mockFetchError = new Error("Connection refused")
    const r = createMockRequest({
      args: { url: "http://allowed-url.com/health" },
    })
    await gloco.handleHealthCheck(r)
    const body = JSON.parse(r.returnBody)
    assertEqual(body.healthy, false, "Should not be healthy")
    assertEqual(body.status, 0, "Should have status 0")
    assertEqual(body.error, "Connection refused", "Should have error message")
    mockFetchError = null
  })

  // --- handleStatus tests ---
  console.log("\nhandleStatus:")

  await test("returns JSON with status and version", async () => {
    const r = createMockRequest({})
    gloco.handleStatus(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assertEqual(
      r.headersOut["Content-Type"],
      "application/json",
      "Should be JSON"
    )
    const body = JSON.parse(r.returnBody)
    assertEqual(body.status, "online", "Should have status online")
    assertEqual(body.version, 42, "Should have version from VARIABLES")
  })

  // --- handleSessionHint tests ---
  console.log("\nhandleSessionHint:")

  await test('returns "null" when no cms-session-hint cookie present', async () => {
    const r = createMockRequest({})
    gloco.handleSessionHint(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assertEqual(r.returnBody, "null", 'Should return "null"')
  })

  await test("returns cookie value when cms-session-hint cookie present", async () => {
    const hintValue = '{"cmsDomains":["foo.cps.gov.uk"],"isProxySession":false}'
    const r = createMockRequest({
      headersIn: { Cookie: `cms-session-hint=${hintValue}` },
    })
    gloco.handleSessionHint(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assertEqual(r.returnBody, hintValue, "Should return cookie value")
  })

  await test("decodes URL-encoded cms-session-hint cookie value", async () => {
    const hintValue = '{"cmsDomains":["foo.cps.gov.uk"],"isProxySession":true}'
    const encodedValue = encodeURIComponent(hintValue)
    const r = createMockRequest({
      headersIn: { Cookie: `cms-session-hint=${encodedValue}` },
    })
    gloco.handleSessionHint(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assertEqual(r.returnBody, hintValue, "Should return decoded cookie value")
  })

  await test("extracts cms-session-hint from multiple cookies", async () => {
    const hintValue = '{"cmsDomains":[],"isProxySession":false}'
    const r = createMockRequest({
      headersIn: {
        Cookie: `other=value; cms-session-hint=${encodeURIComponent(
          hintValue
        )}; another=cookie`,
      },
    })
    gloco.handleSessionHint(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assertEqual(r.returnBody, hintValue, "Should extract correct cookie")
  })

  // --- handleState tests ---
  console.log("\nhandleState:")

  await test("GET on whitelisted key (preview) returns null without auth", async () => {
    const r = createMockRequest({
      method: "GET",
      uri: "/global-components/state/preview",
    })
    await gloco.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assertEqual(r.returnBody, "null", "Should return null")
    assertEqual(
      r.headersOut["Content-Type"],
      "application/json",
      "Should set Content-Type"
    )
  })

  await test("GET on whitelisted key returns cookie value without auth", async () => {
    const stateValue = JSON.stringify({ foo: "bar" })
    const r = createMockRequest({
      method: "GET",
      uri: "/global-components/state/preview",
      headersIn: {
        Cookie: `cps-global-components-state=${encodeURIComponent(stateValue)}`,
      },
    })
    await gloco.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assertEqual(r.returnBody, stateValue, "Should return cookie value")
  })

  await test("GET on non-whitelisted key returns 401 without auth", async () => {
    const r = createMockRequest({
      method: "GET",
      uri: "/global-components/state/other-key",
    })
    await gloco.handleState(r)
    assertEqual(r.returnCode, 401, "Should return 401")
  })

  await test("PUT returns 401 without Authorization header", async () => {
    const r = createMockRequest({
      method: "PUT",
      uri: "/global-components/state/my-key",
    })
    r.requestText = JSON.stringify({ count: 42 })
    await gloco.handleState(r)
    assertEqual(r.returnCode, 401, "Should return 401")
    const body = JSON.parse(r.returnBody)
    assertEqual(body.error, "Unauthorized", "Should have error message")
  })

  await test("PUT returns 401 when token validation fails", async () => {
    mockFetchResponse = { status: 401, ok: false }
    const r = createMockRequest({
      method: "PUT",
      uri: "/global-components/state/my-key",
      headersIn: {
        Authorization: "Bearer invalid-token",
      },
    })
    r.requestText = JSON.stringify({ count: 42 })
    await gloco.handleState(r)
    assertEqual(r.returnCode, 401, "Should return 401")
    mockFetchResponse = { status: 200, ok: true } // Reset
  })

  await test("PUT sets cookie with body content when authenticated", async () => {
    mockFetchResponse = { status: 200, ok: true }
    // Create mock JWT with valid claims (tid and appid matching VARIABLES)
    const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" })).replace(
      /=/g,
      ""
    )
    const payload = btoa(
      JSON.stringify({ tid: "test-tenant-id", appid: "test-app-id" })
    ).replace(/=/g, "")
    const mockJwt = `${header}.${payload}.mock-signature`

    const stateValue = JSON.stringify({ count: 42 })
    const r = createMockRequest({
      method: "PUT",
      uri: "/global-components/state/my-key",
      headersIn: {
        Authorization: `Bearer ${mockJwt}`,
      },
    })
    r.requestText = stateValue
    await gloco.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    const body = JSON.parse(r.returnBody)
    assertEqual(body.success, true, "Should have success true")
    assertEqual(
      body.path,
      "/global-components/state/my-key",
      "Should include path"
    )
    const setCookie = r.headersOut["Set-Cookie"]
    assert(
      setCookie.includes("cps-global-components-state="),
      "Should set cookie"
    )
    assert(
      setCookie.includes("Path=/global-components/state/my-key"),
      "Should set path"
    )
    assert(setCookie.includes("Secure"), "Should have Secure flag")
    assert(setCookie.includes("SameSite=None"), "Should have SameSite=None")
  })

  await test("returns 405 for unsupported methods", async () => {
    const r = createMockRequest({
      method: "DELETE",
      uri: "/global-components/state/my-key",
    })
    await gloco.handleState(r)
    assertEqual(r.returnCode, 405, "Should return 405")
    const body = JSON.parse(r.returnBody)
    assertEqual(body.error, "Method not allowed", "Should have error message")
  })

  // Summary
  console.log("\n" + "=".repeat(60))
  console.log(`Results: ${passed} passed, ${failed} failed`)
  console.log("=".repeat(60))

  process.exit(failed > 0 ? 1 : 0)
}

// Main
;(async () => {
  try {
    await build()
    await runTests()
  } catch (err) {
    console.error("Build/test failed:", err.message)
    process.exit(1)
  }
})()
