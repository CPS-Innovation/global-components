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

  // ============================================================
  // Dev-login route tests
  // ============================================================

  await test("GET /dev-login/ clears __CMSENV cookie", async () => {
    const response = await fetchResponse(`${PROXY_BASE}/dev-login/`)
    assertEqual(response.status, 200, "dev-login GET should return 200")
    const setCookie = response.headers.get("set-cookie")
    assert(setCookie, "Should have Set-Cookie header")
    assertIncludes(setCookie, "__CMSENV=deleted", "Should clear __CMSENV cookie")
  })

  await test("GET /dev-login/ clears BIG-IP cookies", async () => {
    const response = await fetchResponse(`${PROXY_BASE}/dev-login/`)
    const setCookie = response.headers.get("set-cookie")
    assertIncludes(setCookie, "BIGipServer", "Should have BIG-IP cookie deletions")
    assertIncludes(setCookie, "expires=Thu, 01 Jan 1970", "BIG-IP cookies should be expired")
  })

  await test("POST /dev-login/ with selected-environment=cin2 sets __CMSENV=cin2", async () => {
    const response = await fetchResponse(`${PROXY_BASE}/dev-login/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "selected-environment=cin2",
    })
    assertEqual(response.status, 200, "dev-login POST should return 200")
    const setCookie = response.headers.get("set-cookie")
    assert(setCookie, "Should have Set-Cookie header")
    assertIncludes(setCookie, "__CMSENV=cin2", "Should set cin2 environment cookie")
  })

  await test("POST /dev-login/ with selected-environment=cin5 sets __CMSENV=cin5", async () => {
    const response = await fetchResponse(`${PROXY_BASE}/dev-login/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "selected-environment=cin5",
    })
    const setCookie = response.headers.get("set-cookie")
    assertIncludes(setCookie, "__CMSENV=cin5", "Should set cin5 environment cookie")
  })

  await test("POST /dev-login/ with selected-environment=cin3 sets __CMSENV=default", async () => {
    const response = await fetchResponse(`${PROXY_BASE}/dev-login/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "selected-environment=cin3",
    })
    const setCookie = response.headers.get("set-cookie")
    assertIncludes(setCookie, "__CMSENV=default", "cin3 should map to __CMSENV=default")
  })

  await test("POST /dev-login/ without selected-environment clears cookies", async () => {
    const response = await fetchResponse(`${PROXY_BASE}/dev-login/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "username=test&password=test",
    })
    const setCookie = response.headers.get("set-cookie")
    assertIncludes(setCookie, "__CMSENV=deleted", "Should clear __CMSENV when no env selected")
  })

  // Full-cookie endpoint tests
  await test("GET /api/dev-login-full-cookie/ clears cookies", async () => {
    const response = await fetchResponse(`${PROXY_BASE}/api/dev-login-full-cookie/`)
    assertEqual(response.status, 200, "dev-login-full-cookie GET should return 200")
    const setCookie = response.headers.get("set-cookie")
    assert(setCookie, "Should have Set-Cookie header")
    assertIncludes(setCookie, "__CMSENV=deleted", "Should clear __CMSENV cookie")
  })

  await test("POST /api/dev-login-full-cookie/ with selected-environment=cin4 sets __CMSENV=cin4", async () => {
    const response = await fetchResponse(`${PROXY_BASE}/api/dev-login-full-cookie/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "selected-environment=cin4",
    })
    const setCookie = response.headers.get("set-cookie")
    assertIncludes(setCookie, "__CMSENV=cin4", "Should set cin4 environment cookie")
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
