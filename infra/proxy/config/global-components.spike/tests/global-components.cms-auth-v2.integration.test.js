#!/usr/bin/env node
/**
 * Integration tests for global-components.cms-auth-v2.conf
 *
 * Light smoke tests: verifies nginx starts with the v2 conf mounted and
 * the sync handlers respond correctly. Does NOT exercise the full OIDC
 * round-trip (that requires real Azure AD credentials).
 */

const {
  PROXY_BASE,
  assert,
  assertEqual,
  test,
  getState,
  resetState,
} = require("../../../test-utils")

// =============================================================================
// /init-v2/error — Sync handler (no external calls)
// =============================================================================

async function testErrorEndpoint() {
  console.log("\nError Endpoint Tests (/init-v2/error):")

  await test("returns HTML page with error details", async () => {
    const response = await fetch(
      `${PROXY_BASE}/init-v2/error?correlation=test-abc123&error-code=modern-token-fetch-failed`
    )
    assertEqual(response.status, 500, "Should return 500")
    const contentType = response.headers.get("content-type")
    assert(
      contentType.includes("text/html"),
      "Should return HTML content type"
    )
    const body = await response.text()
    assert(body.includes("test-abc123"), "Should contain correlation ID")
    assert(
      body.includes("modern-token-fetch-failed"),
      "Should contain error code"
    )
  })

  await test("handles missing query params gracefully", async () => {
    const response = await fetch(`${PROXY_BASE}/init-v2/error`)
    assertEqual(response.status, 500, "Should return 500")
    const body = await response.text()
    assert(body.includes("(unknown)"), "Should show (unknown) for missing correlation")
    assert(body.includes("unknown"), "Should show unknown for missing error code")
  })
}

// =============================================================================
// /polaris-v2 — Sync redirect handler
// =============================================================================

async function testPolarisV2Endpoint() {
  console.log("\nPolaris V2 Endpoint Tests (/polaris-v2):")

  await test("redirects to /init-v2/ with cookies param", async () => {
    const response = await fetch(`${PROXY_BASE}/polaris-v2`, {
      redirect: "manual",
      headers: {
        Cookie: "test=value; other=123",
      },
    })
    assertEqual(response.status, 302, "Should return 302 redirect")
    const location = response.headers.get("location")
    assert(location !== null, "Should have Location header")
    assert(location.includes("/init-v2/"), "Should redirect to /init-v2/")
    assert(location.includes("cookies="), "Should include cookies param")
    assert(
      location.includes("is-proxy-session=true"),
      "Should include is-proxy-session param"
    )
  })

  await test("preserves existing query params", async () => {
    const response = await fetch(
      `${PROXY_BASE}/polaris-v2?polaris-ui-url=/some/path`,
      {
        redirect: "manual",
      }
    )
    assertEqual(response.status, 302, "Should return 302 redirect")
    const location = response.headers.get("location")
    assert(
      location.includes("polaris-ui-url"),
      "Should preserve existing query params"
    )
  })
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  await testErrorEndpoint()
  await testPolarisV2Endpoint()
}

module.exports = main

// Run if called directly
if (require.main === module) {
  resetState()
  console.log("=".repeat(60))
  console.log("CMS Auth V2 Integration Tests")
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
