#!/usr/bin/env node
/**
 * Integration tests for global-components.vnext.conf.template
 *
 * Tests the vnext functionality: blob storage proxy, state endpoint,
 * status endpoint, and swagger URL rewriting.
 */

const {
  PROXY_BASE,
  assert,
  assertEqual,
  test,
  fetchJson,
  getState,
  resetState,
} = require("../../../test-utils")

// =============================================================================
// Blob Storage Proxy Tests
// =============================================================================

async function testBlobStorageProxy() {
  console.log("\nBlob Storage Proxy Tests (/global-components/{dev|test|prod}/*):")

  await test("proxies dev environment files", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/dev/test-file.js`)
    assertEqual(response.status, 200, "Should return 200 for dev files")
  })

  await test("proxies test environment files", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/test/test-file.js`)
    assertEqual(response.status, 200, "Should return 200 for test files")
  })

  await test("proxies prod environment files", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/prod/test-file.js`)
    assertEqual(response.status, 200, "Should return 200 for prod files")
  })

  await test("returns CORS headers", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/dev/test-file.js`, {
      headers: { Origin: "http://localhost:3000" },
    })
    const corsHeader = response.headers.get("access-control-allow-origin")
    assert(corsHeader !== null, "Should have Access-Control-Allow-Origin header")
  })

  await test("handles OPTIONS preflight request", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/dev/test-file.js`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "GET",
      },
    })
    assertEqual(response.status, 204, "OPTIONS should return 204")
    const allowMethods = response.headers.get("access-control-allow-methods")
    assert(allowMethods !== null, "Should have Access-Control-Allow-Methods header")
  })

  // Index.html routing tests - folder paths redirect to trailing slash, then resolve to index.html
  await test("folder path without trailing slash redirects to trailing slash", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/dev/preview`, {
      redirect: "manual",
    })
    assertEqual(response.status, 301, "Should return 301 redirect")
    const location = response.headers.get("location")
    assert(location.endsWith("/global-components/dev/preview/"), "Should redirect to trailing slash")
  })

  await test("folder path with trailing slash resolves to index.html", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/dev/preview/`)
    assertEqual(response.status, 200, "Should return 200 for folder path with slash")
    const contentType = response.headers.get("content-type")
    assert(contentType.includes("text/html"), "Should return HTML content")
    const blobFile = response.headers.get("x-mock-blob-file")
    assertEqual(blobFile, "preview/index.html", "Should request index.html from blob")
  })

  await test("nested folder path redirects to trailing slash", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/prod/nested/folder`, {
      redirect: "manual",
    })
    assertEqual(response.status, 301, "Should return 301 redirect")
    const location = response.headers.get("location")
    assert(location.endsWith("/global-components/prod/nested/folder/"), "Should redirect to trailing slash")
  })

  await test("file with extension is NOT modified", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/dev/script.js`)
    assertEqual(response.status, 200, "Should return 200 for .js file")
    const blobFile = response.headers.get("x-mock-blob-file")
    assertEqual(blobFile, "script.js", "Should request exact file path")
  })
}

// =============================================================================
// State Endpoint Tests
// =============================================================================
// Note: VALIDATE_TOKEN_AGAINST_AD is currently false, so PUT operations
// succeed without authentication. When enabled, PUT requires valid Azure AD token.
// State is stored as base64url encoded in cookies.

// Helper to base64url encode (matches server-side wrapState)
function base64UrlEncode(str) {
  return Buffer.from(str).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function testStateEndpoint() {
  console.log("\nState Endpoint Tests (/global-components/state/*):")
  console.log("  (Note: VALIDATE_TOKEN_AGAINST_AD=false, auth not enforced)")

  const PREVIEW_ENDPOINT = `${PROXY_BASE}/global-components/state/preview`
  const OTHER_ENDPOINT = `${PROXY_BASE}/global-components/state/other-key`

  await test("GET on whitelisted key (preview) returns 200", async () => {
    const response = await fetch(PREVIEW_ENDPOINT)
    assertEqual(response.status, 200, "GET should return 200")
    const text = await response.text()
    assertEqual(text, "null", 'Should return "null" when no cookie present')
  })

  await test("GET on whitelisted key returns cookie value", async () => {
    const stateValue = JSON.stringify({ foo: "bar" })
    const wrappedState = base64UrlEncode(stateValue)
    const response = await fetch(PREVIEW_ENDPOINT, {
      headers: {
        Cookie: `cps-global-components-state=${wrappedState}`,
      },
    })
    assertEqual(response.status, 200, "GET should return 200")
    const text = await response.text()
    assertEqual(text, stateValue, "Should return unwrapped cookie value")
  })

  await test("GET on non-whitelisted key returns 200 (validation disabled)", async () => {
    const response = await fetch(OTHER_ENDPOINT)
    assertEqual(
      response.status,
      200,
      "GET should return 200 when validation disabled"
    )
  })

  await test("PUT succeeds without Authorization header (validation disabled)", async () => {
    const response = await fetch(PREVIEW_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test: "data" }),
    })
    assertEqual(
      response.status,
      200,
      "Should return 200 when validation disabled"
    )
    const body = await response.json()
    assertEqual(body.success, true, "Should have success true")
  })

  await test("PUT sets cookie with state value", async () => {
    const stateValue = JSON.stringify({ count: 42 })
    const response = await fetch(PREVIEW_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: stateValue,
    })
    assertEqual(response.status, 200, "Should return 200")
    const setCookie = response.headers.get("set-cookie")
    assert(setCookie !== null, "Should have Set-Cookie header")
    assert(setCookie.includes("cps-global-components-state="), "Should set state cookie")
    assert(setCookie.includes("Secure"), "Should have Secure flag")
    assert(setCookie.includes("SameSite=None"), "Should have SameSite=None")
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

  await test("PUT with null clears cookie and returns cleared flag", async () => {
    const response = await fetch(PREVIEW_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "null",
    })
    assertEqual(response.status, 200, "Should return 200")
    const body = await response.json()
    assertEqual(body.success, true, "Should have success true")
    assertEqual(body.cleared, true, "Should have cleared flag")
    const setCookie = response.headers.get("set-cookie")
    assert(setCookie !== null, "Should have Set-Cookie header")
    assert(setCookie.includes("Expires=Thu, 01 Jan 1970"), "Should set cookie to expire in the past")
  })

  await test("PUT with empty body clears cookie", async () => {
    const response = await fetch(PREVIEW_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "",
    })
    assertEqual(response.status, 200, "Should return 200")
    const body = await response.json()
    assertEqual(body.cleared, true, "Should have cleared flag for empty body")
  })

  await test("roundtrip: set state, verify, clear with null, verify cleared", async () => {
    // Step 1: Set state
    const stateValue = JSON.stringify({ enabled: true, caseMarkers: true })
    const putResponse = await fetch(PREVIEW_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: stateValue,
    })
    assertEqual(putResponse.status, 200, "PUT should return 200")
    const setCookie = putResponse.headers.get("set-cookie")
    assert(setCookie !== null, "Should have Set-Cookie header")

    // Extract cookie for subsequent requests
    const cookieMatch = setCookie.match(/cps-global-components-state=([^;]+)/)
    assert(cookieMatch !== null, "Should be able to extract cookie value")
    const cookieValue = cookieMatch[1]

    // Step 2: Verify state is returned on GET
    const getResponse1 = await fetch(PREVIEW_ENDPOINT, {
      headers: { Cookie: `cps-global-components-state=${cookieValue}` },
    })
    assertEqual(getResponse1.status, 200, "GET should return 200")
    const retrievedState = await getResponse1.text()
    assertEqual(retrievedState, stateValue, "Should return the stored state")

    // Step 3: Clear state with null
    const clearResponse = await fetch(PREVIEW_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "null",
    })
    assertEqual(clearResponse.status, 200, "Clear PUT should return 200")
    const clearBody = await clearResponse.json()
    assertEqual(clearBody.cleared, true, "Should have cleared flag")

    // Step 4: Verify GET without cookie returns null (simulating cleared cookie)
    const getResponse2 = await fetch(PREVIEW_ENDPOINT)
    assertEqual(getResponse2.status, 200, "GET should return 200")
    const clearedState = await getResponse2.text()
    assertEqual(clearedState, "null", "Should return null after clearing")
  })
}

// =============================================================================
// MDS API Proxy Tests
// =============================================================================

async function testMdsApiProxy() {
  console.log("\nMDS API Proxy Tests (/global-components/api/cases/*):")

  await test("proxies case summary endpoint", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/api/cases/12345/summary`)
    assertEqual(response.status, 200, "Should return 200 for case summary")
    const body = await response.json()
    assertEqual(body.caseId, 12345, "Should have correct caseId")
    assertEqual(body.endpoint, "summary", "Should be summary endpoint")
  })

  await test("proxies monitoring-codes endpoint", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/api/cases/67890/monitoring-codes`)
    assertEqual(response.status, 200, "Should return 200 for monitoring-codes")
    const body = await response.json()
    assertEqual(body.caseId, 67890, "Should have correct caseId")
    assertEqual(body.endpoint, "monitoring-codes", "Should be monitoring-codes endpoint")
  })

  await test("forwards x-functions-key header", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/api/cases/123/summary`)
    assertEqual(response.status, 200, "Should return 200")
    const body = await response.json()
    assert(body.headers["x-functions-key"] !== null, "Should have x-functions-key header")
  })

  await test("strips Authorization header", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/api/cases/123/summary`, {
      headers: { Authorization: "Bearer some-token" },
    })
    assertEqual(response.status, 200, "Should return 200")
    const body = await response.json()
    // nginx sets Authorization to "" which is sent as empty or not at all
    // mock server converts empty/missing to null
    assert(
      body.headers.authorization === null || body.headers.authorization === "",
      "Authorization header should be stripped (null or empty)"
    )
  })

  await test("returns CORS headers", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/api/cases/123/summary`, {
      headers: { Origin: "http://localhost:3000" },
    })
    const corsHeader = response.headers.get("access-control-allow-origin")
    assert(corsHeader !== null, "Should have Access-Control-Allow-Origin header")
    assertEqual(corsHeader, "http://localhost:3000", "Should echo back allowed origin")
  })

  await test("handles OPTIONS preflight request", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/api/cases/123/summary`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "GET",
      },
    })
    assertEqual(response.status, 204, "OPTIONS should return 204")
    const allowMethods = response.headers.get("access-control-allow-methods")
    assert(allowMethods !== null, "Should have Access-Control-Allow-Methods header")
  })

  await test("rejects invalid case ID paths", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/api/cases/abc/summary`)
    // Should not match the regex and fall through to 404 or other handler
    assert(response.status !== 200 || !(await response.json()).endpoint, "Should not match non-numeric case ID")
  })

  await test("forwards query string to upstream", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/api/cases/123/monitoring-codes?assignedOnly=true&limit=10`)
    assertEqual(response.status, 200, "Should return 200")
    const body = await response.json()
    // Mock server echoes back the original URL which includes query string
    assert(body.originalUrl?.includes("assignedOnly=true"), "Should forward query string")
  })
}

// =============================================================================
// Status Endpoint Tests
// =============================================================================

async function testStatusEndpoint() {
  console.log("\nStatus Endpoint Tests (/global-components/status):")

  await test("status endpoint returns JSON with status and version", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/status`)
    assertEqual(response.status, 200, "Health endpoint should return 200")
    const contentType = response.headers.get("content-type")
    assert(contentType.includes("application/json"), "Should return JSON")
    const body = await response.json()
    assertEqual(body.status, "online", "Should have status online")
    assert(typeof body.version === "number", "Should have numeric version")
  })
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
// Main
// =============================================================================

async function main() {
  // Disable TLS verification for self-signed certs
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

  await testStatusEndpoint()
  await testSwaggerRewriting()
  await testBlobStorageProxy()
  await testStateEndpoint()
  await testMdsApiProxy()
}

module.exports = main

// Run if called directly
if (require.main === module) {
  resetState()
  console.log("=".repeat(60))
  console.log("VNext Integration Tests")
  console.log(`Target: ${PROXY_BASE}`)
  console.log("=".repeat(60))

  main()
    .then(() => {
      const state = getState()
      console.log("\n" + "=".repeat(60))
      console.log(`Results: ${state.passed} passed, ${state.failed} failed`)
      console.log("=".repeat(60))
      process.exit(state.failed > 0 ? 1 : 0)
    })
    .catch((err) => {
      console.error("\nTest suite error:", err.message)
      process.exit(1)
    })
}
