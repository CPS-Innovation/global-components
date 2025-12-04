#!/usr/bin/env node
/**
 * Integration tests for global-components.vnext.conf.template
 *
 * Tests the vnext functionality: blob storage proxy, state endpoint, and upstream health check.
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
// Main
// =============================================================================

async function main() {
  // Disable TLS verification for self-signed certs
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

  await testBlobStorageProxy()
  await testStateEndpoint()
  await testUpstreamHealthCheck()
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
