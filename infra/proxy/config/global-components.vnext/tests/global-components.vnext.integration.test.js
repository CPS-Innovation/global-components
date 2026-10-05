#!/usr/bin/env node
/**
 * Integration tests for global-components.vnext.conf.template
 *
 * Tests the vnext-only functionality: swagger URL rewriting and the
 * MDS API proxy (monitoring-codes).
 */

const {
  PROXY_BASE,
  assert,
  test,
  fetchJson,
  getState,
  resetState,
} = require("../../../test-utils")

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

  await test("server url keeps the /api segment the proxy routes on", async () => {
    const response = await fetch(
      `${PROXY_BASE}/global-components/swagger.json`
    )
    const json = await response.json()

    // The proxied MDS surface lives at /global-components/api/, so the rewritten
    // server url has to end there — otherwise "Try it out" hits a path no
    // location block matches and 404s.
    const serverUrl = (json.servers[0].url || "").replace(/\/$/, "")
    assert(
      serverUrl.endsWith("/global-components/api"),
      `Server url should end with /global-components/api, got: ${serverUrl}`
    )
  })

  await test("serves a filtered doc on the /api/ path the UI page resolves to", async () => {
    // The UI page's embedded doc URL rewrites to /global-components/api/swagger.json.
    // That path would otherwise hit the unfiltered API regex in
    // global-components.conf, handing swagger-ui the raw upstream server url.
    const response = await fetch(
      `${PROXY_BASE}/global-components/api/swagger.json`
    )
    const text = await response.text()

    assert(
      !text.includes("mock-upstream:3000"),
      `Doc served on the /api/ path should be rewritten, got: ${text.slice(0, 200)}`
    )
    const serverUrl = (JSON.parse(text).servers[0].url || "").replace(/\/$/, "")
    assert(
      serverUrl.endsWith("/global-components/api"),
      `Server url should end with /global-components/api, got: ${serverUrl}`
    )
  })

  await test("leaves operation paths untouched", async () => {
    const response = await fetch(
      `${PROXY_BASE}/global-components/swagger.json`
    )
    const json = await response.json()

    // swagger-ui appends these to the server url, so they must pass through
    // exactly as the upstream emitted them.
    const paths = Object.keys(json.paths || {})
    for (const expected of ["/cases", "/documents"]) {
      assert(
        paths.includes(expected),
        `Expected ${expected} to survive the filter, got: ${paths.join(", ")}`
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

  await testSwaggerRewriting()
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
