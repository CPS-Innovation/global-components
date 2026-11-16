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
// /global-components/presence-jsonp/whoami — the sub-path and the claims cookie
// =============================================================================

// Through real nginx + njs (crypto included): the exact location exists, beats
// nothing else, and verifies a cookie packed the way Polaris packs it. The
// secret is docker-compose.watchdog.yml's ENTRA_STATE_HMAC_SECRET.
async function testWhoamiHandoverClaims() {
  console.log("\nWhoami handover-claims Tests (/global-components/presence-jsonp/whoami):")

  const crypto = require("crypto")
  const SECRET = "integration-test-state-hmac-secret"
  const OID = "0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0"
  const GROUP = "12377eca-b463-4a6c-80ea-95f678f09591"
  const b64url = (s) => Buffer.from(s, "utf8").toString("base64url")
  const pack = (st, secret = SECRET) => {
    const payload = b64url(JSON.stringify(st))
    return payload + "." + crypto.createHmac("sha256", secret).update(payload).digest("base64url")
  }
  const presence = `cms-auth-presence-token=${b64url('{"alg":"none"}')}.${b64url(JSON.stringify({ preferred_username: "a@cps.gov.uk", oid: OID }))}.sig`
  const claims = (over = {}) => ({ k: "claims", v: 1, oid: OID, iat: Math.floor(Date.now() / 1000), g: [GROUP], ...over })

  const whoami = async (cookie, path = "/global-components/presence-jsonp/whoami?callback=cb") => {
    const response = await fetch(`${PROXY_BASE}${path}`, cookie ? { headers: { Cookie: cookie } } : undefined)
    assertEqual(response.status, 200, "Should return 200")
    assertEqual(response.headers.get("cache-control"), "no-store", "Cache-Control")
    const body = await response.text()
    return JSON.parse(body.replace(/^cb\(/, "").replace(/\)\s*$/, ""))
  }

  await test("a cookie packed like Polaris's gives its groups", async () => {
    const data = await whoami(`${presence}; cps-handover-claims=${pack(claims())}`)
    assertEqual(JSON.stringify(data.groups), JSON.stringify([GROUP]), "groups")
    assertEqual(data.groupsFrom, "cookie", "source")
    assertEqual(data.userEmail, "a@cps.gov.uk", "identity still answered")
  })

  await test("a cookie under another secret is refused", async () => {
    const data = await whoami(`${presence}; cps-handover-claims=${pack(claims(), "nope")}`)
    assertEqual(JSON.stringify(data.groups), "[]", "none")
    assertEqual(data.groupsFrom, "bad-mac", "source")
  })

  await test("no cookie: no groups", async () => {
    const data = await whoami(presence)
    assertEqual(data.groupsFrom, "no-cookie", "source")
  })

  await test("the sub-path refuses a callback that is not a bare identifier", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/presence-jsonp/whoami?callback=alert(1)`)
    assertEqual(response.status, 400, "Should refuse to reflect it")
  })

  await test("the base path's ?op=whoami still answers", async () => {
    const data = await whoami(presence, "/global-components/presence-jsonp?op=whoami&callback=cb")
    assertEqual(data.userEmail, "a@cps.gov.uk", "identity")
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
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  await testWhoamiCmsEnv()
  await testWhoamiHandoverClaims()
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
