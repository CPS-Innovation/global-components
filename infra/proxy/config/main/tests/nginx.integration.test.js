#!/usr/bin/env node
/**
 * Integration tests for nginx.js auth redirect handlers
 *
 * Tests the auth redirect endpoints: /init and /polaris
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
// Auth Redirect Tests (/init endpoint)
// =============================================================================

async function testAuthRedirect() {
  console.log("\nAuth Redirect Tests (/init endpoint):")

  const INIT_ENDPOINT = `${PROXY_BASE}/init`

  await test("redirects to whitelisted URL with cookie appended", async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=session%3Dabc123`,
      {
        redirect: "manual",
        headers: {
          "X-Forwarded-Proto": "https",
          Host: "localhost:8080",
        },
      }
    )
    assertEqual(response.status, 302, "Should return 302 redirect")
    const location = response.headers.get("location")
    assert(location !== null, "Should have Location header")
    assert(
      location.includes("/auth-refresh-inbound"),
      `Should redirect to auth-refresh-inbound, got: ${location}`
    )
    assert(
      location.includes("cc="),
      `Should include cc param, got: ${location}`
    )
  })

  await test("returns 403 for non-whitelisted URL", async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=http://evil.com/callback&cookie=session%3Dabc`,
      {
        redirect: "manual",
        headers: {
          "X-Forwarded-Proto": "https",
          Host: "localhost:8080",
        },
      }
    )
    assertEqual(
      response.status,
      403,
      "Should return 403 for non-whitelisted URL"
    )
  })

  await test("sets Cms-Session-Hint cookie with correct attributes", async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=PREFIX-foo.cps.gov.uk_POOL%3Dvalue`,
      {
        redirect: "manual",
        headers: {
          "X-Forwarded-Proto": "https",
          Host: "localhost:8080",
        },
      }
    )
    const setCookie = response.headers.get("set-cookie")
    assert(setCookie !== null, "Should have Set-Cookie header")
    assert(
      setCookie.includes("Cms-Session-Hint="),
      "Should set Cms-Session-Hint cookie"
    )
    assert(setCookie.includes("Path=/"), "Should have Path=/")
    assert(setCookie.includes("Secure"), "Should have Secure attribute")
    assert(setCookie.includes("SameSite=None"), "Should have SameSite=None")
    assert(setCookie.includes("Expires="), "Should have Expires attribute")
  })

  await test("session hint cookie contains valid JSON with cmsDomains array", async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=PREFIX-foo.bar.cps.gov.uk_POOL%3Dx%3BPREFIX-other.cps.gov.uk_POOL%3Dy`,
      {
        redirect: "manual",
        headers: {
          "X-Forwarded-Proto": "https",
          Host: "localhost:8080",
        },
      }
    )
    const setCookie = response.headers.get("set-cookie")
    const match = setCookie.match(/Cms-Session-Hint=([^;]+)/)
    assert(match !== null, "Should be able to extract cookie value")
    const hint = JSON.parse(decodeURIComponent(match[1]))
    assert(Array.isArray(hint.cmsDomains), "cmsDomains should be an array")
    assert(
      hint.cmsDomains.includes("foo.bar.cps.gov.uk"),
      `Should include first CMS domain, got: ${JSON.stringify(hint.cmsDomains)}`
    )
    assert(
      hint.cmsDomains.includes("other.cps.gov.uk"),
      `Should include second CMS domain, got: ${JSON.stringify(
        hint.cmsDomains
      )}`
    )
  })

  await test("session hint cookie has isProxySession false by default", async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=PREFIX-foo.cps.gov.uk_POOL%3Dvalue`,
      {
        redirect: "manual",
        headers: {
          "X-Forwarded-Proto": "https",
          Host: "localhost:8080",
        },
      }
    )
    const setCookie = response.headers.get("set-cookie")
    const match = setCookie.match(/Cms-Session-Hint=([^;]+)/)
    const hint = JSON.parse(decodeURIComponent(match[1]))
    assertEqual(
      hint.isProxySession,
      false,
      "isProxySession should be false by default"
    )
  })

  await test("session hint cookie has isProxySession true when param set", async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=PREFIX-foo.cps.gov.uk_POOL%3Dvalue&is-proxy-session=true`,
      {
        redirect: "manual",
        headers: {
          "X-Forwarded-Proto": "https",
          Host: "localhost:8080",
        },
      }
    )
    const setCookie = response.headers.get("set-cookie")
    const match = setCookie.match(/Cms-Session-Hint=([^;]+)/)
    const hint = JSON.parse(decodeURIComponent(match[1]))
    assertEqual(
      hint.isProxySession,
      true,
      "isProxySession should be true when param set"
    )
  })

  await test("session hint has handoverEndpoint using host when isProxySession true", async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=PREFIX-foo.cps.gov.uk_POOL%3Dvalue&is-proxy-session=true`,
      {
        redirect: "manual",
        headers: {
          "X-Forwarded-Proto": "https",
          Host: "localhost:8080",
        },
      }
    )
    const setCookie = response.headers.get("set-cookie")
    const match = setCookie.match(/Cms-Session-Hint=([^;]+)/)
    const hint = JSON.parse(decodeURIComponent(match[1]))
    assertEqual(
      hint.handoverEndpoint,
      "https://localhost:8080/polaris",
      "handoverEndpoint should use request host when isProxySession"
    )
  })

  await test("session hint has handoverEndpoint using first cmsDomain when not proxy session", async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=PREFIX-foo.cps.gov.uk_POOL%3Dvalue`,
      {
        redirect: "manual",
        headers: {
          "X-Forwarded-Proto": "https",
          Host: "localhost:8080",
        },
      }
    )
    const setCookie = response.headers.get("set-cookie")
    const match = setCookie.match(/Cms-Session-Hint=([^;]+)/)
    const hint = JSON.parse(decodeURIComponent(match[1]))
    assertEqual(
      hint.handoverEndpoint,
      "https://foo.cps.gov.uk/polaris",
      "handoverEndpoint should use first cmsDomain when not proxy session"
    )
  })

  await test("session hint has null handoverEndpoint when no CMS cookies", async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=regular%3Dcookie`,
      {
        redirect: "manual",
        headers: {
          "X-Forwarded-Proto": "https",
          Host: "localhost:8080",
        },
      }
    )
    const setCookie = response.headers.get("set-cookie")
    const match = setCookie.match(/Cms-Session-Hint=([^;]+)/)
    const hint = JSON.parse(decodeURIComponent(match[1]))
    assertEqual(
      hint.handoverEndpoint,
      null,
      "handoverEndpoint should be null when no CMS cookies"
    )
  })

  await test("session hint cookie has empty cmsDomains when no CMS cookies", async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=regular%3Dcookie`,
      {
        redirect: "manual",
        headers: {
          "X-Forwarded-Proto": "https",
          Host: "localhost:8080",
        },
      }
    )
    const setCookie = response.headers.get("set-cookie")
    const match = setCookie.match(/Cms-Session-Hint=([^;]+)/)
    const hint = JSON.parse(decodeURIComponent(match[1]))
    assertEqual(
      hint.cmsDomains.length,
      0,
      "cmsDomains should be empty array when no CMS cookies"
    )
  })
}

// =============================================================================
// Polaris Auth Redirect Tests (/polaris endpoint)
// =============================================================================

async function testPolarisRedirect() {
  console.log("\nPolaris Auth Redirect Tests (/polaris endpoint):")

  const POLARIS_ENDPOINT = `${PROXY_BASE}/polaris`

  await test("redirects to /init with query params and cookies", async () => {
    const response = await fetch(`${POLARIS_ENDPOINT}?q=12345`, {
      redirect: "manual",
      headers: {
        "X-Forwarded-Proto": "https",
        Host: "localhost:8080",
        Cookie: "session=abc123",
        Referer: "http://cms.example.org/page",
      },
    })
    assertEqual(response.status, 302, "Should return 302 redirect")
    const location = response.headers.get("location")
    assert(location !== null, "Should have Location header")
    assert(
      location.includes("/init?"),
      `Should redirect to /init, got: ${location}`
    )
    assert(
      location.includes("q=12345"),
      `Should include original q param, got: ${location}`
    )
    assert(
      location.includes("cookie="),
      `Should include cookie param, got: ${location}`
    )
    assert(
      location.includes("is-proxy-session=true"),
      `Should include is-proxy-session=true, got: ${location}`
    )
  })

  await test("includes referer in redirect URL", async () => {
    const response = await fetch(`${POLARIS_ENDPOINT}`, {
      redirect: "manual",
      headers: {
        "X-Forwarded-Proto": "https",
        Host: "localhost:8080",
        Cookie: "session=abc",
        Referer: "http://cms.example.org/somepage",
      },
    })
    const location = response.headers.get("location")
    assert(
      location.includes("referer="),
      `Should include referer param, got: ${location}`
    )
  })
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  // Disable TLS verification for self-signed certs
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

  await testAuthRedirect()
  await testPolarisRedirect()
}

module.exports = main

// Run if called directly
if (require.main === module) {
  resetState()
  console.log("=".repeat(60))
  console.log("Main (nginx.js) Integration Tests")
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
