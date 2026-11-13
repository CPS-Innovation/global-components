#!/usr/bin/env node
/**
 * Unit tests for global-components.os-london-dublin-oapps-switch.js
 *
 * Loads the njs source with njs-loader.js (an .mjs copy, no bundler).
 */

const path = require("path")
const fs = require("fs")
const { loadNjs } = require("../../../njs-loader")

const CONFIG_DIR = path.join(__dirname, "..", "..")
const MODULE_DIR = path.join(CONFIG_DIR, "global-components.os-london-dublin-oapps-switch")
const REPO_CONFIGURATION_DIR = path.join(CONFIG_DIR, "..", "..", "..", "configuration")

async function runTests() {
  const osSwitch = await loadNjs(path.join(MODULE_DIR, "global-components.os-london-dublin-oapps-switch.js"))

  let passed = 0
  let failed = 0

  function assert(condition, message) {
    if (!condition) throw new Error(message)
  }

  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`)
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
      uri: options.uri || "/",
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

  const CPS = "cps-tst.outsystemsenterprise.com"
  const LONDON = "cpslon-tst.outsystemsenterprise.com"
  const SIGNAL = `Gloco-Os-Target-test=${CPS}`

  console.log("=".repeat(60))
  console.log("global-components.os-london-dublin-oapps-switch.js Unit Tests")
  console.log("=".repeat(60))

  // --- config.json selection ---
  console.log("\nreadConfigBlobName:")

  const configRequest = (headersIn, env = "test") =>
    createMockRequest({
      uri: "/global-components/os-london-dublin-oapps-switch/config",
      headersIn: { Host: "polaris-qa-notprod.cps.gov.uk", ...headersIn },
      variables: { gloco_os_switch_config_env: env },
    })

  await test("serves config.json when there is no signal", async () => {
    assertEqual(osSwitch.readConfigBlobName(configRequest({})), "config.json", "blob")
  })

  await test("serves the variant the signal cookie names (CWA, same-origin)", async () => {
    assertEqual(osSwitch.readConfigBlobName(configRequest({ Cookie: `other=1; ${SIGNAL}` })), "config.cps.json", "blob")
  })

  await test("treats an Origin of our own host as same-origin, so the cookie still decides", async () => {
    const r = configRequest({ Origin: "https://polaris-qa-notprod.cps.gov.uk", Cookie: SIGNAL })
    assertEqual(osSwitch.readConfigBlobName(r), "config.cps.json", "blob")
  })

  await test("serves the variant for the OS page's own host, whatever the cookie says", async () => {
    assertEqual(osSwitch.readConfigBlobName(configRequest({ Origin: `https://${LONDON}`, Cookie: SIGNAL })), "config.cps-lon.json", "blob")
  })

  // Config has to match the page it runs on: auth state is per-origin.
  await test("serves config.json to the environment's own OS host even when switched", async () => {
    const r = configRequest({ Origin: "https://oapps-qa-notprod.int.cps.gov.uk", Cookie: SIGNAL })
    assertEqual(osSwitch.readConfigBlobName(r), "config.json", "blob")
  })

  await test("ignores a signal for another environment", async () => {
    assertEqual(osSwitch.readConfigBlobName(configRequest({ Cookie: SIGNAL }, "dev")), "config.json", "blob")
  })

  await test("ignores a signal naming a host with no variant", async () => {
    assertEqual(osSwitch.readConfigBlobName(configRequest({ Cookie: "Gloco-Os-Target-test=evil.example.com" })), "config.json", "blob")
  })

  // --- C-button ---
  console.log("\nlaunchTarget:")

  // Polaris's own hard-coded target for a route, from the reference copy of their nginx config.
  const polarisTarget = (route) => {
    const conf = fs.readFileSync(path.join(CONFIG_DIR, "main", "nginx-full.conf"), "utf8")
    const match = conf.match(new RegExp(`location /launch/${route} \\{\\s*return 302 ([^;]+);`))
    if (!match) throw new Error(`no Polaris location for /launch/${route}`)
    return match[1]
  }

  // The conf diverts signalled /launch/<route> requests to this internal URI.
  const launchRequest = (route, cookie) =>
    createMockRequest({ uri: `/global-components/os-london-dublin-oapps-switch/launch/${route}`, headersIn: cookie ? { Cookie: cookie } : {} })

  await test("hands back (empty) when there is no signal", async () => {
    assertEqual(osSwitch.launchTarget(launchRequest("cin3-proxy")), "", "target")
  })

  // Same shape and encoding as Polaris's own target — only the OS host differs.
  await test("builds Polaris's own target with the OS host swapped, for every overridden route", async () => {
    for (const [route, host] of [["cin2-proxy", CPS], ["cin3-proxy", CPS], ["cin4-proxy", LONDON], ["cin5-proxy", LONDON]]) {
      const expected = polarisTarget(route).split("oapps-qa-notprod.int.cps.gov.uk").join(host)
      assertEqual(osSwitch.launchTarget(launchRequest(route, `Gloco-Os-Target-test=${host}`)), expected, route)
    }
  })

  await test("hands back for a signal naming a host with no variant", async () => {
    assertEqual(osSwitch.launchTarget(launchRequest("cin3-proxy", "Gloco-Os-Target-test=evil.example.com")), "", "target")
  })

  await test("hands back for another environment's signal", async () => {
    assertEqual(osSwitch.launchTarget(launchRequest("cin3-proxy", `Gloco-Os-Target-dev=${CPS}`)), "", "target")
  })

  await test("never touches routes it doesn't divert (raw CMS, prod)", async () => {
    for (const route of ["cin3", "cms-proxy", "cin3-proxy/"]) {
      assertEqual(osSwitch.launchTarget(launchRequest(route, SIGNAL)), "", route)
    }
  })

  await test("only answers on the internal divert URI, not the original route", async () => {
    const r = createMockRequest({ uri: "/launch/cin3-proxy", headersIn: { Cookie: SIGNAL } })
    assertEqual(osSwitch.launchTarget(r), "", "target")
  })

  // --- status ---
  console.log("\nhandleStatus:")

  await test("GET lists the environment's variants and the current signal", async () => {
    const r = createMockRequest({ uri: "/global-components/multi-os/target/test", headersIn: { Cookie: SIGNAL } })
    osSwitch.handleStatus(r)
    assertEqual(r.returnCode, 200, "status")
    assertEqual(
      r.returnBody,
      JSON.stringify({ current: CPS, options: [{ variant: "cps", host: CPS }, { variant: "cps-lon", host: LONDON }] }),
      "body",
    )
  })

  await test("GET reports no signal for a stale host", async () => {
    const r = createMockRequest({ uri: "/global-components/multi-os/target/test", headersIn: { Cookie: "Gloco-Os-Target-test=gone.example.com" } })
    osSwitch.handleStatus(r)
    assertEqual(JSON.parse(r.returnBody).current, null, "current")
  })

  await test("GET gives no options for an environment without variants", async () => {
    const r = createMockRequest({ uri: "/global-components/multi-os/target/prod" })
    osSwitch.handleStatus(r)
    assertEqual(r.returnBody, JSON.stringify({ current: null, options: [] }), "body")
  })

  await test("only GET is allowed — the set route is the only writer", async () => {
    const r = createMockRequest({ method: "PUT", uri: "/global-components/multi-os/target/test" })
    osSwitch.handleStatus(r)
    assertEqual(r.returnCode, 405, "status")
  })

  // --- set ---
  console.log("\nhandleSet:")

  const EDGE = "nonie+configurable+"
  const IE = "ie+configurable+"
  const setRequest = (args, ieaction) =>
    createMockRequest({ uri: "/global-components/multi-os/set", args, variables: { ieaction } })
  const cookieOf = (r) => r.headersOut["Set-Cookie"]

  await test("from Edge: writes Edge's copy, then flips to IE mode to write that one", async () => {
    const r = setRequest({ env: "test", host: CPS, return: "/global-components/test/preview/" }, EDGE)
    osSwitch.handleSet(r)
    assert(cookieOf(r).startsWith(`Gloco-Os-Target-test=${CPS}; Path=/;`), `cookie: ${cookieOf(r)}`)
    assert(cookieOf(r).includes("HttpOnly") && cookieOf(r).includes("Secure"), `cookie: ${cookieOf(r)}`)
    assertEqual(r.headersOut["X-InternetExplorerMode"], "1", "flip to IE mode")
    assertEqual(r.returnCode, 302, "status")
    assertEqual(
      r.returnBody,
      `/global-components/multi-os/set?env=test&host=${CPS}&return=%2Fglobal-components%2Ftest%2Fpreview%2F&done=edge`,
      "hop",
    )
  })

  await test("then in IE mode: writes IE mode's copy and returns to the preview page in Edge", async () => {
    const r = setRequest({ env: "test", host: CPS, return: "/global-components/test/preview/", done: "edge" }, IE)
    osSwitch.handleSet(r)
    assert(cookieOf(r).startsWith(`Gloco-Os-Target-test=${CPS};`), `cookie: ${cookieOf(r)}`)
    assertEqual(r.headersOut["X-InternetExplorerMode"], "0", "back to Edge")
    assertEqual(r.returnBody, "/global-components/test/preview/", "return")
  })

  await test("started in IE mode: writes that copy first, then flips to Edge for the other", async () => {
    const first = setRequest({ env: "test", host: CPS, return: "/x" }, IE)
    osSwitch.handleSet(first)
    assertEqual(first.headersOut["X-InternetExplorerMode"], "0", "flip to Edge")
    assert(first.returnBody.endsWith("&done=ie"), `hop: ${first.returnBody}`)

    const second = setRequest({ env: "test", host: CPS, return: "/x", done: "ie" }, EDGE)
    osSwitch.handleSet(second)
    assertEqual(second.headersOut["X-InternetExplorerMode"], undefined, "already in Edge")
    assertEqual(second.returnBody, "/x", "return")
  })

  await test("an empty host clears the signal (expired cookie), through both engines", async () => {
    const r = setRequest({ env: "test", host: "", return: "/x" }, EDGE)
    osSwitch.handleSet(r)
    assert(cookieOf(r).startsWith("Gloco-Os-Target-test=; Path=/;"), `cookie: ${cookieOf(r)}`)
    assert(cookieOf(r).includes("Expires=Thu, 01 Jan 1970"), "expired")
    assertEqual(r.headersOut["X-InternetExplorerMode"], "1", "still visits IE mode to clear its copy")
  })

  await test("never loops when the browser declines the flip", async () => {
    const r = setRequest({ env: "test", host: CPS, return: "/x", done: "edge" }, EDGE)
    osSwitch.handleSet(r)
    assertEqual(r.returnBody, "/x", "returns rather than hopping again")
  })

  await test("a site that can't flip sets the current engine's copy and returns", async () => {
    const r = setRequest({ env: "test", host: CPS, return: "/x" }, "nonie+nonconfigurable+")
    osSwitch.handleSet(r)
    assertEqual(r.headersOut["X-InternetExplorerMode"], undefined, "no flip")
    assertEqual(r.returnBody, "/x", "return")
  })

  await test("refuses an unknown host or environment, writing nothing", async () => {
    for (const args of [{ env: "test", host: "evil.example.com" }, { env: "prod", host: CPS }, { env: "nope", host: "" }]) {
      const r = setRequest({ ...args, return: "/x" }, EDGE)
      osSwitch.handleSet(r)
      assertEqual(r.returnCode, 400, JSON.stringify(args))
      assertEqual(r.headersOut["Set-Cookie"], undefined, "no cookie")
    }
  })

  await test("only returns to paths on this host", async () => {
    for (const unsafe of ["https://evil.example.com/", "//evil.example.com/", "evil", ""]) {
      const r = setRequest({ env: "test", host: CPS, return: unsafe, done: "edge" }, IE)
      osSwitch.handleSet(r)
      assertEqual(r.returnBody, "/", `return for ${unsafe}`)
    }
  })

  // --- the server-level divert gate ---
  console.log("\nlaunchSignalled:")

  await test("fires only for a C-button route carrying a signal cookie", async () => {
    const gate = (uri, Cookie) =>
      osSwitch.launchSignalled(createMockRequest({ uri, headersIn: Cookie ? { Cookie } : {} }))
    assertEqual(gate("/launch/cin3-proxy", `a=1; ${SIGNAL}`), "1", "signalled C-button")
    assertEqual(gate("/launch/cin3-proxy", "a=1"), "", "no signal")
    assertEqual(gate("/launch/cin3-proxy"), "", "no Cookie header")
    assertEqual(gate("/launch/cin3-proxy", "x=Gloco-Os-Target-test"), "", "prefix in a value, not a name")
    assertEqual(gate("/launch/cin1-proxy", SIGNAL), "", "route we do not divert")
    assertEqual(gate("/polaris", SIGNAL), "", "not a C-button")
  })

  // rewrite_log prints a regex if's whole subject, so a regex on $http_cookie
  // writes every request's Cookie header (bearer tokens, .CMSAUTH) to the log.
  await test("the conf never regex-matches a Cookie header", async () => {
    const ours = fs.readFileSync(path.join(MODULE_DIR, "global-components.os-london-dublin-oapps-switch.conf"), "utf8")
    assert(!/\$(http_cookie|cookie_\w+)\s*~/.test(ours), "no regex if on a cookie")
  })

  // --- tables stay in step with what they describe ---
  console.log("\ntables:")

  // A variant the module offers must have a config to serve, and a config
  // nobody can reach is dead.
  await test("OS_HOST_VARIANTS matches configuration/config.<env>.<variant>.json both ways", async () => {
    const fromFiles = fs
      .readdirSync(REPO_CONFIGURATION_DIR)
      .map((file) => file.match(/^config\.([^.]+)\.([^.]+)\.json$/))
      .filter((m) => !!m && m[2] !== "notification")
      .map(([file, env, variant]) => {
        const text = fs.readFileSync(path.join(REPO_CONFIGURATION_DIR, file), "utf8")
        const host = (text.match(/"BANNER_TITLE_HREF": "https:\/\/([^/]+)\//) || [])[1]
        return `${env}/${variant}=${host}`
      })
    const fromTable = Object.entries(osSwitch.OS_HOST_VARIANTS).flatMap(([env, variants]) =>
      Object.entries(variants).map(([variant, host]) => `${env}/${variant}=${host}`),
    )
    assertEqual(JSON.stringify(fromTable.sort()), JSON.stringify(fromFiles.sort()), "variants")
  })

  // Every diverted route must exist upstream (or the hand-back goes nowhere), and
  // the conf's two route regexes (the server-level divert and the internal
  // location) must match exactly LAUNCH_ROUTES — no more, no fewer.
  await test("LAUNCH_ROUTES exist upstream and are exactly what the conf diverts", async () => {
    const ours = fs.readFileSync(path.join(MODULE_DIR, "global-components.os-london-dublin-oapps-switch.conf"), "utf8")
    const divert = ours.match(/^\s*rewrite (\^\/launch\/\S+\$) \/global-components\/os-london-dublin-oapps-switch\/launch\/\$1 last;/m)
    const internal = ours.match(/^location ~ (\^\/global-components\/os-london-dublin-oapps-switch\/launch\/\S+\$) \{/m)
    assert(!!divert, "server-level divert rewrite")
    assert(!!internal, "internal launch location")
    const divertRe = new RegExp(divert [1])
    const internalRe = new RegExp(internal [1])
    const routes = Object.keys(osSwitch.LAUNCH_ROUTES)
    for (const route of routes) {
      polarisTarget(route)
      assert(divertRe.test(`/launch/${route}`), `divert matches ${route}`)
      assert(internalRe.test(`/global-components/os-london-dublin-oapps-switch/launch/${route}`), `internal location matches ${route}`)
    }
    for (const other of ["cin1-proxy", "cin6-proxy", "cin3", "cms-proxy", "cin3-proxy/", "cin3-proxyx"]) {
      assert(!divertRe.test(`/launch/${other}`), `divert leaves ${other} alone`)
      assert(!internalRe.test(`/global-components/os-london-dublin-oapps-switch/launch/${other}`), `internal location refuses ${other}`)
    }
    assert(!/^location\s+(=\s*)?\/launch\//m.test(ours), "no location of our own on /launch/")
  })

  console.log("\n" + "=".repeat(60))
  console.log(`Results: ${passed} passed, ${failed} failed`)
  console.log("=".repeat(60))

  process.exit(failed > 0 ? 1 : 0)
}

;(async () => {
  try {
    await runTests()
  } catch (err) {
    console.error("Build/test failed:", err.message)
    process.exit(1)
  }
})()
