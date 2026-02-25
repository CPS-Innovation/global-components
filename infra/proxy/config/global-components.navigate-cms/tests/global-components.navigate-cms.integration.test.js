#!/usr/bin/env node
/**
 * Integration tests for navigate-cms nginx handler
 *
 * Tests the /global-components/navigate-cms endpoint with various
 * IE mode and session hint combinations.
 */

const {
  PROXY_BASE,
  assert,
  assertEqual,
  test,
  getState,
  resetState,
} = require("../../../test-utils")

const SESSION_HINT = JSON.stringify({
  cmsDomains: ["foo.cps.gov.uk"],
  isProxySession: false,
  handoverEndpoint: "https://foo.cps.gov.uk/polaris",
})

const SESSION_HINT_COOKIE = `Cms-Session-Hint=${encodeURIComponent(SESSION_HINT)}`

const TRIDENT_UA =
  "Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko"
const EDGE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"

const NAVIGATE_CMS = `${PROXY_BASE}/global-components/navigate-cms`

// =============================================================================
// Open Phase Tests
// =============================================================================

async function testOpenPhase() {
  console.log("\nOpen Phase Tests:")

  await test("non-IE + configurable: redirects to self with IE mode header", async () => {
    const response = await fetch(`${NAVIGATE_CMS}?caseId=123`, {
      redirect: "manual",
      headers: {
        "X-Forwarded-Proto": "https",
        "Host": "localhost:8080",
        "User-Agent": EDGE_UA,
        "X-InternetExplorerModeConfigurable": "1",
        "Cookie": SESSION_HINT_COOKIE,
      },
    })
    assertEqual(response.status, 302, "Should return 302 redirect")
    const ieHeader = response.headers.get("x-internetexplorermode")
    assertEqual(ieHeader, "1", "Should set X-InternetExplorerMode to 1")
    const location = response.headers.get("location")
    assert(
      location !== null && location.includes("/global-components/navigate-cms"),
      `Should redirect to self, got: ${location}`
    )
    assert(
      location.includes("caseId=123"),
      `Should preserve caseId in redirect, got: ${location}`
    )
  })

  await test("IE + configurable (case): serves iframe with case navigate URL", async () => {
    const response = await fetch(`${NAVIGATE_CMS}?caseId=123`, {
      redirect: "manual",
      headers: {
        "X-Forwarded-Proto": "https",
        "Host": "localhost:8080",
        "User-Agent": TRIDENT_UA,
        "X-InternetExplorerModeConfigurable": "1",
        "Cookie": SESSION_HINT_COOKIE,
      },
    })
    assertEqual(response.status, 200, "Should return 200")
    const body = await response.text()
    assert(body.includes("iframe"), `Should contain iframe, got: ${body}`)
    assert(
      body.includes(
        "action=navigate&screen=case_details&wId=MASTER&caseId=123"
      ),
      `Should contain navigate action with caseId, got: ${body}`
    )
    assert(
      body.includes("foo.cps.gov.uk"),
      `Should use domain from session hint, got: ${body}`
    )
  })

  await test("IE + configurable (task): serves iframe with task activate URL", async () => {
    const response = await fetch(`${NAVIGATE_CMS}?caseId=123&taskId=456`, {
      redirect: "manual",
      headers: {
        "X-Forwarded-Proto": "https",
        "Host": "localhost:8080",
        "User-Agent": TRIDENT_UA,
        "X-InternetExplorerModeConfigurable": "1",
        "Cookie": SESSION_HINT_COOKIE,
      },
    })
    assertEqual(response.status, 200, "Should return 200")
    const body = await response.text()
    assert(
      body.includes(
        "action=activate_task&screen=case_details&wId=MASTER&taskId=456&caseId=123"
      ),
      `Should contain activate_task action with taskId and caseId, got: ${body}`
    )
  })

  await test("no session hint cookie: returns 400 error", async () => {
    const response = await fetch(`${NAVIGATE_CMS}?caseId=123`, {
      redirect: "manual",
      headers: {
        "X-Forwarded-Proto": "https",
        "Host": "localhost:8080",
        "User-Agent": TRIDENT_UA,
        "X-InternetExplorerModeConfigurable": "1",
      },
    })
    assertEqual(response.status, 400, "Should return 400")
    const body = await response.text()
    assert(
      body.includes("could not determine CMS domain"),
      `Should contain error message, got: ${body}`
    )
  })

  await test("non-configurable: serves iframe page directly (no redirect)", async () => {
    const response = await fetch(`${NAVIGATE_CMS}?caseId=123`, {
      redirect: "manual",
      headers: {
        "X-Forwarded-Proto": "https",
        "Host": "localhost:8080",
        "User-Agent": EDGE_UA,
        "Cookie": SESSION_HINT_COOKIE,
      },
    })
    assertEqual(response.status, 200, "Should return 200")
    const body = await response.text()
    assert(body.includes("iframe"), `Should contain iframe, got: ${body}`)
    assert(
      body.includes(
        "action=navigate&screen=case_details&wId=MASTER&caseId=123"
      ),
      `Should contain navigate action, got: ${body}`
    )
  })
}

// =============================================================================
// Close Phase Tests
// =============================================================================

async function testClosePhase() {
  console.log("\nClose Phase Tests:")

  await test("IE + configurable: redirects to self with IE mode off", async () => {
    const response = await fetch(`${NAVIGATE_CMS}?step=close`, {
      redirect: "manual",
      headers: {
        "X-Forwarded-Proto": "https",
        "Host": "localhost:8080",
        "User-Agent": TRIDENT_UA,
        "X-InternetExplorerModeConfigurable": "1",
      },
    })
    assertEqual(response.status, 302, "Should return 302 redirect")
    const ieHeader = response.headers.get("x-internetexplorermode")
    assertEqual(ieHeader, "0", "Should set X-InternetExplorerMode to 0")
    const location = response.headers.get("location")
    assert(
      location !== null && location.includes("step=close"),
      `Should redirect with step=close, got: ${location}`
    )
  })

  await test("non-IE (Edge): serves window.close script", async () => {
    const response = await fetch(`${NAVIGATE_CMS}?step=close`, {
      redirect: "manual",
      headers: {
        "X-Forwarded-Proto": "https",
        "Host": "localhost:8080",
        "User-Agent": EDGE_UA,
        "X-InternetExplorerModeConfigurable": "1",
      },
    })
    assertEqual(response.status, 200, "Should return 200")
    const body = await response.text()
    assert(
      body.includes("window.close()"),
      `Should contain window.close(), got: ${body}`
    )
  })
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

  await testOpenPhase()
  await testClosePhase()
}

module.exports = main

if (require.main === module) {
  resetState()
  console.log("=".repeat(60))
  console.log("Navigate-CMS Integration Tests")
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
