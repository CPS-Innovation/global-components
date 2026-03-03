#!/usr/bin/env npx ts-node
/**
 * Build and run unit tests for global-components.ts
 *
 * Uses esbuild to bundle the njs module, then runs the unit tests
 * against the bundled code. Environment values are passed via r.variables.
 */

import * as esbuild from "esbuild"
import * as path from "path"
import * as fs from "fs"

const CONFIG_DIR = path.join(__dirname, "..")
const DIST_DIR = path.join(__dirname, "..", "..", "..", ".dist")

// Ensure dist directory exists
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true })
}

interface MockRequest {
  method: string
  uri: string
  args: Record<string, string>
  headersIn: Record<string, string>
  headersOut: Record<string, string | string[]>
  variables: Record<string, string>
  returnCode: number | null
  returnBody: string | null
  requestText: string
  sentBuffer: string | null
  sentFlags: Record<string, unknown> | null
  return(code: number, body: string): void
  sendBuffer(buffer: string, flags: Record<string, unknown>): void
}

interface MockRequestOptions {
  method?: string
  uri?: string
  args?: Record<string, string>
  headersIn?: Record<string, string>
  variables?: Record<string, string>
  requestText?: string
}

interface GlocoModule {
  readCmsAuthValues(r: MockRequest): string
  readCorsOrigin(r: MockRequest): string
  handleSessionHint(r: MockRequest): void
  handleState(r: MockRequest): Promise<void>
}

// Bundle the module
async function build(): Promise<void> {
  await esbuild.build({
    entryPoints: [path.join(CONFIG_DIR, "global-components.ts")],
    bundle: true,
    outfile: path.join(DIST_DIR, "global-components.bundle.js"),
    format: "esm",
    platform: "node",
    external: ["fs"],
    logLevel: "error",
  })
}

// Run tests
async function runTests(): Promise<void> {
  const modulePath = path.join(DIST_DIR, "global-components.bundle.js")
  const module = await import(modulePath)
  const gloco: GlocoModule = module.default

  let passed = 0
  let failed = 0

  function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message)
  }

  function assertEqual(actual: unknown, expected: unknown, message: string): void {
    if (actual !== expected) {
      throw new Error(
        `${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`
      )
    }
  }

  async function test(name: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn()
      passed++
      console.log(`  \x1b[32m✓\x1b[0m ${name}`)
    } catch (err) {
      failed++
      console.log(`  \x1b[31m✗\x1b[0m ${name}`)
      console.log(`    ${(err as Error).message}`)
    }
  }

  function createMockRequest(options: MockRequestOptions = {}): MockRequest {
    return {
      method: options.method || "GET",
      uri: options.uri || "/global-components/test",
      args: options.args || {},
      headersIn: options.headersIn || {},
      headersOut: {},
      variables: options.variables || {},
      returnCode: null,
      returnBody: null,
      requestText: options.requestText || "",
      sentBuffer: null,
      sentFlags: null,
      return(code: number, body: string) {
        this.returnCode = code
        this.returnBody = body
      },
      sendBuffer(buffer: string, flags: Record<string, unknown>) {
        this.sentBuffer = buffer
        this.sentFlags = flags
      },
    }
  }

  // Mock ngx.fetch globally (used by _validateToken, currently disabled)
  ;(globalThis as Record<string, unknown>).ngx = {
    fetch: async () => ({ status: 200, ok: true, text: async () => "" }),
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
    assertEqual(gloco.readCmsAuthValues(r), "userId=123", "Should return header value")
  })

  await test("decodes encoded header value", async () => {
    const r = createMockRequest({
      headersIn: { "Cms-Auth-Values": "userId%3D123" },
    })
    assertEqual(gloco.readCmsAuthValues(r), "userId=123", "Should decode header value")
  })

  await test("falls back to cookie if header missing", async () => {
    const r = createMockRequest({
      headersIn: { Cookie: "Cms-Auth-Values=fromCookie" },
    })
    assertEqual(gloco.readCmsAuthValues(r), "fromCookie", "Should return cookie value")
  })

  await test("header takes precedence over cookie", async () => {
    const r = createMockRequest({
      headersIn: {
        "Cms-Auth-Values": "fromHeader",
        Cookie: "Cms-Auth-Values=fromCookie",
      },
    })
    assertEqual(gloco.readCmsAuthValues(r), "fromHeader", "Should prefer header")
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
    assertEqual(gloco.readCorsOrigin(r), "http://localhost:3000", "Should return origin")
  })

  await test("returns empty string if not allowed", async () => {
    const r = createMockRequest({
      headersIn: { Origin: "https://evil.com" },
    })
    assertEqual(gloco.readCorsOrigin(r), "", "Should return empty string")
  })

  // --- handleSessionHint tests ---
  console.log("\nhandleSessionHint:")

  await test('returns "null" when no Cms-Session-Hint cookie present', async () => {
    const r = createMockRequest({})
    gloco.handleSessionHint(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assertEqual(r.returnBody, "null", 'Should return "null"')
  })

  await test("returns cookie value when Cms-Session-Hint cookie present", async () => {
    const hintValue = '{"cmsDomains":["foo.cps.gov.uk"],"isProxySession":false}'
    const r = createMockRequest({
      headersIn: { Cookie: `Cms-Session-Hint=${hintValue}` },
    })
    gloco.handleSessionHint(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assertEqual(r.returnBody, hintValue, "Should return cookie value")
  })

  await test("decodes URL-encoded Cms-Session-Hint cookie value", async () => {
    const hintValue = '{"cmsDomains":["foo.cps.gov.uk"],"isProxySession":true}'
    const encodedValue = encodeURIComponent(hintValue)
    const r = createMockRequest({
      headersIn: { Cookie: `Cms-Session-Hint=${encodedValue}` },
    })
    gloco.handleSessionHint(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assertEqual(r.returnBody, hintValue, "Should return decoded cookie value")
  })

  await test("extracts Cms-Session-Hint from multiple cookies", async () => {
    const hintValue = '{"cmsDomains":[],"isProxySession":false}'
    const r = createMockRequest({
      headersIn: {
        Cookie: `other=value; Cms-Session-Hint=${encodeURIComponent(hintValue)}; another=cookie`,
      },
    })
    gloco.handleSessionHint(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assertEqual(r.returnBody, hintValue, "Should extract correct cookie")
  })

  // --- handleState tests ---
  console.log("\nhandleState:")

  await test("GET on whitelisted key (preview) returns null without auth", async () => {
    const r = createMockRequest({
      method: "GET",
      uri: "/global-components/state/preview",
    })
    await gloco.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assertEqual(r.returnBody, "null", "Should return null")
    assertEqual(r.headersOut["Content-Type"], "application/json", "Should set Content-Type")
  })

  await test("GET on whitelisted key returns cookie value without auth", async () => {
    const stateValue = JSON.stringify({ foo: "bar" })
    const wrappedState = Buffer.from(stateValue)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
    const r = createMockRequest({
      method: "GET",
      uri: "/global-components/state/preview",
      headersIn: {
        Cookie: `cps-global-components-state=${wrappedState}`,
      },
    })
    await gloco.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assertEqual(r.returnBody, stateValue, "Should return unwrapped cookie value")
  })

  await test("GET on non-whitelisted key returns 200 when validation disabled", async () => {
    const r = createMockRequest({
      method: "GET",
      uri: "/global-components/state/other-key",
    })
    await gloco.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200 (validation disabled)")
  })

  await test("PUT succeeds without Authorization header when validation disabled", async () => {
    const stateValue = JSON.stringify({ count: 42 })
    const r = createMockRequest({
      method: "PUT",
      uri: "/global-components/state/my-key",
      requestText: stateValue,
    })
    await gloco.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200 (validation disabled)")
    const body = JSON.parse(r.returnBody!)
    assertEqual(body.success, true, "Should have success true")
  })

  await test("PUT sets cookie with body content", async () => {
    const stateValue = JSON.stringify({ count: 42 })
    const r = createMockRequest({
      method: "PUT",
      uri: "/global-components/state/my-key",
      requestText: stateValue,
    })
    await gloco.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    const body = JSON.parse(r.returnBody!)
    assertEqual(body.success, true, "Should have success true")
    assertEqual(body.path, "/global-components/state/my-key", "Should include path")
    const setCookie = r.headersOut["Set-Cookie"] as string
    assert(setCookie.includes("cps-global-components-state="), "Should set cookie")
    assert(setCookie.includes("Path=/global-components/state/my-key"), "Should set path")
    assert(setCookie.includes("Secure"), "Should have Secure flag")
    assert(setCookie.includes("SameSite=None"), "Should have SameSite=None")
  })

  await test("PUT with null body clears cookie", async () => {
    const r = createMockRequest({
      method: "PUT",
      uri: "/global-components/state/my-key",
      requestText: "null",
    })
    await gloco.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    const body = JSON.parse(r.returnBody!)
    assertEqual(body.success, true, "Should have success true")
    assertEqual(body.cleared, true, "Should have cleared true")
    const setCookie = r.headersOut["Set-Cookie"] as string
    assert(setCookie.includes("cps-global-components-state=;"), "Should set empty cookie value")
    assert(setCookie.includes("Expires=Thu, 01 Jan 1970"), "Should set cookie to expire in the past")
  })

  await test("PUT with empty body clears cookie", async () => {
    const r = createMockRequest({
      method: "PUT",
      uri: "/global-components/state/my-key",
      requestText: "",
    })
    await gloco.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    const body = JSON.parse(r.returnBody!)
    assertEqual(body.success, true, "Should have success true")
    assertEqual(body.cleared, true, "Should have cleared true")
    const setCookie = r.headersOut["Set-Cookie"] as string
    assert(setCookie.includes("Expires=Thu, 01 Jan 1970"), "Should set cookie to expire in the past")
  })

  await test("PUT with whitespace-only body clears cookie", async () => {
    const r = createMockRequest({
      method: "PUT",
      uri: "/global-components/state/my-key",
      requestText: "   \n  ",
    })
    await gloco.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    const body = JSON.parse(r.returnBody!)
    assertEqual(body.cleared, true, "Should have cleared true for whitespace body")
  })

  await test("PUT with valid JSON does not set cleared flag", async () => {
    const r = createMockRequest({
      method: "PUT",
      uri: "/global-components/state/my-key",
      requestText: JSON.stringify({ enabled: true }),
    })
    await gloco.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    const body = JSON.parse(r.returnBody!)
    assertEqual(body.success, true, "Should have success true")
    assertEqual(body.cleared, undefined, "Should not have cleared flag for valid data")
  })

  await test("returns 405 for unsupported methods", async () => {
    const r = createMockRequest({
      method: "DELETE",
      uri: "/global-components/state/my-key",
    })
    await gloco.handleState(r)
    assertEqual(r.returnCode, 405, "Should return 405")
    const body = JSON.parse(r.returnBody!)
    assertEqual(body.error, "Method not allowed", "Should have error message")
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
    console.error("Build/test failed:", (err as Error).message)
    process.exit(1)
  }
})()
