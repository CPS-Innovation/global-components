#!/usr/bin/env node
/**
 * Integration tests for global-components.conf.template
 *
 * Tests the base proxy functionality: upstream proxy auth,
 * CORS, and session hint endpoints.
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

const TEST_ENDPOINT = `${PROXY_BASE}/global-components/api/cases/123/summary`

// =============================================================================
// Upstream Proxy Tests
// =============================================================================
// Note: AD token validation (auth_request) is handled by vnext module if needed.
// The base global-components proxy passes requests through to upstream.
// Cms-Auth-Values header/cookie processing is tested in unit tests.

async function testUpstreamProxy() {
  console.log("\nUpstream Proxy Tests:")

  await test("proxies requests to upstream", async () => {
    const response = await fetch(TEST_ENDPOINT)
    assertEqual(response.status, 200, "Should proxy request to upstream")
    const json = await response.json()
    assert(json.mock === true, "Should receive response from mock upstream")
  })

  await test("passes Cms-Auth-Values header to upstream", async () => {
    const response = await fetch(TEST_ENDPOINT, {
      headers: { "Cms-Auth-Values": "userId=123" },
    })
    assertEqual(response.status, 200, "Should proxy request")
    const json = await response.json()
    assertEqual(
      json.headers["cms-auth-values"],
      "userId=123",
      "Should pass Cms-Auth-Values to upstream"
    )
  })

  await test("passes Cms-Auth-Values cookie to upstream", async () => {
    const response = await fetch(TEST_ENDPOINT, {
      headers: { Cookie: "Cms-Auth-Values=userId%3D456" },
    })
    assertEqual(response.status, 200, "Should proxy request")
    const json = await response.json()
    assertEqual(
      json.headers["cms-auth-values"],
      "userId=456",
      "Should decode and pass Cms-Auth-Values cookie to upstream"
    )
  })

  await test("adds x-functions-key header to upstream request", async () => {
    const response = await fetch(TEST_ENDPOINT)
    assertEqual(response.status, 200, "Should proxy request")
    const json = await response.json()
    assert(
      json.headers["x-functions-key"] !== null,
      "Should add x-functions-key header"
    )
  })

  await test("strips Authorization header from upstream request", async () => {
    const response = await fetch(TEST_ENDPOINT, {
      headers: { Authorization: "Bearer some-token" },
    })
    assertEqual(response.status, 200, "Should proxy request")
    const json = await response.json()
    assertEqual(
      json.headers["authorization"] || null,
      null,
      "Should strip Authorization header"
    )
  })
}

// =============================================================================
// CORS Tests
// =============================================================================

async function testCors() {
  console.log("\nCORS Tests:")

  await test("returns CORS headers on regular requests", async () => {
    const response = await fetch(TEST_ENDPOINT, {
      headers: { Origin: "http://localhost:3000" },
    })
    const corsHeader = response.headers.get("access-control-allow-origin")
    assert(
      corsHeader !== null,
      "Should have Access-Control-Allow-Origin header"
    )
  })

  await test("handles OPTIONS preflight request", async () => {
    const response = await fetch(TEST_ENDPOINT, {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "POST",
      },
    })
    assertEqual(response.status, 204, "OPTIONS should return 204")

    const allowMethods = response.headers.get("access-control-allow-methods")
    assert(
      allowMethods !== null,
      "Should have Access-Control-Allow-Methods header"
    )
  })
}

// =============================================================================
// Session Hint Tests
// =============================================================================

async function testSessionHint() {
  console.log("\nSession Hint Tests (/global-components/cms-session-hint):")

  const SESSION_HINT_ENDPOINT = `${PROXY_BASE}/global-components/cms-session-hint`

  await test('returns "null" when no Cms-Session-Hint cookie is present', async () => {
    const response = await fetch(SESSION_HINT_ENDPOINT)
    const text = await response.text()
    assertEqual(response.status, 200, "Should return 200")
    assertEqual(text, "null", 'Should return "null" when no cookie present')
  })

  await test("returns cookie value when Cms-Session-Hint cookie is present", async () => {
    const hintValue = JSON.stringify({
      cmsDomains: ["foo.cps.gov.uk"],
      isProxySession: false,
      handoverEndpoint: null,
    })
    const response = await fetch(SESSION_HINT_ENDPOINT, {
      headers: { Cookie: `Cms-Session-Hint=${encodeURIComponent(hintValue)}` },
    })
    const text = await response.text()
    assertEqual(response.status, 200, "Should return 200")
    assertEqual(text, hintValue, "Should return decoded cookie value")
  })

  await test("decodes URL-encoded cookie value", async () => {
    const hintValue = JSON.stringify({
      cmsDomains: ["test.cps.gov.uk"],
      isProxySession: true,
      handoverEndpoint: "https://test.cps.gov.uk/polaris",
    })
    const encodedValue = encodeURIComponent(hintValue)
    const response = await fetch(SESSION_HINT_ENDPOINT, {
      headers: { Cookie: `Cms-Session-Hint=${encodedValue}` },
    })
    const text = await response.text()
    assertEqual(response.status, 200, "Should return 200")
    // The value should be decoded
    const parsed = JSON.parse(text)
    assert(Array.isArray(parsed.cmsDomains), "Should have cmsDomains array")
    assertEqual(parsed.isProxySession, true, "Should have isProxySession true")
    assertEqual(
      parsed.handoverEndpoint,
      "https://test.cps.gov.uk/polaris",
      "Should have correct handoverEndpoint"
    )
  })

  await test("handles cookie among other cookies", async () => {
    const hintValue = JSON.stringify({
      cmsDomains: [],
      isProxySession: false,
      handoverEndpoint: null,
    })
    const response = await fetch(SESSION_HINT_ENDPOINT, {
      headers: {
        Cookie: `other=value; Cms-Session-Hint=${encodeURIComponent(
          hintValue
        )}; another=cookie`,
      },
    })
    const text = await response.text()
    assertEqual(response.status, 200, "Should return 200")
    assertEqual(
      text,
      hintValue,
      "Should extract correct cookie from multiple cookies"
    )
  })

  await test("handles OPTIONS preflight request", async () => {
    const response = await fetch(SESSION_HINT_ENDPOINT, {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "GET",
      },
    })
    assertEqual(response.status, 204, "OPTIONS should return 204")
    const allowMethods = response.headers.get("access-control-allow-methods")
    assert(
      allowMethods !== null,
      "Should have Access-Control-Allow-Methods header"
    )
  })

  await test("returns CORS headers on regular requests", async () => {
    const response = await fetch(SESSION_HINT_ENDPOINT, {
      headers: { Origin: "http://localhost:3000" },
    })
    const corsHeader = response.headers.get("access-control-allow-origin")
    assert(
      corsHeader !== null,
      "Should have Access-Control-Allow-Origin header"
    )
    const credentialsHeader = response.headers.get(
      "access-control-allow-credentials"
    )
    assertEqual(
      credentialsHeader,
      "true",
      "Should have Access-Control-Allow-Credentials: true"
    )
  })
}

// =============================================================================
// Case Review Redirect Tests
// =============================================================================

async function testCaseReviewRedirect() {
  console.log("\nCase Review Redirect Tests (/case-review-redirect/):")

  await test("redirects to /auth-refresh-outbound with encoded auth-handover URL", async () => {
    const response = await fetch(
      `${PROXY_BASE}/case-review-redirect/cps-tst/test?CMSCaseId=42&URN=12AB3456789`,
      { redirect: "manual" }
    )
    assertEqual(response.status, 302, "Should return 302")

    const location = response.headers.get("location")
    assert(location !== null, "Should have Location header")
    assert(
      location.includes("/auth-refresh-outbound?r="),
      `Should redirect to /auth-refresh-outbound, got: ${location}`
    )

    // Decode the redirect chain and verify structure
    const outerR = location.split("?r=")[1]
    const authHandoverUrl = decodeURIComponent(outerR)
    assert(
      authHandoverUrl.includes("cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html"),
      `Should point to OS auth-handover page, got: ${authHandoverUrl}`
    )

    const ahUrl = new URL(authHandoverUrl)
    assertEqual(ahUrl.searchParams.get("stage"), "os-cookie-return", "Should have stage=os-cookie-return")

    const src = ahUrl.searchParams.get("src")
    assert(src.includes("/global-components/test/auth-handover.js"), `src should reference auth-handover.js, got: ${src}`)

    const finalDest = ahUrl.searchParams.get("r")
    assert(
      finalDest.includes("CaseReview/LandingPage?CMSCaseId=42&URN=12AB3456789"),
      `Final destination should be CaseReview LandingPage, got: ${finalDest}`
    )
  })

  await test("returns 400 when CMSCaseId is missing", async () => {
    const response = await fetch(
      `${PROXY_BASE}/case-review-redirect/cps-tst/test?URN=12AB3456789`,
      { redirect: "manual" }
    )
    assertEqual(response.status, 400, "Should return 400")
    const text = await response.text()
    assert(text.includes("CMSCaseId"), `Should mention CMSCaseId in error, got: ${text}`)
  })

  await test("handles missing URN gracefully", async () => {
    const response = await fetch(
      `${PROXY_BASE}/case-review-redirect/cps-tst/test?CMSCaseId=42`,
      { redirect: "manual" }
    )
    assertEqual(response.status, 302, "Should return 302 even without URN")

    const location = response.headers.get("location")
    const outerR = location.split("?r=")[1]
    const authHandoverUrl = decodeURIComponent(outerR)
    const ahUrl = new URL(authHandoverUrl)
    const finalDest = ahUrl.searchParams.get("r")
    assert(
      finalDest.includes("CMSCaseId=42"),
      `Final destination should include CMSCaseId, got: ${finalDest}`
    )
    assert(
      finalDest.includes("URN="),
      `Final destination should include URN param (empty), got: ${finalDest}`
    )
  })

  await test("returns 400 when path segments are missing", async () => {
    const response = await fetch(
      `${PROXY_BASE}/case-review-redirect/?CMSCaseId=42`,
      { redirect: "manual" }
    )
    assertEqual(response.status, 400, "Should return 400")
    const text = await response.text()
    assert(text.includes("expected path"), `Should mention expected path format, got: ${text}`)
  })
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  // Disable TLS verification for self-signed certs
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

  await testUpstreamProxy()
  await testSessionHint()
  await testCors()
  await testCaseReviewRedirect()
}

module.exports = main

// Run if called directly
if (require.main === module) {
  resetState()
  console.log("=".repeat(60))
  console.log("Global Components Integration Tests")
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
