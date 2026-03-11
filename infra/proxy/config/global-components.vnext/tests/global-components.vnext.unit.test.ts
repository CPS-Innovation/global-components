#!/usr/bin/env npx ts-node
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

interface GlocoVnextModule {
  handleValidateToken(r: MockRequest): Promise<void>
  handleStatus(r: MockRequest): void
  filterSwaggerBody(r: MockRequest, data: string, flags: Record<string, unknown>): void
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

  // Set env var that was previously passed via js_var
  process.env["GLOBAL_COMPONENTS_APPLICATION_ID"] = "test-app-id"

  // Hardcoded tenant ID (must match the constant in global-components.vnext.ts)
  const TENANT_ID = "00dd0d1d-d7e6-6338-ac51-565339c7088c"

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
