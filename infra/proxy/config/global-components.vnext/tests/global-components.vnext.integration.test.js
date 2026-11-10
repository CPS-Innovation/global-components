#!/usr/bin/env node
/**
 * Integration tests for global-components.vnext.conf.template
 *
 * vnext is the ADVANCE copy of our changes to Polaris's global-components
 * feature: bronze (regex) locations that win today and yield to the PR's `=`/`^~`
 * once it deploys. These prove it on a real nginx, in the features layout:
 * vnext answers the routes it takes over (X-Gloco-Vnext), including one that
 * only a load-order win can take from Polaris's regex, and leaves the rest alone.
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
// Bronze: who answers
// =============================================================================

async function testWhoAnswers() {
  console.log("\nWho answers (X-Gloco-Vnext):")

  await test("/global-components/api/swagger.json is vnext's, despite Polaris's api regex", async () => {
    // Both are regexes, so only include order decides: features/global-components.vnext/
    // loads before features/global-components/. If this fails, the bronze model is wrong.
    const response = await fetch(`${PROXY_BASE}/global-components/api/swagger.json`)
    assertEqual(response.headers.get("x-gloco-vnext"), "swagger", "answered by vnext")
  })

  await test("the state route is vnext's", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/state/settings`)
    assertEqual(response.headers.get("x-gloco-vnext"), "state", "answered by vnext")
    assertEqual(await response.text(), "null", "Polaris's GET contract: no cookie reads null")
  })

  await test("navigate-cms is vnext's (a regex beats Polaris's prefix)", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/navigate-cms?step=close`)
    assertEqual(response.headers.get("x-gloco-vnext"), "navigate-cms", "answered by vnext")
  })

  await test("the rest of the api surface stays Polaris's", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/api/cases`)
    assertEqual(response.headers.get("x-gloco-vnext"), null, "not vnext")
  })
}

// =============================================================================
// State: the additions
// =============================================================================

async function testState() {
  console.log("\nState additions:")

  await test("the JSONP read answers cb(null) with no cookie", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/state/preview?callback=cb`)
    assertEqual(response.status, 200, "Should return 200")
    assertEqual(await response.text(), "cb(null)", "No preview, still a callback")
  })

  await test("the JSONP read serves the stored value", async () => {
    const value = JSON.stringify({ caseLocking: true })
    const cookie = "cps-global-components-state=" + Buffer.from(value).toString("base64url")
    const response = await fetch(`${PROXY_BASE}/global-components/state/preview?callback=cb`, {
      headers: { Cookie: cookie },
    })
    assertEqual(await response.text(), `cb(${value})`, "callback around the value")
  })

  await test("?set= writes the cookie and returns to the given path", async () => {
    const value = encodeURIComponent(JSON.stringify({ caseLocking: true }))
    const response = await fetch(
      `${PROXY_BASE}/global-components/state/preview?set=${value}&return=%2Fdone&done=edge`,
      { redirect: "manual" }
    )
    assertEqual(response.status, 302, "redirects")
    assert(/(^|[^/])\/done$/.test(response.headers.get("location") || ""), `back to the return path, got ${response.headers.get("location")}`)
    assert(
      (response.headers.get("set-cookie") || "").startsWith("cps-global-components-state="),
      "writes the state cookie"
    )
  })
}

// =============================================================================
// navigate-cms: target=modern (RNAV-43)
// =============================================================================

async function testNavigateModern() {
  console.log("\nnavigate-cms target=modern:")

  await test("serves the CMS Modern page for the session's CMS domain", async () => {
    const hint = encodeURIComponent(JSON.stringify({ handoverEndpoint: "https://foo.cps.gov.uk/polaris" }))
    const response = await fetch(`${PROXY_BASE}/global-components/navigate-cms?caseId=123&target=modern`, {
      headers: { Cookie: `Cms-Session-Hint=${hint}` },
    })
    const body = await response.text()
    assertEqual(response.status, 200, "Should return 200")
    assert(body.includes("/viewer/landing#/case-summary/123"), `Should target Modern, got: ${body.slice(0, 300)}`)
  })
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  // Disable TLS verification for self-signed certs
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

  await testSwaggerRewriting()
  await testWhoAnswers()
  await testState()
  await testNavigateModern()
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
