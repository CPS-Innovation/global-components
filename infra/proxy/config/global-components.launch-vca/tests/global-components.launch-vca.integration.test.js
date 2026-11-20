#!/usr/bin/env node
/**
 * Integration tests for global-components.launch-vca.conf.template
 *
 * Runs against the docker stack with the module layer mounted. Proves the conf
 * parses beside everything else, the njs loads under real njs (not node), and the
 * route answers per Host. The page's search is tested in the unit tests, which run
 * its script against a fake browser.
 *
 * Uses node's http module, not fetch: the route is chosen by the Host header,
 * which fetch does not let a caller set.
 */

const http = require("http")
const { PROXY_BASE, assert, assertEqual, test, getState, resetState } = require("../../../test-utils")

const QA_HOST = "polaris-qa-notprod.cps.gov.uk"

const request = (path, { method = "GET", host } = {}) =>
  new Promise((resolve, reject) => {
    const url = new URL(path, PROXY_BASE)
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers: host ? { Host: host } : {} },
      (res) => {
        let body = ""
        res.setEncoding("utf8")
        res.on("data", (chunk) => (body += chunk))
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }))
      },
    )
    req.on("error", reject)
    req.end()
  })

async function testLaunchVca() {
  console.log("\n/launch-vca:")

  await test("on the QA host: 200, the launch page, never cached", async () => {
    const res = await request("/launch-vca", { host: QA_HOST })
    assertEqual(res.status, 200, "200")
    assertEqual(res.headers["content-type"], "text/html; charset=utf-8", "HTML")
    assertEqual(res.headers["cache-control"], "no-store", "no-store")
    assert(res.body.includes("var LAUNCH_VCA = "), "carries the page config")
    assert(res.body.includes("https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html"), "the VCA handover")
  })

  await test("stay=1 reaches the page config", async () => {
    const res = await request("/launch-vca?stay=1", { host: QA_HOST })
    assert(res.body.includes('"stay":true'), "stay")
  })

  await test("on a host with no environment: 404", async () => {
    const res = await request("/launch-vca")
    assertEqual(res.status, 404, "404")
    assert(res.body.includes("not configured for this host"), "says why")
  })

  await test("POST: 405", async () => {
    const res = await request("/launch-vca", { method: "POST", host: QA_HOST })
    assertEqual(res.status, 405, "405")
  })

  await test("only the exact path: /launch-vca/x is not this page", async () => {
    const res = await request("/launch-vca/x", { host: QA_HOST })
    assertEqual(res.body.includes("var LAUNCH_VCA = "), false, "not served by the module")
  })
}

async function main() {
  await testLaunchVca()
}

module.exports = main

if (require.main === module) {
  resetState()
  console.log("=".repeat(60))
  console.log("/launch-vca Integration Tests")
  console.log(`Target: ${PROXY_BASE}`)
  console.log("=".repeat(60))

  main()
    .then(() => {
      const state = getState()
      console.log("\n" + "=".repeat(60))
      console.log(`Results: ${state.passed} passed, ${state.failed} failed`)
      console.log("=".repeat(60))
      process.exit(state.failed > 0 ? 1 : 0)
    })
    .catch((err) => {
      console.error("\nTest suite error:", err.message)
      process.exit(1)
    })
}
