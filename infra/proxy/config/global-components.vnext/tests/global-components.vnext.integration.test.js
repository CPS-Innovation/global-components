#!/usr/bin/env node
/**
 * Integration tests for global-components.vnext.conf.template
 *
 * Tests the vnext-only functionality: swagger URL rewriting, the MDS API
 * proxy (monitoring-codes), and OS host variants (config.json selection and
 * the os-target switch).
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
// OS Host Variant Tests
// =============================================================================

async function testOsHostVariants() {
  console.log("\nOS Host Variant Tests (config.json selection + os-target switch):")

  const OAPPS = "oapps-qa-notprod.int.cps.gov.uk"
  const CONFIG_URL = `${PROXY_BASE}/global-components/test/config.json`
  const blobFileOf = response => response.headers.get("x-mock-blob-file")

  await test("serves config.json from blob storage when there is no switch", async () => {
    const response = await fetch(CONFIG_URL)
    assertEqual(response.status, 200, "Should return 200")
    assertEqual(blobFileOf(response), "config.json", "Should serve the base config")
    assert((response.headers.get("vary") || "").includes("Cookie"), "Should vary on Cookie")
  })

  await test("serves the variant named by the switch cookie", async () => {
    const response = await fetch(CONFIG_URL, {
      headers: { Cookie: `Gloco-Os-Target-test=${OAPPS}` },
    })
    assertEqual(blobFileOf(response), "config.oapps.json", "Should serve the variant")
  })

  await test("serves the variant matching an OS page's Origin", async () => {
    const response = await fetch(CONFIG_URL, {
      headers: { Origin: `https://${OAPPS}` },
    })
    assertEqual(blobFileOf(response), "config.oapps.json", "Should serve the variant")
    assertEqual(response.headers.get("access-control-allow-origin"), "*", "Should keep CORS")
  })

  await test("leaves every other artifact to the main conf", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/test/global-components.js`, {
      headers: { Cookie: `Gloco-Os-Target-test=${OAPPS}` },
    })
    assertEqual(blobFileOf(response), "global-components.js", "Should be untouched")
  })

  await test("os-target: PUT sets the cookie, GET reads it back, DELETE clears it", async () => {
    const put = await fetch(`${PROXY_BASE}/global-components/os-target/test`, {
      method: "PUT",
      body: JSON.stringify({ host: OAPPS }),
    })
    assertEqual(put.status, 200, "PUT should return 200")
    const cookie = (put.headers.get("set-cookie") || "").split(";")[0]
    assertEqual(cookie, `Gloco-Os-Target-test=${OAPPS}`, "Should set the switch cookie")

    const get = await fetchJson(`${PROXY_BASE}/global-components/os-target/test`, {
      headers: { Cookie: cookie },
    })
    assertEqual(get.current, OAPPS, "GET should report the switch")

    const del = await fetch(`${PROXY_BASE}/global-components/os-target/test`, { method: "DELETE" })
    assert((del.headers.get("set-cookie") || "").includes("1970"), "DELETE should expire the cookie")
  })

  await test("os-target: refuses a host that is not a variant", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/os-target/test`, {
      method: "PUT",
      body: JSON.stringify({ host: "evil.example.com" }),
    })
    assertEqual(response.status, 400, "Should return 400")
  })
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  // Disable TLS verification for self-signed certs
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

  await testSwaggerRewriting()
  await testOsHostVariants()
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
