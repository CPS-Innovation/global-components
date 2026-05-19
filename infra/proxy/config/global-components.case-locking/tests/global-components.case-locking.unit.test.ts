#!/usr/bin/env npx ts-node
/**
 * Build and run unit tests for global-components.case-locking.ts
 *
 * Uses esbuild to bundle the njs module, then runs the unit tests
 * against the bundled code.
 */

import * as esbuild from "esbuild"
import * as path from "path"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs") as typeof import("fs")
const CONFIG_DIR = path.join(__dirname, "..", "..")
const DIST_DIR = path.join(__dirname, "..", "..", "..", ".dist")

if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true })
}

interface MockRequest {
  uri: string
  headersIn: Record<string, string | undefined>
  headersOut: Record<string, string | undefined>
  variables: Record<string, string>
  sentBuffer: string | null
  sentFlags: Record<string, unknown> | null
  sendBuffer(buffer: string, flags: Record<string, unknown>): void
}

interface CaseLockingModule {
  dropContentLengthForNegotiate(r: MockRequest): void
  filterNegotiateBody(r: MockRequest, data: string, flags: Record<string, unknown>): void
}

async function build(): Promise<void> {
  await esbuild.build({
    entryPoints: [path.join(CONFIG_DIR, "global-components.case-locking", "global-components.case-locking.ts")],
    bundle: true,
    outfile: path.join(DIST_DIR, "global-components.case-locking.bundle.js"),
    format: "esm",
    platform: "node",
    logLevel: "error",
  })
}

async function runTests(): Promise<void> {
  const modulePath = path.join(DIST_DIR, "global-components.case-locking.bundle.js")
  const module = await import(modulePath)
  const caseLocking: CaseLockingModule = module.default

  let passed = 0
  let failed = 0

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

  function createMockRequest(
    uri: string,
    opts: {
      headersIn?: Record<string, string>
      headersOut?: Record<string, string>
      variables?: Record<string, string>
    } = {}
  ): MockRequest {
    return {
      uri,
      headersIn: { Host: "proxy.example.com", ...(opts.headersIn ?? {}) },
      headersOut: { ...(opts.headersOut ?? {}) },
      variables: { scheme: "https", host: "proxy.example.com", ...(opts.variables ?? {}) },
      sentBuffer: null,
      sentFlags: null,
      sendBuffer(buffer: string, flags: Record<string, unknown>) {
        this.sentBuffer = buffer
        this.sentFlags = flags
      },
    }
  }

  console.log("=".repeat(60))
  console.log("global-components.case-locking.js Unit Tests")
  console.log("=".repeat(60))

  console.log("\ndropContentLengthForNegotiate:")

  await test("strips Content-Length on negotiate responses", async () => {
    const r = createMockRequest("/global-components/case-locking/api/section-view/negotiate", {
      headersOut: { "Content-Length": "601" },
    })
    caseLocking.dropContentLengthForNegotiate(r)
    assertEqual(r.headersOut["Content-Length"], undefined, "Content-Length should be removed")
  })

  await test("leaves Content-Length alone on non-negotiate responses", async () => {
    const r = createMockRequest("/global-components/case-locking/api/section-view", {
      headersOut: { "Content-Length": "100" },
    })
    caseLocking.dropContentLengthForNegotiate(r)
    assertEqual(r.headersOut["Content-Length"], "100", "Content-Length should be preserved")
  })

  console.log("\nfilterNegotiateBody:")

  await test("rewrites SignalR Service URL on negotiate response", async () => {
    const r = createMockRequest("/global-components/case-locking/api/section-view/negotiate")
    const negotiateBody = JSON.stringify({
      url: "https://sr-cms-presence.service.signalr.net/client/?hub=sectionsessionhub&asrs.op=%2Fsection-view",
      accessToken: "the-token",
    })
    caseLocking.filterNegotiateBody(r, negotiateBody, { last: true })
    const out = JSON.parse(r.sentBuffer!)
    assertEqual(
      out.url,
      "https://proxy.example.com/global-components/case-locking/api/sr/client/?hub=sectionsessionhub&asrs.op=%2Fsection-view",
      "Should rewrite url to absolute same-origin URL"
    )
    assertEqual(out.accessToken, "the-token", "Should preserve accessToken untouched")
  })

  await test("uses X-Forwarded-Proto for scheme when present", async () => {
    const r = createMockRequest("/global-components/case-locking/api/section-view/negotiate", {
      headersIn: { Host: "proxy.example.com", "X-Forwarded-Proto": "https" },
      variables: { scheme: "http", host: "proxy.example.com" },
    })
    const negotiateBody = JSON.stringify({
      url: "https://sr-cms-presence.service.signalr.net/client/?hub=h",
    })
    caseLocking.filterNegotiateBody(r, negotiateBody, { last: true })
    const out = JSON.parse(r.sentBuffer!)
    assertEqual(
      out.url,
      "https://proxy.example.com/global-components/case-locking/api/sr/client/?hub=h",
      "Should use X-Forwarded-Proto over r.variables.scheme"
    )
  })

  await test("leaves non-SignalR-Service negotiate URLs alone", async () => {
    const r = createMockRequest("/global-components/case-locking/api/section-view/negotiate")
    const negotiateBody = JSON.stringify({
      url: "https://something-else.example.com/client/?hub=foo",
      accessToken: "x",
    })
    caseLocking.filterNegotiateBody(r, negotiateBody, { last: true })
    const out = JSON.parse(r.sentBuffer!)
    assertEqual(
      out.url,
      "https://something-else.example.com/client/?hub=foo",
      "Non-SignalR-Service URL should pass through unchanged"
    )
  })

  await test("passes non-negotiate URIs straight through", async () => {
    const r = createMockRequest("/global-components/case-locking/api/section-view")
    const body = '{"some":"payload"}'
    caseLocking.filterNegotiateBody(r, body, { last: true })
    assertEqual(r.sentBuffer, body, "Should pass body through unchanged")
  })

  await test("emits each chunk after replacement (no buffering)", async () => {
    const r = createMockRequest("/global-components/case-locking/api/section-view/negotiate")
    const chunk = '{"url":"https://sr-cms-presence.service.signalr.net/client/?hub=h"'
    caseLocking.filterNegotiateBody(r, chunk, { last: false })
    assertEqual(
      r.sentBuffer,
      '{"url":"https://proxy.example.com/global-components/case-locking/api/sr/client/?hub=h"',
      "Should emit rewritten chunk immediately, not buffer"
    )
  })

  await test("passes through bytes that don't contain a SignalR Service URL", async () => {
    const r = createMockRequest("/global-components/case-locking/api/section-view/negotiate")
    const body = "not json at all"
    caseLocking.filterNegotiateBody(r, body, { last: true })
    assertEqual(r.sentBuffer, body, "Should emit body unchanged when no URL to rewrite")
  })

  console.log("\n" + "=".repeat(60))
  console.log(`Results: ${passed} passed, ${failed} failed`)
  console.log("=".repeat(60))

  process.exit(failed > 0 ? 1 : 0)
}

;(async () => {
  try {
    await build()
    await runTests()
  } catch (err) {
    console.error("Build/test failed:", (err as Error).message)
    process.exit(1)
  }
})()
