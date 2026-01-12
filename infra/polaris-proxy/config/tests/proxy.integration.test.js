/**
 * Basic integration tests for polaris-proxy
 * Tests that nginx starts up and basic routes work
 */

const {
  PROXY_BASE,
  getState,
  resetState,
  assert,
  assertEqual,
  assertIncludes,
  test,
  fetchText,
  fetchResponse,
} = require("../../test-utils")

async function runTests() {
  console.log("\nPolaris Proxy Integration Tests")
  console.log("================================")
  console.log(`Testing against: ${PROXY_BASE}`)
  console.log("")

  resetState()

  // Health check
  await test("GET / returns health message", async () => {
    const text = await fetchText(`${PROXY_BASE}/`)
    assertIncludes(text, "online", "Health endpoint should indicate proxy is online")
  })

  // Robots.txt endpoint
  await test("GET /robots933456.txt returns 200", async () => {
    const response = await fetchResponse(`${PROXY_BASE}/robots933456.txt`)
    assertEqual(response.status, 200, "Robots endpoint should return 200")
  })

  // Polaris script endpoint
  await test("GET /polaris-script.js returns JavaScript", async () => {
    const response = await fetchResponse(`${PROXY_BASE}/polaris-script.js`)
    assertEqual(response.status, 200, "Polaris script should return 200")
    const contentType = response.headers.get("content-type")
    assert(
      contentType && contentType.includes("javascript"),
      `Content-Type should be JavaScript, got: ${contentType}`
    )
  })

  // Environment switch endpoints (require IE user agent to redirect, otherwise 402)
  // IE User-Agent for testing
  const ieHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Trident/7.0; rv:11.0)",
  }

  await test("GET /cin2 without IE returns 402", async () => {
    const response = await fetchResponse(`${PROXY_BASE}/cin2`)
    assertEqual(response.status, 402, "cin2 without IE should return 402")
  })

  await test("GET /cin2 with IE redirects to /CMS", async () => {
    const response = await fetchResponse(`${PROXY_BASE}/cin2`, { headers: ieHeaders })
    assertEqual(response.status, 302, "cin2 with IE should redirect")
    const location = response.headers.get("location")
    assertIncludes(location, "/CMS", "Should redirect to /CMS")
  })

  await test("GET /cin3 with IE redirects to /CMS", async () => {
    const response = await fetchResponse(`${PROXY_BASE}/cin3`, { headers: ieHeaders })
    assertEqual(response.status, 302, "cin3 with IE should redirect")
    const location = response.headers.get("location")
    assertIncludes(location, "/CMS", "Should redirect to /CMS")
  })

  await test("GET /cin4 with IE redirects to /CMS", async () => {
    const response = await fetchResponse(`${PROXY_BASE}/cin4`, { headers: ieHeaders })
    assertEqual(response.status, 302, "cin4 with IE should redirect")
    const location = response.headers.get("location")
    assertIncludes(location, "/CMS", "Should redirect to /CMS")
  })

  await test("GET /cin5 with IE redirects to /CMS", async () => {
    const response = await fetchResponse(`${PROXY_BASE}/cin5`, { headers: ieHeaders })
    assertEqual(response.status, 302, "cin5 with IE should redirect")
    const location = response.headers.get("location")
    assertIncludes(location, "/CMS", "Should redirect to /CMS")
  })

  // Environment cookies should be set on cin switches
  await test("GET /cin2 with IE sets __CMSENV cookie", async () => {
    const response = await fetchResponse(`${PROXY_BASE}/cin2`, { headers: ieHeaders })
    const setCookie = response.headers.get("set-cookie")
    assert(setCookie, "Should have Set-Cookie header")
    assertIncludes(setCookie, "__CMSENV=cin2", "Should set cin2 environment cookie")
  })

  // Print summary
  const state = getState()
  console.log("")
  console.log(`Results: ${state.passed} passed, ${state.failed} failed`)

  if (state.failed > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error("Test runner error:", err)
  process.exit(1)
})
