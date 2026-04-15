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

  await test("proxies arbitrary path under /global-components/api/*", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/api/user-data`, {
      headers: { "Cms-Auth-Values": "userId=42" },
    })
    assertEqual(response.status, 200, "Should proxy arbitrary path to upstream")
    const json = await response.json()
    assertEqual(json.path, "user-data", "Should pass the path through to upstream")
    assert(json.headers["x-functions-key"] !== null, "Should inject x-functions-key")
    assertEqual(json.headers["cms-auth-values"], "userId=42", "Should pass cms-auth-values")
  })

  await test("forwards query string to upstream", async () => {
    const response = await fetch(
      `${PROXY_BASE}/global-components/api/cases/123/monitoring-codes?assignedOnly=true&limit=10`
    )
    assertEqual(response.status, 200, "Should return 200")
    const json = await response.json()
    assert(
      json.originalUrl?.includes("assignedOnly=true"),
      "Should forward query string to upstream"
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
// Navigate-CMS Tests
// =============================================================================

const SESSION_HINT_NAV = JSON.stringify({
  cmsDomains: ["foo.cps.gov.uk"],
  isProxySession: false,
  handoverEndpoint: "https://foo.cps.gov.uk/polaris",
})

const SESSION_HINT_NAV_COOKIE = `Cms-Session-Hint=${encodeURIComponent(SESSION_HINT_NAV)}`

const TRIDENT_UA =
  "Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko"
const EDGE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"

const NAVIGATE_CMS = `${PROXY_BASE}/global-components/navigate-cms`

async function testNavigateCmsOpen() {
  console.log("\nNavigate-CMS Open Phase Tests:")

  await test("non-IE + configurable: extracts domain from cookie and passes as cmsDomain", async () => {
    const response = await fetch(`${NAVIGATE_CMS}?caseId=123`, {
      redirect: "manual",
      headers: {
        "X-Forwarded-Proto": "https",
        "Host": "localhost:8080",
        "User-Agent": EDGE_UA,
        "X-InternetExplorerModeConfigurable": "1",
        "Cookie": SESSION_HINT_NAV_COOKIE,
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
    assert(
      location.includes("cmsDomain="),
      `Should include cmsDomain in redirect, got: ${location}`
    )
    assert(
      location.includes("foo.cps.gov.uk"),
      `cmsDomain should contain extracted domain, got: ${location}`
    )
  })

  await test("non-IE + configurable without cookie: returns 400", async () => {
    const response = await fetch(`${NAVIGATE_CMS}?caseId=123`, {
      redirect: "manual",
      headers: {
        "X-Forwarded-Proto": "https",
        "Host": "localhost:8080",
        "User-Agent": EDGE_UA,
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

  await test("IE + configurable (case): reads cmsDomain from query param", async () => {
    const response = await fetch(
      `${NAVIGATE_CMS}?caseId=123&cmsDomain=foo.cps.gov.uk`,
      {
        redirect: "manual",
        headers: {
          "X-Forwarded-Proto": "https",
          "Host": "localhost:8080",
          "User-Agent": TRIDENT_UA,
          "X-InternetExplorerModeConfigurable": "1",
        },
      }
    )
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
      `Should use domain from cmsDomain arg, got: ${body}`
    )
  })

  await test("IE + configurable (task): reads cmsDomain from query param", async () => {
    const response = await fetch(
      `${NAVIGATE_CMS}?caseId=123&taskId=456&cmsDomain=foo.cps.gov.uk`,
      {
        redirect: "manual",
        headers: {
          "X-Forwarded-Proto": "https",
          "Host": "localhost:8080",
          "User-Agent": TRIDENT_UA,
          "X-InternetExplorerModeConfigurable": "1",
        },
      }
    )
    assertEqual(response.status, 200, "Should return 200")
    const body = await response.text()
    assert(
      body.includes(
        "action=activate_task&screen=case_details&wId=MASTER&taskId=456&caseId=123"
      ),
      `Should contain activate_task action with taskId and caseId, got: ${body}`
    )
  })

  await test("IE + configurable without cmsDomain or cookie: returns 400", async () => {
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
        "Cookie": SESSION_HINT_NAV_COOKIE,
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

async function testNavigateCmsClose() {
  console.log("\nNavigate-CMS Close Phase Tests:")

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
// Blob Storage Proxy Tests
// =============================================================================

async function testBlobStorageProxy() {
  console.log("\nBlob Storage Proxy Tests (/global-components/{dev|test|prod}/*):")

  await test("proxies dev environment files", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/dev/test-file.js`)
    assertEqual(response.status, 200, "Should return 200 for dev files")
  })

  await test("proxies test environment files", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/test/test-file.js`)
    assertEqual(response.status, 200, "Should return 200 for test files")
  })

  await test("proxies prod environment files", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/prod/test-file.js`)
    assertEqual(response.status, 200, "Should return 200 for prod files")
  })

  await test("returns CORS headers", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/dev/test-file.js`, {
      headers: { Origin: "http://localhost:3000" },
    })
    const corsHeader = response.headers.get("access-control-allow-origin")
    assert(corsHeader !== null, "Should have Access-Control-Allow-Origin header")
  })

  await test("handles OPTIONS preflight request", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/dev/test-file.js`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "GET",
      },
    })
    assertEqual(response.status, 204, "OPTIONS should return 204")
    const allowMethods = response.headers.get("access-control-allow-methods")
    assert(allowMethods !== null, "Should have Access-Control-Allow-Methods header")
  })

  await test("folder path without trailing slash is proxied directly", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/dev/preview`, {
      redirect: "manual",
    })
    assertEqual(response.status, 200, "Should return 200 (proxied by main config)")
  })

  await test("folder path with trailing slash is proxied directly", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/dev/preview/`)
    assertEqual(response.status, 200, "Should return 200 for folder path with slash")
  })

  await test("nested folder path is proxied directly", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/prod/nested/folder`, {
      redirect: "manual",
    })
    assertEqual(response.status, 200, "Should return 200 (proxied by main config)")
  })

  await test("file with extension is NOT modified", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/dev/script.js`)
    assertEqual(response.status, 200, "Should return 200 for .js file")
    const blobFile = response.headers.get("x-mock-blob-file")
    assertEqual(blobFile, "script.js", "Should request exact file path")
  })
}

// =============================================================================
// State Endpoint Tests
// =============================================================================
// Note: VALIDATE_TOKEN_AGAINST_AD is currently false, so PUT operations
// succeed without authentication. When enabled, PUT requires valid Azure AD token.
// State is stored as base64url encoded in cookies.

// Helper to base64url encode (matches server-side wrapState)
function base64UrlEncode(str) {
  return Buffer.from(str).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function testStateEndpoint() {
  console.log("\nState Endpoint Tests (/global-components/state/*):")
  console.log("  (Note: VALIDATE_TOKEN_AGAINST_AD=false, auth not enforced)")

  const PREVIEW_ENDPOINT = `${PROXY_BASE}/global-components/state/preview`
  const SETTINGS_ENDPOINT = `${PROXY_BASE}/global-components/state/settings`
  const OTHER_ENDPOINT = `${PROXY_BASE}/global-components/state/other-key`

  await test("GET on whitelisted key (preview) returns 200", async () => {
    const response = await fetch(PREVIEW_ENDPOINT)
    assertEqual(response.status, 200, "GET should return 200")
    const text = await response.text()
    assertEqual(text, "null", 'Should return "null" when no cookie present')
  })

  await test("GET on whitelisted key (settings) returns 200", async () => {
    const response = await fetch(SETTINGS_ENDPOINT)
    assertEqual(response.status, 200, "GET should return 200")
    const text = await response.text()
    assertEqual(text, "null", 'Should return "null" when no cookie present')
  })

  await test("GET on whitelisted key returns cookie value", async () => {
    const stateValue = JSON.stringify({ foo: "bar" })
    const wrappedState = base64UrlEncode(stateValue)
    const response = await fetch(PREVIEW_ENDPOINT, {
      headers: {
        Cookie: `cps-global-components-state=${wrappedState}`,
      },
    })
    assertEqual(response.status, 200, "GET should return 200")
    const text = await response.text()
    assertEqual(text, stateValue, "Should return unwrapped cookie value")
  })

  await test("GET on non-whitelisted key returns 200 (validation disabled)", async () => {
    const response = await fetch(OTHER_ENDPOINT)
    assertEqual(
      response.status,
      200,
      "GET should return 200 when validation disabled"
    )
  })

  await test("PUT succeeds without Authorization header (validation disabled)", async () => {
    const response = await fetch(PREVIEW_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test: "data" }),
    })
    assertEqual(
      response.status,
      200,
      "Should return 200 when validation disabled"
    )
    const body = await response.json()
    assertEqual(body.success, true, "Should have success true")
  })

  await test("PUT sets cookie with state value", async () => {
    const stateValue = JSON.stringify({ count: 42 })
    const response = await fetch(PREVIEW_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: stateValue,
    })
    assertEqual(response.status, 200, "Should return 200")
    const setCookie = response.headers.get("set-cookie")
    assert(setCookie !== null, "Should have Set-Cookie header")
    assert(setCookie.includes("cps-global-components-state="), "Should set state cookie")
    assert(setCookie.includes("Secure"), "Should have Secure flag")
    assert(setCookie.includes("SameSite=None"), "Should have SameSite=None")
  })

  await test("handles OPTIONS preflight request", async () => {
    const response = await fetch(PREVIEW_ENDPOINT, {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "PUT",
      },
    })
    assertEqual(response.status, 204, "OPTIONS should return 204")
    const allowMethods = response.headers.get("access-control-allow-methods")
    assert(
      allowMethods !== null,
      "Should have Access-Control-Allow-Methods header"
    )
    assert(allowMethods.includes("PUT"), "Should allow PUT method")
  })

  await test("PUT with null clears cookie and returns cleared flag", async () => {
    const response = await fetch(PREVIEW_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "null",
    })
    assertEqual(response.status, 200, "Should return 200")
    const body = await response.json()
    assertEqual(body.success, true, "Should have success true")
    assertEqual(body.cleared, true, "Should have cleared flag")
    const setCookie = response.headers.get("set-cookie")
    assert(setCookie !== null, "Should have Set-Cookie header")
    assert(setCookie.includes("Expires=Thu, 01 Jan 1970"), "Should set cookie to expire in the past")
  })

  await test("PUT with empty body clears cookie", async () => {
    const response = await fetch(PREVIEW_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "",
    })
    assertEqual(response.status, 200, "Should return 200")
    const body = await response.json()
    assertEqual(body.cleared, true, "Should have cleared flag for empty body")
  })

  await test("roundtrip: set state, verify, clear with null, verify cleared", async () => {
    // Step 1: Set state
    const stateValue = JSON.stringify({ enabled: true, caseMarkers: "a" })
    const putResponse = await fetch(PREVIEW_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: stateValue,
    })
    assertEqual(putResponse.status, 200, "PUT should return 200")
    const setCookie = putResponse.headers.get("set-cookie")
    assert(setCookie !== null, "Should have Set-Cookie header")

    // Extract cookie for subsequent requests
    const cookieMatch = setCookie.match(/cps-global-components-state=([^;]+)/)
    assert(cookieMatch !== null, "Should be able to extract cookie value")
    const cookieValue = cookieMatch[1]

    // Step 2: Verify state is returned on GET
    const getResponse1 = await fetch(PREVIEW_ENDPOINT, {
      headers: { Cookie: `cps-global-components-state=${cookieValue}` },
    })
    assertEqual(getResponse1.status, 200, "GET should return 200")
    const retrievedState = await getResponse1.text()
    assertEqual(retrievedState, stateValue, "Should return the stored state")

    // Step 3: Clear state with null
    const clearResponse = await fetch(PREVIEW_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "null",
    })
    assertEqual(clearResponse.status, 200, "Clear PUT should return 200")
    const clearBody = await clearResponse.json()
    assertEqual(clearBody.cleared, true, "Should have cleared flag")

    // Step 4: Verify GET without cookie returns null (simulating cleared cookie)
    const getResponse2 = await fetch(PREVIEW_ENDPOINT)
    assertEqual(getResponse2.status, 200, "GET should return 200")
    const clearedState = await getResponse2.text()
    assertEqual(clearedState, "null", "Should return null after clearing")
  })

  await test("roundtrip: settings endpoint set and get", async () => {
    // Step 1: Set settings state
    const settingsValue = JSON.stringify({ accessibilityBackground: true })
    const putResponse = await fetch(SETTINGS_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: settingsValue,
    })
    assertEqual(putResponse.status, 200, "PUT should return 200")
    const setCookie = putResponse.headers.get("set-cookie")
    assert(setCookie !== null, "Should have Set-Cookie header")

    // Extract cookie for subsequent requests
    const cookieMatch = setCookie.match(/cps-global-components-state=([^;]+)/)
    assert(cookieMatch !== null, "Should be able to extract cookie value")
    const cookieValue = cookieMatch[1]

    // Step 2: Verify settings state is returned on GET
    const getResponse = await fetch(SETTINGS_ENDPOINT, {
      headers: { Cookie: `cps-global-components-state=${cookieValue}` },
    })
    assertEqual(getResponse.status, 200, "GET should return 200")
    const retrievedState = await getResponse.text()
    assertEqual(retrievedState, settingsValue, "Should return the stored settings state")
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
  await testBlobStorageProxy()
  await testStateEndpoint()
  await testNavigateCmsOpen()
  await testNavigateCmsClose()
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
