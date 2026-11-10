#!/usr/bin/env node
/**
 * Integration tests for global-components.cms-augmentation.conf
 *
 * Light smoke tests: nginx starts with the conf mounted, the client <script> lands
 * in every page the conf injects into, and the temporary state route answers.
 */

const {
  PROXY_BASE,
  assert,
  assertEqual,
  test,
  getState,
  resetState,
} = require("../../../test-utils")

const IE_MODE = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Trident/7.0; rv:11.0) like Gecko" }

// =============================================================================
// Client-script injection
// =============================================================================

// @@SCRIPT_BASE@@ is deploy.local.sh's to fill in; the docker layer mounts the conf
// from source, so the injected src still carries the token. That is what is
// asserted: the tag is there, in <head>, naming the right client.
async function testInjection() {
  console.log("\nInjection Tests:")

  const injected = async (path, headers) => {
    const response = await fetch(`${PROXY_BASE}${path}`, { headers, redirect: "manual" })
    assertEqual(response.status, 200, `${path} should return 200`)
    return response.text()
  }

  for (const path of ["/CMS.24.0.01/uaglCMS.aspx", "/CMS.24.0.01/"]) {
    await test(`Classic shell ${path} gets the Classic client in <head>`, async () => {
      const body = await injected(path, IE_MODE)
      assert(
        body.includes('src="@@SCRIPT_BASE@@/cms-augmentation/client-classic-unstable.js"></script></head>'),
        `Should inject the Classic client, got: ${body}`
      )
    })
  }

  await test("Classic shell refuses a non-IE browser that cannot be flipped", async () => {
    const response = await fetch(`${PROXY_BASE}/CMS.24.0.01/uaglCMS.aspx`, { redirect: "manual" })
    assertEqual(response.status, 402, "requires Internet Explorer mode")
  })

  for (const path of ["/viewer/landing", "/dcf/review/123/abc"]) {
    await test(`Modern/DCF ${path} gets the Modern client in <head>`, async () => {
      const body = await injected(path)
      assert(
        body.includes('src="@@SCRIPT_BASE@@/cms-augmentation/client-modern-unstable.js"></script></head>'),
        `Should inject the Modern client, got: ${body}`
      )
    })
  }
}

// =============================================================================
// Temporary tail — state/preview (moving to Polaris's module)
// =============================================================================

async function testStatePreview() {
  console.log("\nState Preview Tests (/global-components/state/preview):")

  await test("the JSONP read answers cb(null) with no cookie", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/state/preview?callback=cb`)
    assertEqual(response.status, 200, "Should return 200")
    assertEqual(await response.text(), "cb(null)", "No preview, still a callback")
  })
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  await testInjection()
  await testStatePreview()
}

module.exports = main

// Run if called directly
if (require.main === module) {
  resetState()
  console.log("=".repeat(60))
  console.log("CMS Augmentation Integration Tests")
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
