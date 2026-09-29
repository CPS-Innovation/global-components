#!/usr/bin/env npx ts-node
/**
 * Unit tests for global-components.multi-os-domain-testing.ts
 *
 * Uses esbuild to bundle the njs module, then runs the tests against the bundle.
 */

import * as esbuild from "esbuild"
import * as path from "path"
import * as fs from "fs"

const CONFIG_DIR = path.join(__dirname, "..", "..")
const MODULE_DIR = path.join(CONFIG_DIR, "global-components.multi-os-domain-testing")
const REPO_CONFIGURATION_DIR = path.join(CONFIG_DIR, "..", "..", "..", "configuration")
const DIST_DIR = path.join(CONFIG_DIR, "..", ".dist")

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
  return(code: number, body: string): void
}

interface MockRequestOptions {
  method?: string
  uri?: string
  args?: Record<string, string>
  headersIn?: Record<string, string>
  variables?: Record<string, string>
}

interface MultiOsModule {
  readConfigBlobName(r: MockRequest): string
  launchTarget(r: MockRequest): string
  handleStatus(r: MockRequest): void
  handleSet(r: MockRequest): void
  OS_HOST_VARIANTS: Record<string, Record<string, string>>
  POLARIS_HOSTS: Record<string, string>
  LAUNCH_ROUTES: Record<string, string>
}

async function build(): Promise<void> {
  await esbuild.build({
    entryPoints: [path.join(MODULE_DIR, "global-components.multi-os-domain-testing.ts")],
    bundle: true,
    outfile: path.join(DIST_DIR, "global-components.multi-os-domain-testing.bundle.js"),
    format: "esm",
    platform: "node",
    logLevel: "error",
  })
}

async function runTests(): Promise<void> {
  const module = await import(path.join(DIST_DIR, "global-components.multi-os-domain-testing.bundle.js"))
  const multiOs: MultiOsModule = module.default

  let passed = 0
  let failed = 0

  function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message)
  }

  function assertEqual(actual: unknown, expected: unknown, message: string): void {
    if (actual !== expected) {
      throw new Error(`${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`)
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
      uri: options.uri || "/",
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

  const OAPPS = "oapps-qa-notprod.int.cps.gov.uk"
  const LONDON = "cpslon-tst.outsystemsenterprise.com"
  const SIGNAL = `Gloco-Os-Target-test=${OAPPS}`

  console.log("=".repeat(60))
  console.log("global-components.multi-os-domain-testing.js Unit Tests")
  console.log("=".repeat(60))

  // --- config.json selection ---
  console.log("\nreadConfigBlobName:")

  const configRequest = (headersIn: Record<string, string>, env = "test") =>
    createMockRequest({
      uri: "/global-components/__config",
      headersIn: { Host: "polaris-qa-notprod.cps.gov.uk", ...headersIn },
      variables: { gloco_config_env: env },
    })

  await test("serves config.json when there is no signal", async () => {
    assertEqual(multiOs.readConfigBlobName(configRequest({})), "config.json", "blob")
  })

  await test("serves the variant the signal cookie names (CWA, same-origin)", async () => {
    assertEqual(multiOs.readConfigBlobName(configRequest({ Cookie: `other=1; ${SIGNAL}` })), "config.oapps.json", "blob")
  })

  await test("treats an Origin of our own host as same-origin, so the cookie still decides", async () => {
    const r = configRequest({ Origin: "https://polaris-qa-notprod.cps.gov.uk", Cookie: SIGNAL })
    assertEqual(multiOs.readConfigBlobName(r), "config.oapps.json", "blob")
  })

  await test("serves the variant for the OS page's own host, whatever the cookie says", async () => {
    assertEqual(multiOs.readConfigBlobName(configRequest({ Origin: `https://${LONDON}`, Cookie: SIGNAL })), "config.cps-lon.json", "blob")
  })

  // Config has to match the page it runs on: auth state is per-origin.
  await test("serves config.json to the environment's own OS host even when switched", async () => {
    const r = configRequest({ Origin: "https://cps-tst.outsystemsenterprise.com", Cookie: SIGNAL })
    assertEqual(multiOs.readConfigBlobName(r), "config.json", "blob")
  })

  await test("ignores a signal for another environment", async () => {
    assertEqual(multiOs.readConfigBlobName(configRequest({ Cookie: SIGNAL }, "dev")), "config.json", "blob")
  })

  await test("ignores a signal naming a host with no variant", async () => {
    assertEqual(multiOs.readConfigBlobName(configRequest({ Cookie: "Gloco-Os-Target-test=evil.example.com" })), "config.json", "blob")
  })

  // --- C-button ---
  console.log("\nlaunchTarget:")

  // Polaris's own hard-coded target for a route, from the reference copy of their nginx config.
  const polarisTarget = (route: string): string => {
    const conf = fs.readFileSync(path.join(CONFIG_DIR, "main", "nginx-full.conf"), "utf8")
    const match = conf.match(new RegExp(`location /launch/${route} \\{\\s*return 302 ([^;]+);`))
    if (!match) throw new Error(`no Polaris location for /launch/${route}`)
    return match[1]!
  }

  const launchRequest = (route: string, cookie?: string) =>
    createMockRequest({ uri: `/launch/${route}`, headersIn: cookie ? { Cookie: cookie } : {} })

  await test("hands back (empty) when there is no signal", async () => {
    assertEqual(multiOs.launchTarget(launchRequest("cin3-proxy")), "", "target")
  })

  // Same shape and encoding as Polaris's own target — only the OS host differs.
  await test("builds Polaris's own target with the OS host swapped, for every overridden route", async () => {
    for (const [route, host] of [["cin2-proxy", OAPPS], ["cin3-proxy", OAPPS], ["cin4-proxy", LONDON], ["cin5-proxy", LONDON]]) {
      const expected = polarisTarget(route!).split("cps-tst.outsystemsenterprise.com").join(host!)
      assertEqual(multiOs.launchTarget(launchRequest(route!, `Gloco-Os-Target-test=${host}`)), expected, route!)
    }
  })

  await test("hands back for a signal naming a host with no variant", async () => {
    assertEqual(multiOs.launchTarget(launchRequest("cin3-proxy", "Gloco-Os-Target-test=evil.example.com")), "", "target")
  })

  await test("hands back for another environment's signal", async () => {
    assertEqual(multiOs.launchTarget(launchRequest("cin3-proxy", `Gloco-Os-Target-dev=${OAPPS}`)), "", "target")
  })

  await test("never touches routes it doesn't override (raw CMS, prod)", async () => {
    for (const route of ["cin3", "cms-proxy", "cin3-proxy/"]) {
      assertEqual(multiOs.launchTarget(launchRequest(route, SIGNAL)), "", route)
    }
  })

  // --- status ---
  console.log("\nhandleStatus:")

  await test("GET lists the environment's variants and the current signal", async () => {
    const r = createMockRequest({ uri: "/global-components/multi-os/target/test", headersIn: { Cookie: SIGNAL } })
    multiOs.handleStatus(r)
    assertEqual(r.returnCode, 200, "status")
    assertEqual(
      r.returnBody,
      JSON.stringify({ current: OAPPS, options: [{ variant: "oapps", host: OAPPS }, { variant: "cps-lon", host: LONDON }] }),
      "body",
    )
  })

  await test("GET reports no signal for a stale host", async () => {
    const r = createMockRequest({ uri: "/global-components/multi-os/target/test", headersIn: { Cookie: "Gloco-Os-Target-test=gone.example.com" } })
    multiOs.handleStatus(r)
    assertEqual(JSON.parse(r.returnBody!).current, null, "current")
  })

  await test("GET gives no options for an environment without variants", async () => {
    const r = createMockRequest({ uri: "/global-components/multi-os/target/prod" })
    multiOs.handleStatus(r)
    assertEqual(r.returnBody, JSON.stringify({ current: null, options: [] }), "body")
  })

  await test("only GET is allowed — the set route is the only writer", async () => {
    const r = createMockRequest({ method: "PUT", uri: "/global-components/multi-os/target/test" })
    multiOs.handleStatus(r)
    assertEqual(r.returnCode, 405, "status")
  })

  // --- set ---
  console.log("\nhandleSet:")

  const EDGE = "nonie+configurable+"
  const IE = "ie+configurable+"
  const setRequest = (args: Record<string, string>, ieaction: string) =>
    createMockRequest({ uri: "/global-components/multi-os/set", args, variables: { ieaction } })
  const cookieOf = (r: MockRequest) => r.headersOut["Set-Cookie"] as string

  await test("from Edge: writes Edge's copy, then flips to IE mode to write that one", async () => {
    const r = setRequest({ env: "test", host: OAPPS, return: "/global-components/test/preview/" }, EDGE)
    multiOs.handleSet(r)
    assert(cookieOf(r).startsWith(`Gloco-Os-Target-test=${OAPPS}; Path=/;`), `cookie: ${cookieOf(r)}`)
    assert(cookieOf(r).includes("HttpOnly") && cookieOf(r).includes("Secure"), `cookie: ${cookieOf(r)}`)
    assertEqual(r.headersOut["X-InternetExplorerMode"], "1", "flip to IE mode")
    assertEqual(r.returnCode, 302, "status")
    assertEqual(
      r.returnBody,
      `/global-components/multi-os/set?env=test&host=${OAPPS}&return=%2Fglobal-components%2Ftest%2Fpreview%2F&done=edge`,
      "hop",
    )
  })

  await test("then in IE mode: writes IE mode's copy and returns to the preview page in Edge", async () => {
    const r = setRequest({ env: "test", host: OAPPS, return: "/global-components/test/preview/", done: "edge" }, IE)
    multiOs.handleSet(r)
    assert(cookieOf(r).startsWith(`Gloco-Os-Target-test=${OAPPS};`), `cookie: ${cookieOf(r)}`)
    assertEqual(r.headersOut["X-InternetExplorerMode"], "0", "back to Edge")
    assertEqual(r.returnBody, "/global-components/test/preview/", "return")
  })

  await test("started in IE mode: writes that copy first, then flips to Edge for the other", async () => {
    const first = setRequest({ env: "test", host: OAPPS, return: "/x" }, IE)
    multiOs.handleSet(first)
    assertEqual(first.headersOut["X-InternetExplorerMode"], "0", "flip to Edge")
    assert(first.returnBody!.endsWith("&done=ie"), `hop: ${first.returnBody}`)

    const second = setRequest({ env: "test", host: OAPPS, return: "/x", done: "ie" }, EDGE)
    multiOs.handleSet(second)
    assertEqual(second.headersOut["X-InternetExplorerMode"], undefined, "already in Edge")
    assertEqual(second.returnBody, "/x", "return")
  })

  await test("an empty host clears the signal (expired cookie), through both engines", async () => {
    const r = setRequest({ env: "test", host: "", return: "/x" }, EDGE)
    multiOs.handleSet(r)
    assert(cookieOf(r).startsWith("Gloco-Os-Target-test=; Path=/;"), `cookie: ${cookieOf(r)}`)
    assert(cookieOf(r).includes("Expires=Thu, 01 Jan 1970"), "expired")
    assertEqual(r.headersOut["X-InternetExplorerMode"], "1", "still visits IE mode to clear its copy")
  })

  await test("never loops when the browser declines the flip", async () => {
    const r = setRequest({ env: "test", host: OAPPS, return: "/x", done: "edge" }, EDGE)
    multiOs.handleSet(r)
    assertEqual(r.returnBody, "/x", "returns rather than hopping again")
  })

  await test("a site that can't flip sets the current engine's copy and returns", async () => {
    const r = setRequest({ env: "test", host: OAPPS, return: "/x" }, "nonie+nonconfigurable+")
    multiOs.handleSet(r)
    assertEqual(r.headersOut["X-InternetExplorerMode"], undefined, "no flip")
    assertEqual(r.returnBody, "/x", "return")
  })

  await test("refuses an unknown host or environment, writing nothing", async () => {
    for (const args of [{ env: "test", host: "evil.example.com" }, { env: "prod", host: OAPPS }, { env: "nope", host: "" }]) {
      const r = setRequest({ ...args, return: "/x" }, EDGE)
      multiOs.handleSet(r)
      assertEqual(r.returnCode, 400, JSON.stringify(args))
      assertEqual(r.headersOut["Set-Cookie"], undefined, "no cookie")
    }
  })

  await test("only returns to paths on this host", async () => {
    for (const unsafe of ["https://evil.example.com/", "//evil.example.com/", "evil", ""]) {
      const r = setRequest({ env: "test", host: OAPPS, return: unsafe, done: "edge" }, IE)
      multiOs.handleSet(r)
      assertEqual(r.returnBody, "/", `return for ${unsafe}`)
    }
  })

  // --- tables stay in step with what they describe ---
  console.log("\ntables:")

  // A variant the module offers must have a config to serve, and a config
  // nobody can reach is dead.
  await test("OS_HOST_VARIANTS matches configuration/config.<env>.<variant>.json both ways", async () => {
    const fromFiles = fs
      .readdirSync(REPO_CONFIGURATION_DIR)
      .map((file: string) => file.match(/^config\.([^.]+)\.([^.]+)\.json$/))
      .filter((m: RegExpMatchArray | null): m is RegExpMatchArray => !!m && m[2] !== "notification")
      .map(([file, env, variant]: RegExpMatchArray) => {
        const text = fs.readFileSync(path.join(REPO_CONFIGURATION_DIR, file!), "utf8")
        const host = (text.match(/"BANNER_TITLE_HREF": "https:\/\/([^/]+)\//) || [])[1]
        return `${env}/${variant}=${host}`
      })
    const fromTable = Object.entries(multiOs.OS_HOST_VARIANTS).flatMap(([env, variants]) =>
      Object.entries(variants).map(([variant, host]) => `${env}/${variant}=${host}`),
    )
    assertEqual(JSON.stringify(fromTable.sort()), JSON.stringify(fromFiles.sort()), "variants")
  })

  // Every overridden route must exist upstream (or the hand-back goes nowhere),
  // and have its own exact location in our conf.
  await test("LAUNCH_ROUTES each have a Polaris prefix location and an override in our conf", async () => {
    const ours = fs.readFileSync(path.join(MODULE_DIR, "global-components.multi-os-domain-testing.conf"), "utf8")
    for (const route of Object.keys(multiOs.LAUNCH_ROUTES)) {
      polarisTarget(route)
      assert(ours.includes(`location = /launch/${route} {`), `override for ${route}`)
      assert(ours.includes(`rewrite ^ /launch/${route}/ last;`), `hand-back for ${route}`)
    }
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
