#!/usr/bin/env node
/**
 * Integration tests for global-components.watchdog.conf
 *
 * Runs with GLOBAL_COMPONENTS_WATCHDOG_HOST unset (see docker-compose.watchdog.yml):
 * nginx must start, whoami must still answer (it never reaches the API), and
 * everything that does need the API must say which setting is missing.
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
// /global-components/presence-jsonp?op=whoami — the one op the proxy answers itself
// =============================================================================

// WHY THIS IS TESTED HERE and not as a unit test: _cmsEnvRead is private, and
// whoami is the only op answered without an upstream, so the real decoder is
// reachable over HTTP with nothing mocked. Exporting the function to test it
// would widen the module's surface for no other reason.
// (Moved here from cms-auth-presence with the adapter, 2026-11-10.)
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
// Unconfigured — the one setting absent
// =============================================================================

async function testUnconfigured() {
  console.log("\nUnconfigured Tests (GLOBAL_COMPONENTS_WATCHDOG_HOST unset):")

  await test("a JSONP op that needs the API names the missing setting", async () => {
    const response = await fetch(
      `${PROXY_BASE}/global-components/presence-jsonp?op=poll&sid=s1&callback=cb`
    )
    assertEqual(response.status, 200, "JSONP always answers 200")
    const body = await response.text()
    assert(
      body.includes("GLOBAL_COMPONENTS_WATCHDOG_HOST"),
      `Should name the setting, got: ${body}`
    )
  })

  await test("the hub route answers 503 naming the setting", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/case-locking/api/hubs/x`)
    assertEqual(response.status, 503, "Should be 503")
    const body = await response.text()
    assert(body.includes("GLOBAL_COMPONENTS_WATCHDOG_HOST"), `Should name the setting, got: ${body}`)
  })

  // The sr location only takes a DNS-label instance. Anything else is not a
  // SignalR instance and falls to the hub route — which, here, is the 503 — so a
  // crafted path can never steer the proxy at another host.
  await test("a non-instance sr path is not proxied to SignalR", async () => {
    const response = await fetch(
      `${PROXY_BASE}/global-components/case-locking/api/sr/evil.example.com/x`
    )
    assertEqual(response.status, 503, "Falls through to the (unconfigured) hub route")
  })
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  await testWhoamiCmsEnv()
  await testUnconfigured()
}

module.exports = main

// Run if called directly
if (require.main === module) {
  resetState()
  console.log("=".repeat(60))
  console.log("Watchdog Integration Tests")
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
