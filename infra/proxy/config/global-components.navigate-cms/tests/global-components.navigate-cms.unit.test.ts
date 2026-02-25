#!/usr/bin/env npx ts-node
/**
 * Build and run unit tests for global-components.navigate-cms.ts
 *
 * Uses esbuild to bundle the njs module, then runs the unit tests
 * against the bundled code.
 */

import * as esbuild from "esbuild"
import * as path from "path"
import * as fs from "fs"

const CONFIG_DIR = path.join(__dirname, "..", "..")
const DIST_DIR = path.join(__dirname, "..", "..", "..", ".dist")

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
  args?: Record<string, string>
  headersIn?: Record<string, string>
  variables?: Record<string, string>
}

interface NavigateCmsModule {
  handleNavigateCms(r: MockRequest): void
}

async function build(): Promise<void> {
  await esbuild.build({
    entryPoints: [path.join(CONFIG_DIR, "global-components.navigate-cms", "global-components.navigate-cms.ts")],
    bundle: true,
    outfile: path.join(DIST_DIR, "global-components.navigate-cms.bundle.js"),
    format: "esm",
    platform: "node",
    logLevel: "error",
  })
}

async function runTests(): Promise<void> {
  const modulePath = path.join(DIST_DIR, "global-components.navigate-cms.bundle.js")
  const module = await import(modulePath)
  const glococms: NavigateCmsModule = module.default

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

  async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
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

  const SESSION_HINT_COOKIE = "Cms-Session-Hint=" + encodeURIComponent(JSON.stringify({
    cmsDomains: ["foo.cps.gov.uk"],
    isProxySession: false,
    handoverEndpoint: "https://foo.cps.gov.uk/polaris",
  }))

  function createMockRequest(options: MockRequestOptions = {}): MockRequest {
    return {
      method: "GET",
      uri: "/global-components/navigate-cms",
      args: options.args || {},
      headersIn: {
        "X-Forwarded-Proto": "https",
        "Host": "localhost:8080",
        ...options.headersIn,
      },
      headersOut: {},
      variables: { ieaction: "", ...options.variables },
      returnCode: null,
      returnBody: null,
      return(code: number, body: string) {
        this.returnCode = code
        this.returnBody = body
      },
    }
  }

  console.log("=".repeat(60))
  console.log("global-components.navigate-cms.js Unit Tests")
  console.log("=".repeat(60))

  // --- OPEN PHASE ---
  console.log("\nOpen phase:")

  await test("non-IE + configurable: extracts domain from cookie and passes as cmsDomain query param", () => {
    const r = createMockRequest({
      args: { caseId: "123" },
      variables: { ieaction: "nonie+configurable+", args: "caseId=123" },
      headersIn: { Cookie: SESSION_HINT_COOKIE },
    })
    glococms.handleNavigateCms(r)
    assertEqual(r.returnCode, 302, "Should return 302")
    assertEqual(r.headersOut["X-InternetExplorerMode"], "1", "Should set IE mode header")
    assert(
      r.returnBody!.includes("caseId=123"),
      `Should preserve original args, got: ${r.returnBody}`
    )
    assert(
      r.returnBody!.includes("cmsDomain="),
      `Should include cmsDomain in redirect, got: ${r.returnBody}`
    )
    assert(
      r.returnBody!.includes("foo.cps.gov.uk"),
      `cmsDomain should contain extracted domain, got: ${r.returnBody}`
    )
  })

  await test("non-IE + configurable without cookie: returns 400", () => {
    const r = createMockRequest({
      args: { caseId: "123" },
      variables: { ieaction: "nonie+configurable+", args: "caseId=123" },
      headersIn: {},
    })
    glococms.handleNavigateCms(r)
    assertEqual(r.returnCode, 400, "Should return 400")
    assert(
      r.returnBody!.includes("could not determine CMS domain"),
      `Should contain error message, got: ${r.returnBody}`
    )
  })

  await test("IE + configurable (case): reads cmsDomain from query param and serves iframe", () => {
    const r = createMockRequest({
      args: { caseId: "123", cmsDomain: "foo.cps.gov.uk" },
      variables: { ieaction: "ie+configurable+" },
    })
    glococms.handleNavigateCms(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assert(r.returnBody!.includes("iframe"), `Should contain iframe, got: ${r.returnBody}`)
    assert(
      r.returnBody!.includes("action=navigate&screen=case_details&wId=MASTER&caseId=123"),
      `Should contain navigate action with caseId, got: ${r.returnBody}`
    )
    assert(
      r.returnBody!.includes("foo.cps.gov.uk"),
      `Should use domain from cmsDomain arg, got: ${r.returnBody}`
    )
    assert(
      r.returnBody!.includes("Opening case in CMS"),
      `Should have case heading, got: ${r.returnBody}`
    )
    assert(
      r.returnBody!.includes("do not close this window"),
      `Should have inset text, got: ${r.returnBody}`
    )
  })

  await test("IE + configurable (task): reads cmsDomain from query param and serves iframe with task heading", () => {
    const r = createMockRequest({
      args: { caseId: "123", taskId: "456", cmsDomain: "foo.cps.gov.uk" },
      variables: { ieaction: "ie+configurable+" },
    })
    glococms.handleNavigateCms(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assert(
      r.returnBody!.includes("action=activate_task&screen=case_details&wId=MASTER&taskId=456&caseId=123"),
      `Should contain activate_task action with taskId and caseId, got: ${r.returnBody}`
    )
    assert(
      r.returnBody!.includes("Opening task in CMS"),
      `Should have task heading, got: ${r.returnBody}`
    )
  })

  await test("IE + configurable without cmsDomain or cookie: returns 400", () => {
    const r = createMockRequest({
      args: { caseId: "123" },
      variables: { ieaction: "ie+configurable+" },
      headersIn: {},
    })
    glococms.handleNavigateCms(r)
    assertEqual(r.returnCode, 400, "Should return 400")
    assert(
      r.returnBody!.includes("could not determine CMS domain"),
      `Should contain error message, got: ${r.returnBody}`
    )
  })

  await test("non-configurable: serves iframe page directly (no redirect)", () => {
    const r = createMockRequest({
      args: { caseId: "123" },
      variables: { ieaction: "nonie+nonconfigurable+" },
      headersIn: { Cookie: SESSION_HINT_COOKIE },
    })
    glococms.handleNavigateCms(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assert(r.returnBody!.includes("iframe"), `Should contain iframe, got: ${r.returnBody}`)
    assert(
      r.returnBody!.includes("action=navigate&screen=case_details&wId=MASTER&caseId=123"),
      `Should contain navigate action, got: ${r.returnBody}`
    )
  })

  // --- CLOSE PHASE ---
  console.log("\nClose phase:")

  await test("IE + configurable: redirects to self with IE mode off", () => {
    const r = createMockRequest({
      args: { step: "close" },
      variables: { ieaction: "ie+configurable+" },
    })
    glococms.handleNavigateCms(r)
    assertEqual(r.returnCode, 302, "Should return 302")
    assertEqual(r.headersOut["X-InternetExplorerMode"], "0", "Should set IE mode to 0")
    assert(
      r.returnBody!.includes("/global-components/navigate-cms?step=close"),
      `Should redirect to self with step=close, got: ${r.returnBody}`
    )
  })

  await test("non-IE (Edge): serves window.close script", () => {
    const r = createMockRequest({
      args: { step: "close" },
      variables: { ieaction: "nonie+configurable+" },
    })
    glococms.handleNavigateCms(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assert(
      r.returnBody!.includes("window.close()"),
      `Should contain window.close(), got: ${r.returnBody}`
    )
  })

  await test("close with non-configurable: serves window.close script", () => {
    const r = createMockRequest({
      args: { step: "close" },
      variables: { ieaction: "nonie+nonconfigurable+" },
    })
    glococms.handleNavigateCms(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assert(
      r.returnBody!.includes("window.close()"),
      `Should contain window.close(), got: ${r.returnBody}`
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
