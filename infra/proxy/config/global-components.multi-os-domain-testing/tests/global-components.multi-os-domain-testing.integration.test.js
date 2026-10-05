#!/usr/bin/env node
/**
 * Integration tests for global-components.multi-os-domain-testing.conf.template
 *
 * Runs against the docker stack with the module layer mounted, which also mounts
 * test-only stand-ins for Polaris's /launch routes (docker/test-only.polaris-launch.conf)
 * so the C-button divert and its hand-back can be proven end to end.
 */

const {
  PROXY_BASE,
  assert,
  assertEqual,
  test,
  fetchJson,
  getState,
  resetState,
} = require("../../../test-utils")

const OAPPS = "oapps-qa-notprod.int.cps.gov.uk"
const SIGNAL = `Gloco-Os-Target-test=${OAPPS}`
// IE mode, as a proxied-CMS request arrives: Trident UA on an IE-configurable site.
const IE_MODE = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko",
  "X-InternetExplorerModeConfigurable": "1",
}
const EDGE_CONFIGURABLE = { "X-InternetExplorerModeConfigurable": "1" }

const redirectOf = async (path, headers = {}) => {
  const response = await fetch(`${PROXY_BASE}${path}`, { headers, redirect: "manual" })
  return { status: response.status, location: response.headers.get("location"), response }
}

async function testConfigSelection() {
  console.log("\nconfig.json selection:")

  const CONFIG_URL = `${PROXY_BASE}/global-components/test/config.json`
  const blobFileOf = response => response.headers.get("x-mock-blob-file")

  await test("serves config.json from blob storage when there is no signal", async () => {
    const response = await fetch(CONFIG_URL)
    assertEqual(response.status, 200, "Should return 200")
    assertEqual(blobFileOf(response), "config.json", "Should serve the base config")
    assert((response.headers.get("vary") || "").includes("Cookie"), "Should vary on Cookie")
  })

  await test("serves the variant named by the signal cookie", async () => {
    const response = await fetch(CONFIG_URL, { headers: { Cookie: SIGNAL } })
    assertEqual(blobFileOf(response), "config.oapps.json", "Should serve the variant")
  })

  await test("serves the variant matching an OS page's Origin", async () => {
    const response = await fetch(CONFIG_URL, { headers: { Origin: `https://${OAPPS}` } })
    assertEqual(blobFileOf(response), "config.oapps.json", "Should serve the variant")
    assertEqual(response.headers.get("access-control-allow-origin"), "*", "Should keep CORS")
  })

  await test("leaves every other artifact to the main conf", async () => {
    const response = await fetch(`${PROXY_BASE}/global-components/test/global-components.js`, {
      headers: { Cookie: SIGNAL },
    })
    assertEqual(blobFileOf(response), "global-components.js", "Should be untouched")
  })
}

async function testCButton() {
  console.log("\nC-button (/launch/<cin>-proxy, diverted only with the signal):")

  await test("without the signal, hands back to the existing launch route untouched", async () => {
    const { status, location } = await redirectOf("/launch/cin3-proxy", IE_MODE)
    assertEqual(status, 302, "Should redirect")
    assertEqual(location, "https://polaris-qa-notprod.cps.gov.uk/polaris?r=STAND-IN-cin3-proxy", "Should be the existing route's own target")
  })

  await test("with an unrelated cookie, hands back untouched", async () => {
    const { location } = await redirectOf("/launch/cin3-proxy", { ...IE_MODE, Cookie: "other=1; Gloco-Os-Target=x" })
    assertEqual(location, "https://polaris-qa-notprod.cps.gov.uk/polaris?r=STAND-IN-cin3-proxy", "Should be the existing route's own target")
  })

  // Diverted (the cookie is present), then rewritten back to the original URI —
  // proves the hand-back reaches the exact-match route, without looping.
  await test("with an unknown host in the cookie, still hands back", async () => {
    const { location } = await redirectOf("/launch/cin3-proxy", { ...IE_MODE, Cookie: "Gloco-Os-Target-test=evil.example.com" })
    assertEqual(location, "https://polaris-qa-notprod.cps.gov.uk/polaris?r=STAND-IN-cin3-proxy", "Should be the existing route's own target")
  })

  await test("with the signal, sends the user through the handover chain on the chosen host", async () => {
    const { status, location } = await redirectOf("/launch/cin3-proxy", { ...IE_MODE, Cookie: SIGNAL })
    assertEqual(status, 302, "Should redirect")
    assert(location.startsWith("https://polaris-qa-notprod.cps.gov.uk/polaris?r="), `Should go via /polaris, got: ${location}`)
    const handover = decodeURIComponent(location.split("?r=")[1])
    assert(
      handover.startsWith(`https://${OAPPS}/Casework_Patterns/auth-handover.html?src=https://polaris-qa-notprod.cps.gov.uk/global-components/test/auth-handover.js&stage=os-cookie-return&r=`),
      `Should target the chosen host's handover, got: ${handover}`
    )
    assert(
      decodeURIComponent(handover.split("&r=")[1]) === `https://${OAPPS}/casework_blocks/home?IsFromCMS=True`,
      `Should land on the chosen host's home, got: ${handover}`
    )
  })

  await test("the internal divert route can't be requested directly", async () => {
    const { status } = await redirectOf("/global-components/multi-os/launch/cin3-proxy", { ...IE_MODE, Cookie: SIGNAL })
    assertEqual(status, 404, "Should be internal only")
  })

  await test("leaves routes it doesn't divert alone, signal or not", async () => {
    const { location } = await redirectOf("/launch/cin3", { Cookie: SIGNAL })
    assertEqual(location, "https://cin3.cps.gov.uk/polaris?r=STAND-IN-cin3", "Should be the existing route's own target")
  })
}

async function testSwitch() {
  console.log("\nThe switch (status + set):")

  const setPath = host =>
    `/global-components/multi-os/set?env=test&host=${encodeURIComponent(host)}&return=${encodeURIComponent("/global-components/test/preview/")}`

  await test("status lists the variants and reads the signal", async () => {
    const body = await fetchJson(`${PROXY_BASE}/global-components/multi-os/target/test`, { headers: { Cookie: SIGNAL } })
    assertEqual(body.current, OAPPS, "Should report the signal")
    assertEqual(body.options.length, 2, "Should list oapps and cps-lon")
  })

  await test("set, from Edge: writes the cookie and flips to IE mode for the second copy", async () => {
    const { status, location, response } = await redirectOf(setPath(OAPPS), EDGE_CONFIGURABLE)
    assertEqual(status, 302, "Should redirect")
    assertEqual(response.headers.get("x-internetexplorermode"), "1", "Should flip to IE mode")
    assert((response.headers.get("set-cookie") || "").startsWith(SIGNAL), "Should set the Edge copy")
    assert(location.includes("&done=edge"), `Should hop back to itself, got: ${location}`)
  })

  await test("set, in IE mode: writes the second copy and returns to the preview page in Edge", async () => {
    const { location, response } = await redirectOf(`${setPath(OAPPS)}&done=edge`, IE_MODE)
    assertEqual(response.headers.get("x-internetexplorermode"), "0", "Should flip back to Edge")
    assert((response.headers.get("set-cookie") || "").startsWith(SIGNAL), "Should set the IE-mode copy")
    // nginx absolutises relative redirects (absolute_redirect on), so compare the path only.
    assertEqual(new URL(location, PROXY_BASE).pathname, "/global-components/test/preview/", "Should return to the preview page")
  })

  await test("set with no host clears the signal", async () => {
    const { response } = await redirectOf(setPath(""), EDGE_CONFIGURABLE)
    assert((response.headers.get("set-cookie") || "").includes("1970"), "Should expire the cookie")
  })

  await test("set refuses a host that is not a variant", async () => {
    const { status } = await redirectOf(setPath("evil.example.com"), EDGE_CONFIGURABLE)
    assertEqual(status, 400, "Should return 400")
  })
}

async function main() {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

  await testConfigSelection()
  await testCButton()
  await testSwitch()
}

module.exports = main

if (require.main === module) {
  resetState()
  console.log("=".repeat(60))
  console.log("Multi-OS-domain testing Integration Tests")
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
    .catch(err => {
      console.error("\nTest suite error:", err.message)
      process.exit(1)
    })
}
