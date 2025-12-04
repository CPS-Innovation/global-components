#!/usr/bin/env node
/**
 * Build and run unit tests for global-components.js
 *
 * Uses esbuild to bundle the njs module, then runs the unit tests
 * against the bundled code. Environment values are passed via r.variables.
 */

const esbuild = require("esbuild")
const path = require("path")
const fs = require("fs")

const CONFIG_DIR = path.join(__dirname, "..")
const DIST_DIR = path.join(__dirname, "..", "..", "..", ".dist")

// Ensure dist directory exists
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true })
}

// Bundle the module
async function build() {
  await esbuild.build({
    entryPoints: [path.join(CONFIG_DIR, "global-components.js")],
    bundle: true,
    outfile: path.join(DIST_DIR, "global-components.bundle.js"),
    format: "esm",
    platform: "node",
    external: ["fs"], // Keep fs external so we can mock it
    logLevel: "error",
  })
}

// Run tests
async function runTests() {
  // Dynamic import of the bundled module
  const modulePath = path.join(DIST_DIR, "global-components.bundle.js")
  const module = await import(modulePath)
  const gloco = module.default

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

  // Default mock environment variables (simulating js_var from nginx config)
  const defaultVariables = {
    global_components_mds_url: "http://mock-upstream:3000/api/",
  }

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
  let mockFetchResponse = { status: 200, ok: true }
  let mockFetchError = null
  globalThis.ngx = {
    fetch: async (url, options) => {
      if (mockFetchError) throw mockFetchError
      return mockFetchResponse
    },
  }

  console.log("=".repeat(60))
  console.log("global-components.js Unit Tests")
  console.log("=".repeat(60))

  // --- readCmsAuthValues tests ---
  console.log("\nreadCmsAuthValues:")

  await test("returns header value if present", async () => {
    const r = createMockRequest({
      headersIn: { "Cms-Auth-Values": "userId=123" },
    })
    assertEqual(
      gloco.readCmsAuthValues(r),
      "userId=123",
      "Should return header value"
    )
  })

  await test("decodes encoded header value", async () => {
    const r = createMockRequest({
      headersIn: { "Cms-Auth-Values": "userId%3D123" },
    })
    assertEqual(
      gloco.readCmsAuthValues(r),
      "userId=123",
      "Should decode header value"
    )
  })

  await test("falls back to cookie if header missing", async () => {
    const r = createMockRequest({
      headersIn: { Cookie: "Cms-Auth-Values=fromCookie" },
    })
    assertEqual(
      gloco.readCmsAuthValues(r),
      "fromCookie",
      "Should return cookie value"
    )
  })

  await test("header takes precedence over cookie", async () => {
    const r = createMockRequest({
      headersIn: {
        "Cms-Auth-Values": "fromHeader",
        Cookie: "Cms-Auth-Values=fromCookie",
      },
    })
    assertEqual(
      gloco.readCmsAuthValues(r),
      "fromHeader",
      "Should prefer header"
    )
  })

  await test("returns empty string if neither present", async () => {
    const r = createMockRequest({})
    assertEqual(gloco.readCmsAuthValues(r), "", "Should return empty string")
  })

  // --- readCorsOrigin tests ---
  console.log("\nreadCorsOrigin:")

  await test("returns origin if allowed", async () => {
    const r = createMockRequest({
      headersIn: { Origin: "http://localhost:3000" },
    })
    assertEqual(
      gloco.readCorsOrigin(r),
      "http://localhost:3000",
      "Should return origin"
    )
  })

  await test("returns empty string if not allowed", async () => {
    const r = createMockRequest({
      headersIn: { Origin: "https://evil.com" },
    })
    assertEqual(gloco.readCorsOrigin(r), "", "Should return empty string")
  })

  // --- swaggerBodyFilter tests ---
  console.log("\nswaggerBodyFilter:")

  await test("replaces upstream URL with proxy URL", async () => {
    const r = createMockRequest({
      headersIn: { Host: "proxy.example.com" },
    })
    const data = '{"server": "http://mock-upstream:3000/api/"}'
    gloco.filterSwaggerBody(r, data, {})
    assert(
      r.sentBuffer.includes("https://proxy.example.com/global-components"),
      `Should replace upstream URL, got: ${r.sentBuffer}`
    )
  })

  await test("rewrites API paths", async () => {
    const r = createMockRequest({
      headersIn: { Host: "proxy.example.com" },
    })
    const data = '{"path": "/api/users"}'
    gloco.filterSwaggerBody(r, data, {})
    assert(
      r.sentBuffer.includes('"/global-components/users"'),
      `Should rewrite API path, got: ${r.sentBuffer}`
    )
  })

  // --- handleStatus tests ---
  console.log("\nhandleStatus:")

  await test("returns JSON with status and version from deployment file", async () => {
    // Mock fs.readFileSync to return deployment JSON
    const originalReadFileSync = fs.readFileSync
    fs.readFileSync = (path, encoding) => {
      if (path === "/etc/nginx/templates/global-components-deployment.json") {
        return JSON.stringify({ version: 42 })
      }
      return originalReadFileSync(path, encoding)
    }

    const r = createMockRequest({})
    gloco.handleStatus(r)

    fs.readFileSync = originalReadFileSync // Restore

    assertEqual(r.returnCode, 200, "Should return 200")
    assertEqual(
      r.headersOut["Content-Type"],
      "application/json",
      "Should be JSON"
    )
    const body = JSON.parse(r.returnBody)
    assertEqual(body.status, "online", "Should have status online")
    assertEqual(body.version, 42, "Should have version from deployment file")
  })

  await test("returns version 0 when deployment file does not exist", async () => {
    // Mock fs.readFileSync to throw (file not found)
    const originalReadFileSync = fs.readFileSync
    fs.readFileSync = (path, encoding) => {
      if (path === "/etc/nginx/templates/global-components-deployment.json") {
        throw new Error("ENOENT: no such file or directory")
      }
      return originalReadFileSync(path, encoding)
    }

    const r = createMockRequest({})
    gloco.handleStatus(r)

    fs.readFileSync = originalReadFileSync // Restore

    assertEqual(r.returnCode, 200, "Should return 200")
    const body = JSON.parse(r.returnBody)
    assertEqual(body.status, "online", "Should have status online")
    assertEqual(body.version, 0, "Should return version 0 when file missing")
  })

  // --- handleSessionHint tests ---
  console.log("\nhandleSessionHint:")

  await test('returns "null" when no cms-session-hint cookie present', async () => {
    const r = createMockRequest({})
    gloco.handleSessionHint(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assertEqual(r.returnBody, "null", 'Should return "null"')
  })

  await test("returns cookie value when cms-session-hint cookie present", async () => {
    const hintValue = '{"cmsDomains":["foo.cps.gov.uk"],"isProxySession":false}'
    const r = createMockRequest({
      headersIn: { Cookie: `cms-session-hint=${hintValue}` },
    })
    gloco.handleSessionHint(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assertEqual(r.returnBody, hintValue, "Should return cookie value")
  })

  await test("decodes URL-encoded cms-session-hint cookie value", async () => {
    const hintValue = '{"cmsDomains":["foo.cps.gov.uk"],"isProxySession":true}'
    const encodedValue = encodeURIComponent(hintValue)
    const r = createMockRequest({
      headersIn: { Cookie: `cms-session-hint=${encodedValue}` },
    })
    gloco.handleSessionHint(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assertEqual(r.returnBody, hintValue, "Should return decoded cookie value")
  })

  await test("extracts cms-session-hint from multiple cookies", async () => {
    const hintValue = '{"cmsDomains":[],"isProxySession":false}'
    const r = createMockRequest({
      headersIn: {
        Cookie: `other=value; cms-session-hint=${encodeURIComponent(
          hintValue
        )}; another=cookie`,
      },
    })
    gloco.handleSessionHint(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assertEqual(r.returnBody, hintValue, "Should extract correct cookie")
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
