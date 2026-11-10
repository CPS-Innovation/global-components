#!/usr/bin/env node
/**
 * Build and run unit tests for global-components.vnext.js
 *
 * Loads the njs source with njs-loader.js (an .mjs copy, no bundler).
 * Environment values are passed via r.variables.
 */

const path = require("path")
const { loadNjs } = require("../../../njs-loader")

const fs = require("fs")
const CONFIG_DIR = path.join(__dirname, "..", "..")

// Run tests
async function runTests() {
  const modulePath = path.join(CONFIG_DIR, "global-components.vnext", "global-components.vnext.js")
  const glocovnext = await loadNjs(modulePath)

  let passed = 0
  let failed = 0

  function assert(condition, message) {
    if (!condition) throw new Error(message)
  }

  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(
        `${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`
      )
    }
  }

  async function test(name, fn) {
    try {
      await fn()
      passed++
      console.log(`  \x1b[32m✓\x1b[0m ${name}`)
    } catch (err) {
      failed++
      console.log(`  \x1b[31m✗\x1b[0m ${name}`)
      console.log(`    ${err.message}`)
    }
  }

  // Default mock environment variables
  const defaultVariables = {
    wm_mds_base_url: "http://mock-upstream:3000/api/",
  }

  // Set env var that was previously passed via js_var
  process.env["GLOBAL_COMPONENTS_APPLICATION_ID"] = "test-app-id"

  // Hardcoded tenant ID (must match the constant in global-components.vnext.js)
  const TENANT_ID = "00dd0d1d-d7e6-6338-ac51-565339c7088c"

  function createMockRequest(options = {}) {
    return {
      method: options.method || "GET",
      uri: options.uri || "/global-components/test",
      args: options.args || {},
      headersIn: options.headersIn || {},
      headersOut: {},
      variables: { ...defaultVariables, ...options.variables },
      returnCode: null,
      returnBody: null,
      requestText: options.requestText || "",
      sentBuffer: null,
      sentFlags: null,
      return(code, body) {
        this.returnCode = code
        this.returnBody = body
      },
      sendBuffer(buffer, flags) {
        this.sentBuffer = buffer
        this.sentFlags = flags
      },
    }
  }

  // Mock ngx.fetch globally
  let mockFetchResponse = {
    status: 200,
    ok: true,
    text: async () => "<html></html>",
  }
  let mockFetchError = null
  ;globalThis.ngx = {
    fetch: async () => {
      if (mockFetchError) throw mockFetchError
      return mockFetchResponse
    },
  }

  console.log("=".repeat(60))
  console.log("global-components.vnext.js Unit Tests")
  console.log("=".repeat(60))

  // --- handleValidateToken tests ---
  // Note: VALIDATE_TOKEN_AGAINST_AD is currently false, so all requests return 200
  console.log("\nhandleValidateToken:")

  await test("returns 200 when validation disabled (no auth header)", async () => {
    const r = createMockRequest({})
    await glocovnext.handleValidateToken(r)
    assertEqual(r.returnCode, 200, "Should return 200 (validation disabled)")
  })

  await test("returns 200 when validation disabled (any token)", async () => {
    const r = createMockRequest({
      headersIn: {
        Authorization: "Bearer any-token",
      },
    })
    await glocovnext.handleValidateToken(r)
    assertEqual(r.returnCode, 200, "Should return 200 (validation disabled)")
  })

  // --- filterSwaggerBody tests ---
  console.log("\nfilterSwaggerBody:")

  await test("replaces upstream URL with the proxied /api route", async () => {
    const r = createMockRequest({
      headersIn: { Host: "proxy.example.com" },
    })
    const data = '{"server": "http://mock-upstream:3000/api/"}'
    glocovnext.filterSwaggerBody(r, data, {})
    assert(
      r.sentBuffer.includes("https://proxy.example.com/global-components/api"),
      `Should replace upstream URL, got: ${r.sentBuffer}`
    )
  })

  await test("replaces upstream URL without trailing slash", async () => {
    // WM_MDS_BASE_URL has trailing slash but swagger JSON may not
    const r = createMockRequest({
      headersIn: { Host: "proxy.example.com" },
    })
    const data = '{"url": "http://mock-upstream:3000/api"}'
    glocovnext.filterSwaggerBody(r, data, {})
    assert(
      r.sentBuffer.includes("https://proxy.example.com/global-components/api"),
      `Should replace upstream URL without trailing slash, got: ${r.sentBuffer}`
    )
    assert(
      !r.sentBuffer.includes("mock-upstream"),
      `Should not contain original URL, got: ${r.sentBuffer}`
    )
  })

  await test("leaves operation paths untouched", async () => {
    // swagger-ui joins these onto the rewritten server url itself. Rewriting
    // them here too would produce /global-components/api/global-components/...
    const r = createMockRequest({
      headersIn: { Host: "proxy.example.com" },
    })
    const data = '{"paths": {"/authenticate": {}}}'
    glocovnext.filterSwaggerBody(r, data, {})
    assert(
      r.sentBuffer.includes('"/authenticate"'),
      `Operation path should survive verbatim, got: ${r.sentBuffer}`
    )
    assert(
      !r.sentBuffer.includes("/global-components/authenticate"),
      `Operation path should not be prefixed, got: ${r.sentBuffer}`
    )
  })

  // Summary
  console.log("\n" + "=".repeat(60))
  console.log(`Results: ${passed} passed, ${failed} failed`)
  console.log("=".repeat(60))

  process.exit(failed > 0 ? 1 : 0)
}

// Main
;(async () => {
  try {
    await runTests()
  } catch (err) {
    console.error("Build/test failed:", err.message)
    process.exit(1)
  }
})()
