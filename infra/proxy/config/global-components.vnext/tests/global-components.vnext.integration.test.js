#!/usr/bin/env node
/**
 * Integration tests for global-components.vnext.conf.template
 *
 * Tests the vnext-only functionality: status endpoint, swagger URL rewriting,
 * and MDS API proxy (monitoring-codes).
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
