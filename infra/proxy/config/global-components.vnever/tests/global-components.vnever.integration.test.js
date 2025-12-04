#!/usr/bin/env node
/**
 * Integration tests for global-components.vnever.conf.template
 *
 * Tests the vnever functionality: upstream handover health check endpoint.
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

  await testUpstreamHealthCheck()
}

module.exports = main

// Run if called directly
if (require.main === module) {
  resetState()
  console.log("=".repeat(60))
  console.log("VNever Integration Tests")
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
