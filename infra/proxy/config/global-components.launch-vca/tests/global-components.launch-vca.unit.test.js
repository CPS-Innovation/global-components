#!/usr/bin/env node
/**
 * Unit tests for global-components.launch-vca.js
 *
 * Loads the njs source with njs-loader.js (an .mjs copy, no bundler), then runs the
 * page's own inline script in a node vm against a fake DOM, so the probe order,
 * first-winner, timeout and navigation rules are tested as shipped.
 */

const path = require("path")
const fs = require("fs")
const vm = require("vm")
const { loadNjs } = require("../../../njs-loader")

const MODULE_DIR = path.join(__dirname, "..")
const QA_HOST = "polaris-qa-notprod.cps.gov.uk"
const QA_HANDOVER =
  "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html" +
  "?src=https://polaris-qa-notprod.cps.gov.uk/global-components/test/auth-handover.js" +
  "&stage=os-cookie-return&r=" +
  encodeURIComponent("https://cps-tst.outsystemsenterprise.com/VictimsCaseApplication/")

async function runTests() {
  const launchVca = await loadNjs(path.join(MODULE_DIR, "global-components.launch-vca.js"))

  let passed = 0
  let failed = 0

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message)
    }
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
      uri: "/launch-vca",
      args: options.args || {},
      headersIn: options.headersIn || { Host: QA_HOST },
      headersOut: {},
      variables: {},
      returnCode: null,
      returnBody: null,
      return(code, body) {
        this.returnCode = code
        this.returnBody = body
      },
    }
  }

  const pageFor = (options) => {
    const r = createMockRequest(options)
    launchVca.handleLaunchVca(r)
    return r
  }

  const scriptOf = (html) => {
    const m = /<script>\n([\s\S]*)\n<\/script>/.exec(html)
    if (!m) {
      throw new Error("no inline script in the page")
    }
    return m[1]
  }

  // A fake browser: the four elements the script touches, <script> tags that never
  // load by themselves, manual timers, and a location that records the navigation.
  const runPage = (html) => {
    const element = () => ({ style: { display: "none" }, textContent: "", href: "#", children: [], appendChild(c) { this.children.push(c) } })
    const els = { status: element(), continue: element(), retry: element(), log: element() }
    const scripts = []
    const timers = []
    const sandbox = {
      document: {
        getElementById: (id) => els[id],
        createElement: (tag) => (tag === "script" ? { src: "" } : element()),
        getElementsByTagName: () => [{ appendChild: (s) => scripts.push(s) }],
      },
      setTimeout: (fn, ms) => timers.push({ fn, ms, live: true }) - 1,
      clearTimeout: (id) => {
        if (timers[id]) {
          timers[id].live = false
        }
      },
      encodeURIComponent,
      navigatedTo: null,
    }
    sandbox.window = sandbox
    sandbox.location = { replace: (url) => (sandbox.navigatedTo = url) }
    vm.runInNewContext(scriptOf(html), sandbox)
    const cbOf = (s) => decodeURIComponent(decodeURIComponent(s.src.split("?skip-entra=1&r=")[1])).split("cb=")[1]
    return {
      els,
      scripts,
      timers,
      sandbox,
      answer: (i, result) => sandbox[cbOf(scripts[i])](result),
      error: (i) => scripts[i].onerror(),
      loadWithoutCallback: (i) => scripts[i].onload(),
      fireTimer: (i) => timers[i].live && timers[i].fn(),
      log: () => els.log.children.map((li) => li.textContent),
    }
  }

  const QA = launchVca.ENVIRONMENTS[QA_HOST]
  const launchUrlVia = (endpoint) => endpoint + "?r=" + encodeURIComponent(QA_HANDOVER)

  console.log("\n/launch-vca — the page:")

  await test("GET on the QA host: 200 HTML, never cached", () => {
    const r = pageFor()
    assertEqual(r.returnCode, 200, "200")
    assertEqual(r.headersOut["Content-Type"], "text/html; charset=utf-8", "HTML")
    assertEqual(r.headersOut["Cache-Control"], "no-store", "no-store")
    assert(r.returnBody.indexOf("<!DOCTYPE html>") === 0, "standards mode, not quirks")
    assert(r.returnBody.includes('content="IE=edge"'), "IE mode gets its best document mode")
  })

  await test("the Host is matched without its port and case-insensitively", () => {
    assertEqual(pageFor({ headersIn: { Host: "Polaris-QA-NotProd.cps.gov.uk:443" } }).returnCode, 200, "200")
  })

  await test("an unknown host: 404, no page", () => {
    for (const Host of ["localhost:8080", "polaris-qa-cmsproxy.azurewebsites.net", "", "constructor", "__proto__"]) {
      const r = pageFor({ headersIn: { Host } })
      assertEqual(r.returnCode, 404, `404 for ${JSON.stringify(Host)}`)
    }
  })

  await test("anything but GET/HEAD: 405", () => {
    assertEqual(pageFor({ method: "POST" }).returnCode, 405, "405")
    assertEqual(pageFor({ method: "HEAD" }).returnCode, 200, "HEAD is fine")
  })

  await test("QA probes the hint-led endpoint, then real cin3, then the proxied CMS", () => {
    assertEqual(QA.probeEndpoints.join(","), "/auth-refresh-outbound,https://cin3.cps.gov.uk/polaris,/polaris", "order")
    assertEqual(QA.vcaHost, "cps-tst.outsystemsenterprise.com", "VCA stays on outsystemsenterprise")
  })

  await test("the page's config carries QA's endpoints, the VCA handover and the timeout", () => {
    const html = pageFor().returnBody
    const cfg = JSON.parse(/var LAUNCH_VCA = (.*);\n/.exec(html)[1])
    assertEqual(cfg.endpoints.join(","), QA.probeEndpoints.join(","), "endpoints")
    assertEqual(cfg.handover, QA_HANDOVER, "handover on VCA's host, landing on VCA's root")
    assertEqual(cfg.timeoutMs, launchVca.PROBE_TIMEOUT_MS, "timeout")
    assertEqual(cfg.stay, false, "follows the winner by default")
  })

  await test("the inline config cannot close the <script> element", () => {
    const html = pageFor().returnBody
    assertEqual(html.split("</script>").length, 2, "one closing tag")
    assertEqual(/var LAUNCH_VCA = .*</.test(html), false, "no raw < in the config")
  })

  await test("the page script is ES3: no let/const, arrows, template literals", () => {
    const script = scriptOf(pageFor().returnBody)
    for (const [what, re] of [["let/const", /\b(let|const)\s/], ["arrow", /=>/], ["template literal", /`/]]) {
      assertEqual(re.test(script), false, what)
    }
  })

  console.log("\n/launch-vca — the search (the page script in a fake browser):")

  await test("probes the first endpoint with skip-entra=1 and the JSONP termination chain", () => {
    const page = runPage(pageFor().returnBody)
    assertEqual(page.scripts.length, 1, "one probe at a time")
    const src = page.scripts[0].src
    assert(src.indexOf("/auth-refresh-outbound?skip-entra=1&r=") === 0, "skip-entra first, then r: " + src)
    const inner = decodeURIComponent(src.split("?skip-entra=1&r=")[1])
    assert(inner.indexOf("/auth-refresh-inbound?fail-correlation-id=null&polaris-ui-url=") === 0, "drop1 chain: " + inner)
    const termination = decodeURIComponent(inner.split("polaris-ui-url=")[1])
    assert(/^\/auth-refresh-termination\?cb=launchVca_\d+_0$/.test(termination), "JSONP termination: " + termination)
    assertEqual(page.timers[0].ms, launchVca.PROBE_TIMEOUT_MS, "per-probe timeout")
  })

  await test("the callback name passes Polaris's cb rule", () => {
    const page = runPage(pageFor().returnBody)
    const cb = decodeURIComponent(decodeURIComponent(page.scripts[0].src.split("?skip-entra=1&r=")[1])).split("cb=")[1]
    assert(/^launchVca_\d+_0$/.test(cb), "the name the page gave: " + cb)
    assert(/^[A-Za-z_$][A-Za-z0-9_$.]{0,99}$/.test(cb), cb)
  })

  await test("first success wins: navigates via that endpoint, without skip-entra, probes nothing else", () => {
    const page = runPage(pageFor().returnBody)
    page.answer(0, { isSuccess: true, failReason: "" })
    assertEqual(page.sandbox.navigatedTo, launchUrlVia("/auth-refresh-outbound"), "launch URL")
    assertEqual(page.sandbox.navigatedTo.includes("skip-entra"), false, "the real launch goes through Entra")
    assertEqual(page.scripts.length, 1, "no further probes")
    assertEqual(page.els.continue.href, page.sandbox.navigatedTo, "the link is there too")
    assertEqual(page.els.continue.style.display, "", "and shown")
    assertEqual(page.log().join("|"), "/auth-refresh-outbound: found", "log")
  })

  await test("failures move on in order: no session, failed to load, then success on the third", () => {
    const page = runPage(pageFor().returnBody)
    page.answer(0, { isSuccess: false, failReason: "cms-modern-auth-not-valid" })
    assertEqual(page.scripts.length, 2, "second probe")
    assert(page.scripts[1].src.indexOf("https://cin3.cps.gov.uk/polaris?skip-entra=1&r=") === 0, "real cin3 next")
    page.error(1)
    assertEqual(page.scripts.length, 3, "third probe")
    assert(page.scripts[2].src.indexOf("/polaris?skip-entra=1&r=") === 0, "proxied CMS last")
    page.answer(2, { isSuccess: true })
    assertEqual(page.sandbox.navigatedTo, launchUrlVia("/polaris"), "launched via the proxied CMS")
    assertEqual(
      page.log().join("|"),
      "/auth-refresh-outbound: no session (cms-modern-auth-not-valid)|https://cin3.cps.gov.uk/polaris: failed to load|/polaris: found",
      "log",
    )
  })

  await test("a timeout moves on, and a late answer from the timed-out probe is ignored", () => {
    const page = runPage(pageFor().returnBody)
    page.fireTimer(0)
    assertEqual(page.scripts.length, 2, "moved on")
    page.answer(0, { isSuccess: true })
    assertEqual(page.sandbox.navigatedTo, null, "late success ignored")
    assertEqual(page.scripts.length, 2, "and no extra probe")
    assertEqual(page.log()[0], "/auth-refresh-outbound: timed out", "log")
  })

  await test("a script that loads but never calls back (an error page) moves on", () => {
    const page = runPage(pageFor().returnBody)
    page.loadWithoutCallback(0)
    assertEqual(page.scripts.length, 2, "moved on")
    assertEqual(page.log()[0], "/auth-refresh-outbound: no answer", "log")
  })

  await test("the onload after a real callback does nothing", () => {
    const page = runPage(pageFor().returnBody)
    page.answer(0, { isSuccess: false, failReason: "no-cookies" })
    page.loadWithoutCallback(0)
    assertEqual(page.scripts.length, 2, "only one move")
    assertEqual(page.log().length, 1, "one log line")
  })

  await test("the timer of a settled probe is cleared", () => {
    const page = runPage(pageFor().returnBody)
    page.answer(0, { isSuccess: false })
    assertEqual(page.timers[0].live, false, "cleared")
  })

  await test("only isSuccess === true counts", () => {
    for (const result of [{ isSuccess: "true" }, { isSuccess: 1 }, {}, null, undefined]) {
      const page = runPage(pageFor().returnBody)
      page.answer(0, result)
      assertEqual(page.sandbox.navigatedTo, null, "not a success: " + JSON.stringify(result))
      assertEqual(page.scripts.length, 2, "moved on")
    }
  })

  await test("nothing found: says so, offers a retry, navigates nowhere", () => {
    const page = runPage(pageFor().returnBody)
    page.error(0)
    page.error(1)
    page.error(2)
    assertEqual(page.scripts.length, 3, "three probes, then stop")
    assertEqual(page.sandbox.navigatedTo, null, "no navigation")
    assert(page.els.status.textContent.includes("could not find a CMS session"), page.els.status.textContent)
    assertEqual(page.els.retry.style.display, "", "retry shown")
    assertEqual(page.els.continue.style.display, "none", "no continue link")
  })

  await test("stay=1: finds the session and shows the link, but does not follow it", () => {
    const page = runPage(pageFor({ args: { stay: "1" } }).returnBody)
    page.answer(0, { isSuccess: true })
    assertEqual(page.sandbox.navigatedTo, null, "stays")
    assertEqual(page.els.continue.href, launchUrlVia("/auth-refresh-outbound"), "link")
    assertEqual(page.els.continue.style.display, "", "shown")
  })

  await test("stay other than exactly 1 still follows the winner", () => {
    const page = runPage(pageFor({ args: { stay: "true" } }).returnBody)
    page.answer(0, { isSuccess: true })
    assertEqual(page.sandbox.navigatedTo, launchUrlVia("/auth-refresh-outbound"), "followed")
  })

  console.log("\n/launch-vca — the conf:")

  await test("the conf's one location calls the handler the module exports", () => {
    const conf = fs.readFileSync(path.join(MODULE_DIR, "global-components.launch-vca.conf"), "utf8")
    const live = conf.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n")
    const locations = Array.from(live.matchAll(/^\s*location\s+([^{]+)\{/gm), (m) => m[1].trim())
    assertEqual(locations.join(","), "= /launch-vca", "one exact-match location")
    const handler = /js_content\s+glocoLaunchVca\.(\w+);/.exec(live)[1]
    assertEqual(typeof launchVca[handler], "function", handler + " exported")
  })

  console.log("\n" + "=".repeat(60))
  console.log(`Results: ${passed} passed, ${failed} failed`)
  console.log("=".repeat(60))
  process.exit(failed > 0 ? 1 : 0)
}

runTests().catch((err) => {
  console.error(err)
  process.exit(1)
})
