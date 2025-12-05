#!/usr/bin/env node
/**
 * Build and run unit tests for global-components.vnext.js
 *
 * Uses esbuild to bundle the njs module, then runs the unit tests
 * against the bundled code. Environment values are passed via r.variables.
 */

const esbuild = require("esbuild")
const path = require("path")
const fs = require("fs")
const originalReadFileSync = fs.readFileSync

const CONFIG_DIR = path.join(__dirname, "..", "..")
const DIST_DIR = path.join(__dirname, "..", "..", "..", ".dist")

// Ensure dist directory exists
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true })
}

// Bundle both modules
async function build() {
  // Bundle base module first
  await esbuild.build({
    entryPoints: [
      path.join(CONFIG_DIR, "global-components", "global-components.js"),
    ],
    bundle: true,
    outfile: path.join(DIST_DIR, "global-components.bundle.js"),
    format: "esm",
    platform: "node",
    logLevel: "error",
  })

  // Bundle vnext module
  await esbuild.build({
    entryPoints: [
      path.join(
        CONFIG_DIR,
        "global-components.vnext",
        "global-components.vnext.js"
      ),
    ],
    bundle: true,
    outfile: path.join(DIST_DIR, "global-components.vnext.bundle.js"),
    format: "esm",
    platform: "node",
    external: ["fs"], // Keep fs external so we can mock it
    alias: {
      "templates/global-components.js": path.join(
        DIST_DIR,
        "global-components.bundle.js"
      ),
    },
    logLevel: "error",
  })
}

// Run tests
async function runTests() {
  // Dynamic import of the bundled vnext module
  const modulePath = path.join(DIST_DIR, "global-components.vnext.bundle.js")
  const module = await import(modulePath)
  const glocovnext = module.default

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
  // Note: tenant_id is now hardcoded in the js file as TENANT_ID constant
  const defaultVariables = {
    global_components_application_id: "test-app-id",
    wm_mds_base_url: "http://mock-upstream:3000/api/",
  }

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
  globalThis.ngx = {
    fetch: async (url, options) => {
      if (mockFetchError) throw mockFetchError
      return mockFetchResponse
    },
  }

  console.log("=".repeat(60))
  console.log("global-components.vnext.js Unit Tests")
  console.log("=".repeat(60))

  // --- handleState tests ---
  console.log("\nhandleState:")

  await test("GET on whitelisted key (preview) returns null without auth", async () => {
    const r = createMockRequest({
      method: "GET",
      uri: "/global-components/state/preview",
    })
    await glocovnext.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assertEqual(r.returnBody, "null", "Should return null")
    assertEqual(
      r.headersOut["Content-Type"],
      "application/json",
      "Should set Content-Type"
    )
  })

  await test("GET on whitelisted key returns cookie value without auth", async () => {
    const stateValue = JSON.stringify({ foo: "bar" })
    // State is stored as base64url encoded
    const wrappedState = Buffer.from(stateValue).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    const r = createMockRequest({
      method: "GET",
      uri: "/global-components/state/preview",
      headersIn: {
        Cookie: `cps-global-components-state=${wrappedState}`,
      },
    })
    await glocovnext.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assertEqual(r.returnBody, stateValue, "Should return unwrapped cookie value")
  })

  await test("GET on non-whitelisted key returns 401 without auth", async () => {
    const r = createMockRequest({
      method: "GET",
      uri: "/global-components/state/other-key",
    })
    await glocovnext.handleState(r)
    assertEqual(r.returnCode, 401, "Should return 401")
  })

  await test("PUT returns 401 without Authorization header", async () => {
    const r = createMockRequest({
      method: "PUT",
      uri: "/global-components/state/my-key",
      requestText: JSON.stringify({ count: 42 }),
    })
    await glocovnext.handleState(r)
    assertEqual(r.returnCode, 401, "Should return 401")
    const body = JSON.parse(r.returnBody)
    assertEqual(body.error, "Unauthorized", "Should have error message")
  })

  await test("PUT returns 401 when token validation fails", async () => {
    mockFetchResponse = { status: 401, ok: false }
    const r = createMockRequest({
      method: "PUT",
      uri: "/global-components/state/my-key",
      headersIn: {
        Authorization: "Bearer invalid-token",
      },
      requestText: JSON.stringify({ count: 42 }),
    })
    await glocovnext.handleState(r)
    assertEqual(r.returnCode, 401, "Should return 401")
    mockFetchResponse = { status: 200, ok: true } // Reset
  })

  await test("PUT sets cookie with body content when authenticated", async () => {
    mockFetchResponse = { status: 200, ok: true }
    // Create mock JWT with valid claims (tid matching hardcoded TENANT_ID, appid matching r.variables)
    const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" })).replace(
      /=/g,
      ""
    )
    const payload = btoa(
      JSON.stringify({ tid: TENANT_ID, appid: "test-app-id" })
    ).replace(/=/g, "")
    const mockJwt = `${header}.${payload}.mock-signature`

    const stateValue = JSON.stringify({ count: 42 })
    const r = createMockRequest({
      method: "PUT",
      uri: "/global-components/state/my-key",
      headersIn: {
        Authorization: `Bearer ${mockJwt}`,
      },
      requestText: stateValue,
    })
    await glocovnext.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    const body = JSON.parse(r.returnBody)
    assertEqual(body.success, true, "Should have success true")
    assertEqual(
      body.path,
      "/global-components/state/my-key",
      "Should include path"
    )
    const setCookie = r.headersOut["Set-Cookie"]
    assert(
      setCookie.includes("cps-global-components-state="),
      "Should set cookie"
    )
    assert(
      setCookie.includes("Path=/global-components/state/my-key"),
      "Should set path"
    )
    assert(setCookie.includes("Secure"), "Should have Secure flag")
    assert(setCookie.includes("SameSite=None"), "Should have SameSite=None")
  })

  await test("returns 405 for unsupported methods", async () => {
    const r = createMockRequest({
      method: "DELETE",
      uri: "/global-components/state/my-key",
    })
    await glocovnext.handleState(r)
    assertEqual(r.returnCode, 405, "Should return 405")
    const body = JSON.parse(r.returnBody)
    assertEqual(body.error, "Method not allowed", "Should have error message")
  })

  // --- handleValidateToken tests ---
  console.log("\nhandleValidateToken:")

  await test("returns 401 when no Authorization header", async () => {
    const r = createMockRequest({})
    await glocovnext.handleValidateToken(r)
    assertEqual(r.returnCode, 401, "Should return 401")
  })

  await test("returns 401 when token validation fails", async () => {
    mockFetchResponse = { status: 401, ok: false }
    const r = createMockRequest({
      headersIn: {
        Authorization: "Bearer invalid-token",
      },
    })
    await glocovnext.handleValidateToken(r)
    assertEqual(r.returnCode, 401, "Should return 401")
  })

  await test("returns 200 when token is valid", async () => {
    mockFetchResponse = { status: 200, ok: true }
    // Create mock JWT with valid claims
    const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" })).replace(
      /=/g,
      ""
    )
    const payload = btoa(
      JSON.stringify({ tid: TENANT_ID, appid: "test-app-id" })
    ).replace(/=/g, "")
    const mockJwt = `${header}.${payload}.mock-signature`

    const r = createMockRequest({
      headersIn: {
        Authorization: `Bearer ${mockJwt}`,
      },
    })
    await glocovnext.handleValidateToken(r)
    assertEqual(r.returnCode, 200, "Should return 200")
  })

  // --- handleStatus tests ---
  console.log("\nhandleStatus:")

  await test("returns JSON with status and version from deployment file", async () => {
    // Mock fs.readFileSync to return deployment JSON
    fs.readFileSync = (path, encoding) => {
      if (path === "/etc/nginx/templates/global-components-deployment.json") {
        return JSON.stringify({ version: 42 })
      }
      return originalReadFileSync(path, encoding)
    }

    const r = createMockRequest({})
    glocovnext.handleStatus(r)

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
    fs.readFileSync = (path, encoding) => {
      if (path === "/etc/nginx/templates/global-components-deployment.json") {
        throw new Error("ENOENT: no such file or directory")
      }
      return originalReadFileSync(path, encoding)
    }

    const r = createMockRequest({})
    glocovnext.handleStatus(r)

    fs.readFileSync = originalReadFileSync // Restore

    assertEqual(r.returnCode, 200, "Should return 200")
    const body = JSON.parse(r.returnBody)
    assertEqual(body.status, "online", "Should have status online")
    assertEqual(body.version, 0, "Should return version 0 when file missing")
  })

  // --- filterSwaggerBody tests ---
  console.log("\nfilterSwaggerBody:")

  await test("replaces upstream URL with proxy URL", async () => {
    const r = createMockRequest({
      headersIn: { Host: "proxy.example.com" },
    })
    const data = '{"server": "http://mock-upstream:3000/api/"}'
    glocovnext.filterSwaggerBody(r, data, {})
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
    glocovnext.filterSwaggerBody(r, data, {})
    assert(
      r.sentBuffer.includes('"/global-components/users"'),
      `Should rewrite API path, got: ${r.sentBuffer}`
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
    await build()
    await runTests()
  } catch (err) {
    console.error("Build/test failed:", err.message)
    process.exit(1)
  }
})()
