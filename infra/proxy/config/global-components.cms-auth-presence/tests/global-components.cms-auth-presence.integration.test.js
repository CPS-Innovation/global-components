#!/usr/bin/env node
/**
 * Integration tests for global-components.cms-auth-presence.conf
 *
 * Light smoke tests: verifies nginx starts with the conf mounted and
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
// /init-presence/error — Sync handler (no external calls)
// =============================================================================

async function testErrorEndpoint() {
  console.log("\nError Endpoint Tests (/init-presence/error):")

  await test("returns HTML page with error details", async () => {
    const response = await fetch(
      `${PROXY_BASE}/init-presence/error?correlation=test-abc123&error-code=modern-token-fetch-failed`
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
    const response = await fetch(`${PROXY_BASE}/init-presence/error`)
    assertEqual(response.status, 500, "Should return 500")
    const body = await response.text()
    assert(body.includes("(unknown)"), "Should show (unknown) for missing correlation")
    assert(body.includes("unknown"), "Should show unknown for missing error code")
  })
}

// =============================================================================
// /polaris-presence — Sync redirect handler
// =============================================================================

async function testPolarisV2Endpoint() {
  console.log("\nPolaris Presence Endpoint Tests (/polaris-presence):")

  await test("redirects to /init-presence/ with cookies param", async () => {
    const response = await fetch(`${PROXY_BASE}/polaris-presence`, {
      redirect: "manual",
      headers: {
        Cookie: "test=value; other=123",
      },
    })
    assertEqual(response.status, 302, "Should return 302 redirect")
    const location = response.headers.get("location")
    assert(location !== null, "Should have Location header")
    assert(location.includes("/init-presence/"), "Should redirect to /init-presence/")
    assert(location.includes("cookies="), "Should include cookies param")
    assert(
      location.includes("is-proxy-session=true"),
      "Should include is-proxy-session param"
    )
  })

  await test("preserves existing query params", async () => {
    const response = await fetch(
      `${PROXY_BASE}/polaris-presence?polaris-ui-url=/some/path`,
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
// /global-components/presence-jsonp?op=whoami — the one op the proxy answers itself
// =============================================================================

// WHY THIS IS TESTED HERE and not as a unit test: _cmsEnvRead is private, and
// whoami is the only op answered without an upstream, so the real decoder is
// reachable over HTTP with nothing mocked. Exporting the function to test it
// would widen the module's surface for no other reason.
//
// WHAT IS BEING PINNED: that an empty cmsEnv is never ambiguous. Four distinct
// states used to arrive as "" with nothing to tell them apart, and they need
// different people to fix them — nobody wrote the hint, the hint is corrupt, the
// writer said it could not work it out, or it carried no CMS domain.
async function testWhoamiCmsEnv() {
  console.log("\nWhoami cmsEnv Tests (/global-components/presence-jsonp):")

  const whoami = async (cookie) => {
    const response = await fetch(
      `${PROXY_BASE}/global-components/presence-jsonp?op=whoami&callback=cb`,
      cookie ? { headers: { Cookie: cookie } } : undefined
    )
    assertEqual(response.status, 200, "Should return 200")
    const body = await response.text()
    // JSONP: cb({...}). Unwrap rather than eval.
    const json = body.replace(/^cb\(/, "").replace(/\)\s*$/, "")
    return JSON.parse(json)
  }

  const hint = (payload) =>
    `Cms-Session-Hint=${encodeURIComponent(JSON.stringify(payload))}`

  await test("rejects a callback name that is not a bare identifier", async () => {
    const response = await fetch(
      `${PROXY_BASE}/global-components/presence-jsonp?op=whoami&callback=alert(1)`
    )
    assertEqual(response.status, 400, "Should refuse to reflect it")
  })

  await test("no hint cookie at all -> why=no-hint", async () => {
    const data = await whoami(null)
    assertEqual(data.cmsEnv, "", "Should not guess an environment")
    assertEqual(data.cmsEnvWhy, "no-hint", "Should say nobody wrote it")
  })

  await test("a hint naming the CMS domain -> the first label, uppercased", async () => {
    const data = await whoami(hint({ cmsDomains: ["cin3.cps.gov.uk"] }))
    assertEqual(data.cmsEnv, "CIN3", "Should read the first label")
    assertEqual(data.cmsEnvWhy, "hint", "Should say where it came from")
  })

  await test("an unreadable hint -> why=bad-hint, NOT no-hint", async () => {
    const data = await whoami("Cms-Session-Hint=%7Bnot-json")
    assertEqual(data.cmsEnv, "", "Should not guess an environment")
    assertEqual(data.cmsEnvWhy, "bad-hint", "Present but corrupt is its own case")
  })

  await test("a hint the writer could not fill -> why=hint-error", async () => {
    const data = await whoami(hint({ error: "something upstream" }))
    assertEqual(data.cmsEnv, "", "Should not guess an environment")
    assertEqual(data.cmsEnvWhy, "hint-error", "The writer's own failure is its own case")
  })

  await test("a hint with no CMS domain in it -> why=no-domain", async () => {
    const data = await whoami(hint({ cmsDomains: [], isProxySession: true }))
    assertEqual(data.cmsEnv, "", "Should not guess an environment")
    assertEqual(data.cmsEnvWhy, "no-domain", "Written, but nothing to derive from")
  })

  // The suffix-less case (production, if that is what we choose) is a CLIENT-SIDE
  // mapping from a KNOWN label, never an empty cmsEnv. Pinned so nobody later
  // "helpfully" returns "" for a label they think means no suffix: the token is
  // opaque here, and an empty value means unknown.
  await test("an unfamiliar label is still reported, not blanked", async () => {
    const data = await whoami(hint({ cmsDomains: ["cms.cps.gov.uk"] }))
    assertEqual(data.cmsEnv, "CMS", "Should report what it found")
    assertEqual(data.cmsEnvWhy, "hint", "Should not treat an unfamiliar label as unknown")
  })
}

// =============================================================================
// /CMS.24.0.01/User/uaulLogin.aspx — login-page shim: RETIRED
// -----------------------------------------------------------------------------
// The login-page iframe injection (and its whole `location = .../uaulLogin.aspx`
// block) was removed from the cms-auth-presence conf. That job moved into the injected
// shell script (the injected Classic client), which watches frameMain leave the login
// page and spawns the /polaris-presence iframe itself. That script is a blob asset this
// docker suite does not serve, so there is nothing to assert here. With the block
// gone, the login page falls through to the deployed ^/CMS.* catch-all (not part
// of this mock), so no login-page test runs in this layer.
// (Previously: testLoginShim() asserted the injected iframe + the 402 IE gate.)
// =============================================================================

// =============================================================================
// Main
// =============================================================================

async function main() {
  await testErrorEndpoint()
  await testPolarisV2Endpoint()
  await testWhoamiCmsEnv()
}

module.exports = main

// Run if called directly
if (require.main === module) {
  resetState()
  console.log("=".repeat(60))
  console.log("CMS Auth Presence Integration Tests")
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
