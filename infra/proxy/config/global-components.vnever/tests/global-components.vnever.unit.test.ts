#!/usr/bin/env npx ts-node
/**
 * Build and run unit tests for global-components.vnever.ts
 *
 * Uses esbuild to bundle the njs module, then runs the unit tests
 * against the bundled code.
 */

import * as esbuild from "esbuild"
import * as path from "path"
import * as fs from "fs"

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
  headersOut: Record<string, string>
  variables: Record<string, string>
  returnCode: number | null
  returnBody: string | null
  return(code: number, body: string): void
}

interface MockRequestOptions {
  method?: string
  uri?: string
  args?: Record<string, string>
  headersIn?: Record<string, string>
  variables?: Record<string, string>
}

interface GlocoVneverModule {
  handleHealthCheck(r: MockRequest): Promise<void>
}

interface MockFetchResponse {
  status: number
  ok?: boolean
}

// Bundle the module
async function build(): Promise<void> {
  await esbuild.build({
    entryPoints: [
      path.join(
        CONFIG_DIR,
        "global-components.vnever",
        "global-components.vnever.ts"
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
async function runTests(): Promise<void> {
  const modulePath = path.join(DIST_DIR, "global-components.vnever.bundle.js")
  const module = await import(modulePath)
  const glocovnever: GlocoVneverModule = module.default

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
      return(code: number, body: string) {
        this.returnCode = code
        this.returnBody = body
      },
    }
  }

  // Mock ngx.fetch globally
  let mockFetchResponse: MockFetchResponse = { status: 200, ok: true }
  let mockFetchError: Error | null = null
  ;(globalThis as Record<string, unknown>).ngx = {
    fetch: async (_url: string, _options?: Record<string, unknown>): Promise<MockFetchResponse> => {
      if (mockFetchError) throw mockFetchError
      return mockFetchResponse
    },
  }

  console.log("=".repeat(60))
  console.log("global-components.vnever.ts Unit Tests")
  console.log("=".repeat(60))

  // --- handleHealthCheck tests ---
  console.log("\nhandleHealthCheck:")

  await test("returns 400 if url parameter missing", async () => {
    const r = createMockRequest({ args: {} })
    await glocovnever.handleHealthCheck(r)
    assertEqual(r.returnCode, 400, "Should return 400")
    assert(
      r.returnBody!.includes("url parameter required"),
      "Should have error message"
    )
  })

  await test("returns 403 if url not in whitelist", async () => {
    const r = createMockRequest({ args: { url: "http://evil.com" } })
    await glocovnever.handleHealthCheck(r)
    assertEqual(r.returnCode, 403, "Should return 403")
    assert(
      r.returnBody!.includes("url not in whitelist"),
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
    const body = JSON.parse(r.returnBody!)
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
    const body = JSON.parse(r.returnBody!)
    assertEqual(body.healthy, false, "Should not be healthy")
    assertEqual(body.status, 500, "Should have status 500")
  })

  await test("returns healthy false on fetch error", async () => {
    mockFetchError = new Error("Connection refused")
    const r = createMockRequest({
      args: { url: "https://polaris.cps.gov.uk/polaris" },
    })
    await glocovnever.handleHealthCheck(r)
    const body = JSON.parse(r.returnBody!)
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
    console.error("Build/test failed:", (err as Error).message)
    process.exit(1)
  }
})()
