#!/usr/bin/env node
/**
 * Build and run unit tests for global-components.vnever.js
 *
 * Uses esbuild to bundle the njs module, then runs the unit tests
 * against the bundled code.
 */

const esbuild = require("esbuild")
const path = require("path")
const fs = require("fs")

const CONFIG_DIR = path.join(__dirname, "..", "..")
const DIST_DIR = path.join(__dirname, "..", "..", "..", ".dist")

// Ensure dist directory exists
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true })
}

// Bundle the module
async function build() {
  await esbuild.build({
    entryPoints: [
      path.join(
        CONFIG_DIR,
        "global-components.vnever",
        "global-components.vnever.js"
      ),
    ],
    bundle: true,
    outfile: path.join(DIST_DIR, "global-components.vnever.bundle.js"),
    format: "esm",
    platform: "node",
    logLevel: "error",
  })
}

// Run tests
async function runTests() {
  // Dynamic import of the bundled module
  const modulePath = path.join(DIST_DIR, "global-components.vnever.bundle.js")
  const module = await import(modulePath)
  const glocovnever = module.default

  // Test framework
  let passed = 0
  let failed = 0

  function assert(condition, message) {
    if (!condition) throw new Error(message)
  }

  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(
        `${message}\n  Expected: ${JSON.stringify(
          expected
        )}\n  Actual:   ${JSON.stringify(actual)}`
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

  function createMockRequest(options = {}) {
    return {
      method: options.method || "GET",
      uri: options.uri || "/global-components/test",
      args: options.args || {},
      headersIn: options.headersIn || {},
      headersOut: {},
      variables: options.variables || {},
      returnCode: null,
      returnBody: null,
      return(code, body) {
        this.returnCode = code
        this.returnBody = body
      },
    }
  }

  // Mock ngx.fetch globally
  let mockFetchResponse = { status: 200, ok: true }
  let mockFetchError = null
  globalThis.ngx = {
    fetch: async (url, options) => {
      if (mockFetchError) throw mockFetchError
      return mockFetchResponse
    },
  }

  console.log("=".repeat(60))
  console.log("global-components.vnever.js Unit Tests")
  console.log("=".repeat(60))

  // --- handleHealthCheck tests ---
  console.log("\nhandleHealthCheck:")

  await test("returns 400 if url parameter missing", async () => {
    const r = createMockRequest({ args: {} })
    await glocovnever.handleHealthCheck(r)
    assertEqual(r.returnCode, 400, "Should return 400")
    assert(
      r.returnBody.includes("url parameter required"),
      "Should have error message"
    )
  })

  await test("returns 403 if url not in whitelist", async () => {
    const r = createMockRequest({ args: { url: "http://evil.com" } })
    await glocovnever.handleHealthCheck(r)
    assertEqual(r.returnCode, 403, "Should return 403")
    assert(
      r.returnBody.includes("url not in whitelist"),
      "Should have error message"
    )
  })

  await test("returns healthy true for 2xx response", async () => {
    mockFetchResponse = { status: 200 }
    mockFetchError = null
    const r = createMockRequest({
      args: { url: "https://polaris.cps.gov.uk/polaris" },
    })
    await glocovnever.handleHealthCheck(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    const body = JSON.parse(r.returnBody)
    assertEqual(body.healthy, true, "Should be healthy")
    assertEqual(body.status, 200, "Should have status 200")
  })

  await test("returns healthy false for 5xx response", async () => {
    mockFetchResponse = { status: 500 }
    mockFetchError = null
    const r = createMockRequest({
      args: { url: "https://polaris.cps.gov.uk/polaris" },
    })
    await glocovnever.handleHealthCheck(r)
    const body = JSON.parse(r.returnBody)
    assertEqual(body.healthy, false, "Should not be healthy")
    assertEqual(body.status, 500, "Should have status 500")
  })

  await test("returns healthy false on fetch error", async () => {
    mockFetchError = new Error("Connection refused")
    const r = createMockRequest({
      args: { url: "https://polaris.cps.gov.uk/polaris" },
    })
    await glocovnever.handleHealthCheck(r)
    const body = JSON.parse(r.returnBody)
    assertEqual(body.healthy, false, "Should not be healthy")
    assertEqual(body.status, 0, "Should have status 0")
    assertEqual(body.error, "Connection refused", "Should have error message")
    mockFetchError = null
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
    await build()
    await runTests()
  } catch (err) {
    console.error("Build/test failed:", err.message)
    process.exit(1)
  }
})()
