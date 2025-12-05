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
