#!/usr/bin/env npx ts-node
/// <reference types="node" />
/**
 * Build and run unit tests for global-components.vnext.ts
 *
 * Uses esbuild to bundle the njs module, then runs the unit tests
 * against the bundled code. Environment values are passed via r.variables.
 */

import * as esbuild from "esbuild"
import * as path from "path"

// Use require for fs so we can mock readFileSync (ES module imports are immutable)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs") as typeof import("fs")
const originalReadFileSync = fs.readFileSync
const CONFIG_DIR = path.join(__dirname, "..", "..")
const DIST_DIR = path.join(__dirname, "..", "..", "..", ".dist")

// Ensure dist directory exists
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true })
}

interface CookieOptions {
  Path?: string
  Expires?: Date
  Secure?: boolean
  SameSite?: "Strict" | "Lax" | "None"
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
  warnMessages: string[]
  return(code: number, body: string): void
  sendBuffer(buffer: string, flags: Record<string, unknown>): void
  warn(msg: string): void
}

interface MockRequestOptions {
  method?: string
  uri?: string
  args?: Record<string, string>
  headersIn?: Record<string, string>
  variables?: Record<string, string>
  requestText?: string
}

interface GlocoVnextModule {
  handleState(r: MockRequest): Promise<void>
  handleValidateToken(r: MockRequest): Promise<void>
  handleStatus(r: MockRequest): void
  filterSwaggerBody(r: MockRequest, data: string, flags: Record<string, unknown>): void
  logRequest(r: MockRequest): void
  setCookie(r: MockRequest, name: string, value: string, options?: CookieOptions): void
}

// Bundle both modules
async function build(): Promise<void> {
  // Bundle base module first
  await esbuild.build({
    entryPoints: [path.join(CONFIG_DIR, "main", "global-components.ts")],
    bundle: true,
    outfile: path.join(DIST_DIR, "global-components.bundle.js"),
    format: "esm",
    platform: "node",
    logLevel: "error",
  })

  // Bundle vnext module
  await esbuild.build({
    entryPoints: [path.join(CONFIG_DIR, "global-components.vnext", "global-components.vnext.ts")],
    bundle: true,
    outfile: path.join(DIST_DIR, "global-components.vnext.bundle.js"),
    format: "esm",
    platform: "node",
    external: ["fs"],
    alias: {
      "templates/global-components.js": path.join(DIST_DIR, "global-components.bundle.js"),
    },
    logLevel: "error",
  })
}

// Run tests
async function runTests(): Promise<void> {
  const modulePath = path.join(DIST_DIR, "global-components.vnext.bundle.js")
  const module = await import(modulePath)
  const glocovnext: GlocoVnextModule = module.default

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

  // Default mock environment variables
  const defaultVariables = {
    wm_mds_base_url: "http://mock-upstream:3000/api/",
  }

  // Set AD_AUTH_ENDPOINT via process.env (same mechanism as njs code)
  process.env.AD_AUTH_ENDPOINT = "http://mock-upstream:3000/v1.0/me"

  // Hardcoded constants (must match the constants in global-components.vnext.ts)
  const TENANT_ID = "00dd0d1d-d7e6-4338-ac51-565339c7088c"
  const APPLICATION_ID = "8d6133af-9593-47c6-94d0-5c65e9e310f1"

  function createMockRequest(options: MockRequestOptions = {}): MockRequest {
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
      warnMessages: [],
      return(code: number, body: string) {
        this.returnCode = code
        this.returnBody = body
      },
      sendBuffer(buffer: string, flags: Record<string, unknown>) {
        this.sentBuffer = buffer
        this.sentFlags = flags
      },
      warn(msg: string) {
        this.warnMessages.push(msg)
      },
    }
  }

  // Mock ngx.fetch globally
  let mockFetchResponse: { status: number; ok: boolean; text?: () => Promise<string> } = {
    status: 200,
    ok: true,
    text: async () => "<html></html>",
  }
  let mockFetchError: Error | null = null
  ;(globalThis as Record<string, unknown>).ngx = {
    fetch: async () => {
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
    await glocovnext.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assertEqual(r.returnBody, stateValue, "Should return unwrapped cookie value")
  })

  await test("GET on any key returns 200 (no auth on state)", async () => {
    const r = createMockRequest({
      method: "GET",
      uri: "/global-components/state/other-key",
    })
    await glocovnext.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200")
  })

  await test("PUT succeeds without Authorization header", async () => {
    const stateValue = JSON.stringify({ count: 42 })
    const r = createMockRequest({
      method: "PUT",
      uri: "/global-components/state/my-key",
      requestText: stateValue,
    })
    await glocovnext.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200")
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
    await glocovnext.handleState(r)
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
    await glocovnext.handleState(r)
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
    await glocovnext.handleState(r)
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
    await glocovnext.handleState(r)
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
    await glocovnext.handleState(r)
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
    await glocovnext.handleState(r)
    assertEqual(r.returnCode, 405, "Should return 405")
    const body = JSON.parse(r.returnBody!)
    assertEqual(body.error, "Method not allowed", "Should have error message")
  })

  // --- handleValidateToken tests ---
  console.log("\nhandleValidateToken:")

  // Helper to create a mock JWT with valid claims
  function createMockJwt(claims: Record<string, unknown> = {}): string {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    const payload = Buffer.from(JSON.stringify({ tid: TENANT_ID, appid: APPLICATION_ID, ...claims })).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    return `${header}.${payload}.mock-signature`
  }

  await test("returns 200 with status no-token when no auth header", async () => {
    const r = createMockRequest({})
    await glocovnext.handleValidateToken(r)
    assertEqual(r.returnCode, 200, "Should return 200 (soft mode)")
    assertEqual(r.headersOut["X-Auth-Status"], "no-token", "Should set status to no-token")
  })

  await test("returns 200 with status malformed-token for bad token", async () => {
    const r = createMockRequest({
      headersIn: {
        Authorization: "Bearer any-token",
      },
    })
    await glocovnext.handleValidateToken(r)
    assertEqual(r.returnCode, 200, "Should return 200 (soft mode)")
    assertEqual(r.headersOut["X-Auth-Status"], "malformed-token", "Should set status to malformed-token")
  })

  await test("returns 200 with status invalid-claims-tid for wrong tenant ID", async () => {
    const token = createMockJwt({ tid: "wrong-tenant-id" })
    const r = createMockRequest({
      headersIn: { Authorization: `Bearer ${token}` },
    })
    await glocovnext.handleValidateToken(r)
    assertEqual(r.returnCode, 200, "Should return 200 (soft mode)")
    assert((r.headersOut["X-Auth-Status"] as string).startsWith("invalid-claims-tid"), "Should set status to invalid-claims-tid")
  })

  await test("returns 200 with status invalid-claims-appid for wrong app ID", async () => {
    const token = createMockJwt({ appid: "wrong-app-id" })
    const r = createMockRequest({
      headersIn: { Authorization: `Bearer ${token}` },
    })
    await glocovnext.handleValidateToken(r)
    assertEqual(r.returnCode, 200, "Should return 200 (soft mode)")
    assert((r.headersOut["X-Auth-Status"] as string).startsWith("invalid-claims-appid"), "Should set status to invalid-claims-appid")
  })

  await test("returns 200 with status ok when Graph API succeeds", async () => {
    mockFetchResponse = { status: 200, ok: true }
    const token = createMockJwt()
    const r = createMockRequest({
      headersIn: { Authorization: `Bearer ${token}` },
    })
    await glocovnext.handleValidateToken(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assertEqual(r.headersOut["X-Auth-Status"], "ok", "Should set status to ok")
  })

  await test("returns 200 with status graph-rejected when Graph API rejects", async () => {
    mockFetchResponse = { status: 401, ok: false }
    const token = createMockJwt()
    const r = createMockRequest({
      headersIn: { Authorization: `Bearer ${token}` },
    })
    await glocovnext.handleValidateToken(r)
    assertEqual(r.returnCode, 200, "Should return 200 (soft mode)")
    assertEqual(r.headersOut["X-Auth-Status"], "graph-rejected", "Should set status to graph-rejected")
  })

  await test("returns 200 with status graph-error when Graph API fetch fails", async () => {
    mockFetchError = new Error("Network error")
    const token = createMockJwt()
    const r = createMockRequest({
      headersIn: { Authorization: `Bearer ${token}` },
    })
    await glocovnext.handleValidateToken(r)
    assertEqual(r.returnCode, 200, "Should return 200 (soft mode)")
    assertEqual(r.headersOut["X-Auth-Status"], "graph-error", "Should set status to graph-error")
    mockFetchError = null
  })

  await test("sets X-Auth-Oid and X-Auth-Upn headers on valid claims", async () => {
    mockFetchResponse = { status: 200, ok: true }
    const token = createMockJwt({ oid: "user-oid-123", upn: "user@example.com" })
    const r = createMockRequest({
      headersIn: { Authorization: `Bearer ${token}` },
    })
    await glocovnext.handleValidateToken(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assertEqual(r.headersOut["X-Auth-Oid"], "user-oid-123", "Should set OID header")
    assertEqual(r.headersOut["X-Auth-Upn"], "user@example.com", "Should set UPN header")
  })

  // --- handleStatus tests ---
  console.log("\nhandleStatus:")

  await test("returns JSON with status and version from deployment file", async () => {
    // Mock fs.readFileSync to return deployment JSON
    fs.readFileSync = ((filePath: string, encoding: BufferEncoding) => {
      if (filePath === "/etc/nginx/templates/global-components-deployment.json") {
        return JSON.stringify({ version: 42 })
      }
      return originalReadFileSync(filePath, encoding)
    }) as typeof fs.readFileSync

    const r = createMockRequest({})
    glocovnext.handleStatus(r)

    fs.readFileSync = originalReadFileSync // Restore

    assertEqual(r.returnCode, 200, "Should return 200")
    assertEqual(r.headersOut["Content-Type"], "application/json", "Should be JSON")
    const body = JSON.parse(r.returnBody!)
    assertEqual(body.status, "online", "Should have status online")
    assertEqual(body.version, 42, "Should have version from deployment file")
  })

  await test("returns version 0 when deployment file does not exist", async () => {
    // Mock fs.readFileSync to throw (file not found)
    fs.readFileSync = ((filePath: string, encoding: BufferEncoding) => {
      if (filePath === "/etc/nginx/templates/global-components-deployment.json") {
        throw new Error("ENOENT: no such file or directory")
      }
      return originalReadFileSync(filePath, encoding)
    }) as typeof fs.readFileSync

    const r = createMockRequest({})
    glocovnext.handleStatus(r)

    fs.readFileSync = originalReadFileSync // Restore

    assertEqual(r.returnCode, 200, "Should return 200")
    const body = JSON.parse(r.returnBody!)
    assertEqual(body.status, "online", "Should have status online")
    assertEqual(body.version, 0, "Should return version 0 when file missing")
  })

  // --- setCookie tests ---
  console.log("\nsetCookie:")

  await test("sets basic cookie with name and value", async () => {
    const r = createMockRequest({})
    glocovnext.setCookie(r, "session", "abc123")
    assertEqual(r.headersOut["Set-Cookie"], "session=abc123", "Should set basic name=value cookie")
  })

  await test("sets cookie with Path option", async () => {
    const r = createMockRequest({})
    glocovnext.setCookie(r, "session", "abc123", { Path: "/api" })
    assertEqual(r.headersOut["Set-Cookie"], "session=abc123; Path=/api", "Should include Path attribute")
  })

  await test("sets cookie with Expires option as UTC string", async () => {
    const r = createMockRequest({})
    const expires = new Date("2025-12-31T23:59:59.000Z")
    glocovnext.setCookie(r, "session", "abc123", { Expires: expires })
    assertEqual(
      r.headersOut["Set-Cookie"],
      "session=abc123; Expires=Wed, 31 Dec 2025 23:59:59 GMT",
      "Should include Expires in RFC 7231 format"
    )
  })

  await test("sets cookie with Secure flag", async () => {
    const r = createMockRequest({})
    glocovnext.setCookie(r, "session", "abc123", { Secure: true })
    assertEqual(r.headersOut["Set-Cookie"], "session=abc123; Secure", "Should include Secure flag")
  })

  await test("does not include Secure flag when false", async () => {
    const r = createMockRequest({})
    glocovnext.setCookie(r, "session", "abc123", { Secure: false })
    assertEqual(r.headersOut["Set-Cookie"], "session=abc123", "Should not include Secure flag when false")
  })

  await test("sets cookie with SameSite=Strict", async () => {
    const r = createMockRequest({})
    glocovnext.setCookie(r, "session", "abc123", { SameSite: "Strict" })
    assertEqual(
      r.headersOut["Set-Cookie"],
      "session=abc123; SameSite=Strict",
      "Should include SameSite=Strict"
    )
  })

  await test("sets cookie with SameSite=Lax", async () => {
    const r = createMockRequest({})
    glocovnext.setCookie(r, "session", "abc123", { SameSite: "Lax" })
    assertEqual(r.headersOut["Set-Cookie"], "session=abc123; SameSite=Lax", "Should include SameSite=Lax")
  })

  await test("sets cookie with SameSite=None", async () => {
    const r = createMockRequest({})
    glocovnext.setCookie(r, "session", "abc123", { SameSite: "None" })
    assertEqual(r.headersOut["Set-Cookie"], "session=abc123; SameSite=None", "Should include SameSite=None")
  })

  await test("sets cookie with all options in correct order", async () => {
    const r = createMockRequest({})
    const expires = new Date("2025-06-15T12:00:00.000Z")
    glocovnext.setCookie(r, "auth", "token123", {
      Path: "/secure",
      Expires: expires,
      Secure: true,
      SameSite: "None",
    })
    assertEqual(
      r.headersOut["Set-Cookie"],
      "auth=token123; Path=/secure; Expires=Sun, 15 Jun 2025 12:00:00 GMT; Secure; SameSite=None",
      "Should include all attributes in order"
    )
  })

  await test("handles empty options object", async () => {
    const r = createMockRequest({})
    glocovnext.setCookie(r, "test", "value", {})
    assertEqual(r.headersOut["Set-Cookie"], "test=value", "Should set basic cookie with empty options")
  })

  await test("handles undefined options", async () => {
    const r = createMockRequest({})
    glocovnext.setCookie(r, "test", "value", undefined)
    assertEqual(r.headersOut["Set-Cookie"], "test=value", "Should set basic cookie with undefined options")
  })

  await test("allows multiple cookies to be set", async () => {
    const r = createMockRequest({})
    glocovnext.setCookie(r, "session", "abc123", { Path: "/" })
    glocovnext.setCookie(r, "theme", "dark", { Path: "/" })
    glocovnext.setCookie(r, "lang", "en", { Path: "/" })
    const cookies = r.headersOut["Set-Cookie"] as string[]
    assertEqual(cookies.length, 3, "Should have 3 cookies")
    assertEqual(cookies[0], "session=abc123; Path=/", "First cookie should be session")
    assertEqual(cookies[1], "theme=dark; Path=/", "Second cookie should be theme")
    assertEqual(cookies[2], "lang=en; Path=/", "Third cookie should be lang")
  })

  // --- logRequest tests ---
  console.log("\nlogRequest:")

  await test("extracts oid/upn/auth_status directly from token", async () => {
    const token = createMockJwt({ oid: "user-oid-123", upn: "user@example.com" })
    const r = createMockRequest({
      headersIn: { Authorization: `Bearer ${token}` },
      variables: {
        ...defaultVariables,
        http_x_forwarded_for: "10.0.0.1",
        http_referer: "https://example.com/page",
        request: "GET /global-components/api/cases/123/summary HTTP/1.1",
        status: "200",
        request_length: "256",
        request_time: "0.042",
        body_bytes_sent: "1024",
        upstream_response_time: "0.038",
        upstream_connect_time: "0.002",
        upstream_status: "200",
      },
    })
    glocovnext.logRequest(r)
    assertEqual(r.warnMessages.length, 1, "Should have one warn message")
    const log = JSON.parse(r.warnMessages[0])
    assertEqual(log.tag, "GLOBAL-COMPONENTS", "Should have tag")
    assertEqual(log.x_forwarded_for, "10.0.0.1", "Should have x_forwarded_for")
    assertEqual(log.referer, "https://example.com/page", "Should have referer")
    assertEqual(log.status, 200, "Should have numeric status")
    assertEqual(log.oid, "user-oid-123", "Should have oid from token")
    assertEqual(log.upn, "user@example.com", "Should have upn from token")
    assertEqual(log.upstream_status, "200", "Should have upstream_status")
    assertEqual(log.auth_status, "ok", "Should have auth_status ok")
  })

  await test("logs invalid-claims for wrong tenant but still extracts oid/upn", async () => {
    const token = createMockJwt({ tid: "wrong-tenant", oid: "user-oid-456", upn: "wrong@example.com" })
    const r = createMockRequest({
      headersIn: { Authorization: `Bearer ${token}` },
    })
    glocovnext.logRequest(r)
    assertEqual(r.warnMessages.length, 1, "Should have one warn message")
    const log = JSON.parse(r.warnMessages[0])
    assertEqual(log.oid, "user-oid-456", "Should still extract oid from token for debugging")
    assertEqual(log.upn, "wrong@example.com", "Should still extract upn from token for debugging")
    assert(log.auth_status.startsWith("invalid-claims-tid"), "Should have invalid-claims-tid status")
  })

  await test("logs no-token when no Authorization header", async () => {
    const r = createMockRequest({})
    glocovnext.logRequest(r)
    assertEqual(r.warnMessages.length, 1, "Should have one warn message")
    const log = JSON.parse(r.warnMessages[0])
    assertEqual(log.tag, "GLOBAL-COMPONENTS", "Should have tag")
    assertEqual(log.oid, "-", "Should have dash for missing oid")
    assertEqual(log.upn, "-", "Should have dash for missing upn")
    assertEqual(log.auth_status, "no-token", "Should have no-token status")
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
      r.sentBuffer!.includes("https://proxy.example.com/global-components"),
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
      r.sentBuffer!.includes("https://proxy.example.com/global-components"),
      `Should replace upstream URL without trailing slash, got: ${r.sentBuffer}`
    )
    assert(
      !r.sentBuffer!.includes("mock-upstream"),
      `Should not contain original URL, got: ${r.sentBuffer}`
    )
  })

  await test("rewrites API paths", async () => {
    const r = createMockRequest({
      headersIn: { Host: "proxy.example.com" },
    })
    const data = '{"path": "/api/users"}'
    glocovnext.filterSwaggerBody(r, data, {})
    assert(
      r.sentBuffer!.includes('"/global-components/users"'),
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
    console.error("Build/test failed:", (err as Error).message)
    process.exit(1)
  }
})()
