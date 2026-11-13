#!/usr/bin/env node
/**
 * Unit tests for global-components.vnext.js — the advance copy of our changes to
 * Polaris's global-components module: the state route (Polaris's GET/PUT plus
 * JSONP and the dual-engine ?set=), navigate-cms (plus target=modern) and the
 * swagger body filter.
 *
 * The handleState and handleNavigateCms tests are main's own (config/main/tests),
 * run against this copy: a route we take over must behave as Polaris's for every
 * request we did not mean to change. The ?callback= and ?set= tests came over
 * from cms-augmentation, which served /state/preview until this module took the
 * whole state route.
 *
 * Loads the njs source with njs-loader.js (an .mjs copy, no bundler).
 */

const path = require("path")
const { loadNjs } = require("../../../njs-loader")

const CONFIG_DIR = path.join(__dirname, "..", "..")

const STATE_PATH = "/global-components/state/preview"
const COOKIE = "cps-global-components-state"

async function runTests() {
  // The module logs only from the ?set= path (which jars it wrote). Collected, so
  // the partial-write warning can be asserted on.
  const logged = []
  ;globalThis.ngx = {
    WARN: 4,
    log: (_level, msg) => {
      logged.push(msg)
    },
  }

  const vnext = await loadNjs(path.join(CONFIG_DIR, "global-components.vnext", "global-components.vnext.js"))

  let passed = 0
  let failed = 0

  function assert(condition, message) {
    if (!condition) throw new Error(message)
  }

  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(
        `${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`
      )
    }
  }

  async function test(name, fn) {
    logged.length = 0
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

  // main's request shape: query values in r.args, already decoded.
  function createMockRequest(options = {}) {
    return {
      method: options.method || "GET",
      uri: options.uri || "/global-components/test",
      args: options.args || {},
      headersIn: options.headersIn || {},
      headersOut: {},
      variables: { gloco_vnext_mds_base_url: "http://mock-upstream:3000/api/", ...options.variables },
      returnCode: null,
      returnBody: null,
      requestText: options.requestText || "",
      sentBuffer: null,
      sentFlags: null,
      return(code, body) {
        this.returnCode = code
        this.returnBody = body
      },
      sendBuffer(buffer, flags) {
        this.sentBuffer = buffer
        this.sentFlags = flags
      },
    }
  }

  // _getQueryParam reads $arg_<name>, so query args go in `variables` as the
  // RAW (still percent-encoded) values nginx would expose.
  function createStateRequest(options = {}) {
    const variables = {
      ieaction: options.ieaction || "nonie+configurable+",
    }
    for (const [k, v] of Object.entries(options.args || {})) {
      variables["arg_" + k] = v
    }
    return {
      method: options.method || "GET",
      uri: options.uri || STATE_PATH,
      requestText: options.requestText,
      headersIn: options.cookie ? { Cookie: options.cookie } : {},
      headersOut: {},
      variables,
      returnCode: null,
      returnBody: null,
      return(code, body) {
        this.returnCode = code
        this.returnBody = body
      },
    }
  }

  const b64url = (s) =>
    Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

  const setCookieOf = (r) => String(r.headersOut["Set-Cookie"] || "")
  const cookieValueOf = (r) => setCookieOf(r).split(";")[0].split("=").slice(1).join("=")

  const PREVIEW = '{"caseLocking":true}'

  console.log("=".repeat(60))
  console.log("global-components.vnext.js Unit Tests")
  console.log("=".repeat(60))

  // ===========================================================================
  // Polaris's own tests, against this copy
  // ===========================================================================

  console.log("\nhandleState:")

  await test("GET on whitelisted key (preview) returns null without auth", async () => {
    const r = createMockRequest({
      method: "GET",
      uri: "/global-components/state/preview",
    })
    await vnext.handleState(r)
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
    await vnext.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assertEqual(r.returnBody, stateValue, "Should return unwrapped cookie value")
  })

  await test("GET on non-whitelisted key returns 200 when validation disabled", async () => {
    const r = createMockRequest({
      method: "GET",
      uri: "/global-components/state/other-key",
    })
    await vnext.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200 (validation disabled)")
  })

  await test("PUT succeeds without Authorization header when validation disabled", async () => {
    const stateValue = JSON.stringify({ count: 42 })
    const r = createMockRequest({
      method: "PUT",
      uri: "/global-components/state/my-key",
      requestText: stateValue,
    })
    await vnext.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200 (validation disabled)")
    const body = JSON.parse(r.returnBody)
    assertEqual(body.success, true, "Should have success true")
  })

  await test("PUT sets cookie with body content", async () => {
    const stateValue = JSON.stringify({ count: 42 })
    const r = createMockRequest({
      method: "PUT",
      uri: "/global-components/state/my-key",
      requestText: stateValue,
    })
    await vnext.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    const body = JSON.parse(r.returnBody)
    assertEqual(body.success, true, "Should have success true")
    assertEqual(body.path, "/global-components/state/my-key", "Should include path")
    const setCookie = r.headersOut["Set-Cookie"]
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
    await vnext.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    const body = JSON.parse(r.returnBody)
    assertEqual(body.success, true, "Should have success true")
    assertEqual(body.cleared, true, "Should have cleared true")
    const setCookie = r.headersOut["Set-Cookie"]
    assert(setCookie.includes("cps-global-components-state=;"), "Should set empty cookie value")
    assert(setCookie.includes("Expires=Thu, 01 Jan 1970"), "Should set cookie to expire in the past")
  })

  await test("PUT with empty body clears cookie", async () => {
    const r = createMockRequest({
      method: "PUT",
      uri: "/global-components/state/my-key",
      requestText: "",
    })
    await vnext.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    const body = JSON.parse(r.returnBody)
    assertEqual(body.success, true, "Should have success true")
    assertEqual(body.cleared, true, "Should have cleared true")
    const setCookie = r.headersOut["Set-Cookie"]
    assert(setCookie.includes("Expires=Thu, 01 Jan 1970"), "Should set cookie to expire in the past")
  })

  await test("PUT with whitespace-only body clears cookie", async () => {
    const r = createMockRequest({
      method: "PUT",
      uri: "/global-components/state/my-key",
      requestText: "   \n  ",
    })
    await vnext.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    const body = JSON.parse(r.returnBody)
    assertEqual(body.cleared, true, "Should have cleared true for whitespace body")
  })

  await test("PUT with valid JSON does not set cleared flag", async () => {
    const r = createMockRequest({
      method: "PUT",
      uri: "/global-components/state/my-key",
      requestText: JSON.stringify({ enabled: true }),
    })
    await vnext.handleState(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    const body = JSON.parse(r.returnBody)
    assertEqual(body.success, true, "Should have success true")
    assertEqual(body.cleared, undefined, "Should not have cleared flag for valid data")
  })

  await test("returns 405 for unsupported methods", async () => {
    const r = createMockRequest({
      method: "DELETE",
      uri: "/global-components/state/my-key",
    })
    await vnext.handleState(r)
    assertEqual(r.returnCode, 405, "Should return 405")
    const body = JSON.parse(r.returnBody)
    assertEqual(body.error, "Method not allowed", "Should have error message")
  })

  // --- handleNavigateCms tests ---
  const SESSION_HINT_COOKIE = "Cms-Session-Hint=" + encodeURIComponent(JSON.stringify({
    cmsDomains: ["foo.cps.gov.uk"],
    isProxySession: false,
    handoverEndpoint: "https://foo.cps.gov.uk/polaris",
  }))

  console.log("\nhandleNavigateCms (open phase):")

  await test("non-IE + configurable: extracts domain from cookie and passes as cmsDomain query param", async () => {
    const r = createMockRequest({
      uri: "/global-components/navigate-cms",
      args: { caseId: "123" },
      variables: { ieaction: "nonie+configurable+", args: "caseId=123" },
      headersIn: { "X-Forwarded-Proto": "https", Host: "localhost:8080", Cookie: SESSION_HINT_COOKIE },
    })
    vnext.handleNavigateCms(r)
    assertEqual(r.returnCode, 302, "Should return 302")
    assertEqual(r.headersOut["X-InternetExplorerMode"], "1", "Should set IE mode header")
    assert(r.returnBody.includes("caseId=123"), `Should preserve original args, got: ${r.returnBody}`)
    assert(r.returnBody.includes("cmsDomain="), `Should include cmsDomain in redirect, got: ${r.returnBody}`)
    assert(r.returnBody.includes("foo.cps.gov.uk"), `cmsDomain should contain extracted domain, got: ${r.returnBody}`)
  })

  await test("non-IE + configurable without cookie: returns 400", async () => {
    const r = createMockRequest({
      uri: "/global-components/navigate-cms",
      args: { caseId: "123" },
      variables: { ieaction: "nonie+configurable+", args: "caseId=123" },
      headersIn: { "X-Forwarded-Proto": "https", Host: "localhost:8080" },
    })
    vnext.handleNavigateCms(r)
    assertEqual(r.returnCode, 400, "Should return 400")
    assert(r.returnBody.includes("could not determine CMS domain"), `Should contain error message, got: ${r.returnBody}`)
  })

  await test("IE + configurable (case): reads cmsDomain from query param and serves iframe", async () => {
    const r = createMockRequest({
      uri: "/global-components/navigate-cms",
      args: { caseId: "123", cmsDomain: "foo.cps.gov.uk" },
      variables: { ieaction: "ie+configurable+" },
      headersIn: { "X-Forwarded-Proto": "https", Host: "localhost:8080" },
    })
    vnext.handleNavigateCms(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assert(r.returnBody.includes("iframe"), `Should contain iframe, got: ${r.returnBody}`)
    assert(r.returnBody.includes("action=navigate&screen=case_details&wId=MASTER&caseId=123"), `Should contain navigate action with caseId, got: ${r.returnBody}`)
    assert(r.returnBody.includes("foo.cps.gov.uk"), `Should use domain from cmsDomain arg, got: ${r.returnBody}`)
    assert(r.returnBody.includes("Opening case in CMS"), `Should have case heading, got: ${r.returnBody}`)
    assert(r.returnBody.includes("do not close this window"), `Should have inset text, got: ${r.returnBody}`)
  })

  await test("IE + configurable (task): reads cmsDomain from query param and serves iframe with task heading", async () => {
    const r = createMockRequest({
      uri: "/global-components/navigate-cms",
      args: { caseId: "123", taskId: "456", cmsDomain: "foo.cps.gov.uk" },
      variables: { ieaction: "ie+configurable+" },
      headersIn: { "X-Forwarded-Proto": "https", Host: "localhost:8080" },
    })
    vnext.handleNavigateCms(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assert(r.returnBody.includes("action=activate_task&screen=case_details&wId=MASTER&taskId=456&caseId=123"), `Should contain activate_task action with taskId and caseId, got: ${r.returnBody}`)
    assert(r.returnBody.includes("Opening task in CMS"), `Should have task heading, got: ${r.returnBody}`)
  })

  await test("IE + configurable without cmsDomain or cookie: returns 400", async () => {
    const r = createMockRequest({
      uri: "/global-components/navigate-cms",
      args: { caseId: "123" },
      variables: { ieaction: "ie+configurable+" },
      headersIn: { "X-Forwarded-Proto": "https", Host: "localhost:8080" },
    })
    vnext.handleNavigateCms(r)
    assertEqual(r.returnCode, 400, "Should return 400")
    assert(r.returnBody.includes("could not determine CMS domain"), `Should contain error message, got: ${r.returnBody}`)
  })

  await test("non-configurable: serves iframe page directly (no redirect)", async () => {
    const r = createMockRequest({
      uri: "/global-components/navigate-cms",
      args: { caseId: "123" },
      variables: { ieaction: "nonie+nonconfigurable+" },
      headersIn: { "X-Forwarded-Proto": "https", Host: "localhost:8080", Cookie: SESSION_HINT_COOKIE },
    })
    vnext.handleNavigateCms(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assert(r.returnBody.includes("iframe"), `Should contain iframe, got: ${r.returnBody}`)
    assert(r.returnBody.includes("action=navigate&screen=case_details&wId=MASTER&caseId=123"), `Should contain navigate action, got: ${r.returnBody}`)
  })

  console.log("\nhandleNavigateCms (target=modern):")

  await test("non-IE + configurable (modern): keeps target=modern through the IE mode redirect", async () => {
    const r = createMockRequest({
      uri: "/global-components/navigate-cms",
      args: { caseId: "123", target: "modern" },
      variables: { ieaction: "nonie+configurable+", args: "caseId=123&target=modern" },
      headersIn: { "X-Forwarded-Proto": "https", Host: "localhost:8080", Cookie: SESSION_HINT_COOKIE },
    })
    vnext.handleNavigateCms(r)
    assertEqual(r.returnCode, 302, "Should return 302")
    assertEqual(r.headersOut["X-InternetExplorerMode"], "1", "Should set IE mode header")
    assert(r.returnBody.includes("caseId=123&target=modern&cmsDomain=foo.cps.gov.uk"), `Should preserve args and add cmsDomain, got: ${r.returnBody}`)
  })

  await test("IE + configurable (modern): serves the MODERN_CMS page, not the Classic iframe", async () => {
    const r = createMockRequest({
      uri: "/global-components/navigate-cms",
      args: { caseId: "123", target: "modern", cmsDomain: "foo.cps.gov.uk" },
      variables: { ieaction: "ie+configurable+" },
      headersIn: { "X-Forwarded-Proto": "https", Host: "localhost:8080" },
    })
    vnext.handleNavigateCms(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    const body = r.returnBody
    assert(!body.includes("Notification.html"), `Should not drive Classic, got: ${body}`)
    assert(body.includes("window.open('', 'MODERN_CMS')"), `Should find the MODERN_CMS window, got: ${body}`)
    assert(body.includes("'https://foo.cps.gov.uk/viewer/landing#/case-summary/123'"), `Should target Modern on cmsDomain, got: ${body}`)
    assert(body.includes("/global-components/navigate-cms?step=close"), `Should close via the close phase, got: ${body}`)
    assert(body.includes("Opening case in CMS Modern"), `Should have Modern heading, got: ${body}`)
  })

  await test("non-configurable (modern): serves the MODERN_CMS page directly using the cookie domain", async () => {
    const r = createMockRequest({
      uri: "/global-components/navigate-cms",
      args: { caseId: "123", target: "modern" },
      variables: { ieaction: "nonie+nonconfigurable+" },
      headersIn: { "X-Forwarded-Proto": "https", Host: "localhost:8080", Cookie: SESSION_HINT_COOKIE },
    })
    vnext.handleNavigateCms(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assert(r.returnBody.includes("'https://foo.cps.gov.uk/viewer/landing#/case-summary/123'"), `Should target Modern on cookie domain, got: ${r.returnBody}`)
  })

  await test("IE + configurable (modern): non-numeric caseId returns 400", async () => {
    const r = createMockRequest({
      uri: "/global-components/navigate-cms",
      args: { caseId: "123';alert(1);'", target: "modern", cmsDomain: "foo.cps.gov.uk" },
      variables: { ieaction: "ie+configurable+" },
      headersIn: { "X-Forwarded-Proto": "https", Host: "localhost:8080" },
    })
    vnext.handleNavigateCms(r)
    assertEqual(r.returnCode, 400, "Should return 400")
    assert(!r.returnBody.includes("alert"), `Should not echo the input, got: ${r.returnBody}`)
  })

  await test("IE + configurable (modern): cmsDomain that isn't a bare host returns 400", async () => {
    const r = createMockRequest({
      uri: "/global-components/navigate-cms",
      args: { caseId: "123", target: "modern", cmsDomain: "foo.cps.gov.uk/';alert(1);'" },
      variables: { ieaction: "ie+configurable+" },
      headersIn: { "X-Forwarded-Proto": "https", Host: "localhost:8080" },
    })
    vnext.handleNavigateCms(r)
    assertEqual(r.returnCode, 400, "Should return 400")
    assert(!r.returnBody.includes("alert"), `Should not echo the input, got: ${r.returnBody}`)
  })

  console.log("\nhandleNavigateCms (close phase):")

  await test("IE + configurable close: redirects to self with IE mode off", async () => {
    const r = createMockRequest({
      uri: "/global-components/navigate-cms",
      args: { step: "close" },
      variables: { ieaction: "ie+configurable+" },
      headersIn: { "X-Forwarded-Proto": "https", Host: "localhost:8080" },
    })
    vnext.handleNavigateCms(r)
    assertEqual(r.returnCode, 302, "Should return 302")
    assertEqual(r.headersOut["X-InternetExplorerMode"], "0", "Should set IE mode to 0")
    assert(r.returnBody.includes("/global-components/navigate-cms?step=close"), `Should redirect to self with step=close, got: ${r.returnBody}`)
  })

  await test("non-IE (Edge) close: serves window.close script", async () => {
    const r = createMockRequest({
      uri: "/global-components/navigate-cms",
      args: { step: "close" },
      variables: { ieaction: "nonie+configurable+" },
      headersIn: { "X-Forwarded-Proto": "https", Host: "localhost:8080" },
    })
    vnext.handleNavigateCms(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assert(r.returnBody.includes("window.close()"), `Should contain window.close(), got: ${r.returnBody}`)
  })

  await test("close with non-configurable: serves window.close script", async () => {
    const r = createMockRequest({
      uri: "/global-components/navigate-cms",
      args: { step: "close" },
      variables: { ieaction: "nonie+nonconfigurable+" },
      headersIn: { "X-Forwarded-Proto": "https", Host: "localhost:8080" },
    })
    vnext.handleNavigateCms(r)
    assertEqual(r.returnCode, 200, "Should return 200")
    assert(r.returnBody.includes("window.close()"), `Should contain window.close(), got: ${r.returnBody}`)
  })

  // --- handleCaseReviewRedirect tests ---
  // ===========================================================================
  // The additions: JSONP and ?set= on the state route
  // ===========================================================================

  // --- main's contract, which we must not change -----------------------------
  // These four pin the behaviour we COPIED from Polaris's handleState. They are
  // the reason the preview app and the web components cannot tell who answered,
  // and the reason this route can be handed back by deleting one location block.
  console.log("\nthe contract inherited from Polaris's handleState:")

  await test("GET with no cookie reports null, not an error", async () => {
    const r = createStateRequest()
    await vnext.handleState(r)
    assertEqual(r.returnCode, 200, "code")
    assertEqual(r.returnBody, "null", "body")
  })

  await test("GET unwraps the base64url cookie", async () => {
    const r = createStateRequest({ cookie: `${COOKIE}=${b64url(PREVIEW)}` })
    await vnext.handleState(r)
    assertEqual(r.returnBody, PREVIEW, "body")
  })

  // A bad cookie must read as "no preview", never as a failed request — a user
  // with a corrupt cookie should lose their preview, not their page.
  //
  // THIS CAUGHT A REAL HOLE, inherited from main. _unwrapState relies on its
  // try/catch, but Buffer.from(junk, "base64") does not throw: it drops the
  // characters it cannot read and decodes the rest, so junk escaped as mojibake.
  // Harmless where the caller parses JSON; not harmless here, where the same
  // value is also served as JSONP and EVALUATED inside a <script> tag. Hence the
  // re-serialise-from-a-parse in _readState, and hence these two.
  await test("GET reports null for a corrupt cookie rather than failing", async () => {
    const r = createStateRequest({ cookie: `${COOKIE}=!!!not-base64!!!` })
    await vnext.handleState(r)
    assertEqual(r.returnCode, 200, "code")
    assertEqual(r.returnBody, "null", "body")
  })

  // The one that would reach a <script> tag: base64 that decodes cleanly but is
  // not JSON at all. The plain GET passes it through, exactly as Polaris's
  // handleState does (its contract, which this copy must not change)...
  await test("plain GET passes a decodable non-JSON cookie through, as Polaris's does", async () => {
    const r = createStateRequest({ cookie: `${COOKIE}=${b64url("alert(1)")}` })
    await vnext.handleState(r)
    assertEqual(r.returnBody, "alert(1)", "body")
  })

  // ...but the JSONP body is evaluated, so it re-serialises and collapses to null.
  await test("the JSONP read cannot emit a non-JSON body", async () => {
    const r = createStateRequest({ cookie: `${COOKIE}=${b64url("alert(1)")}`, args: { callback: "cb" } })
    await vnext.handleState(r)
    assertEqual(r.returnBody, "cb(null)", "body")
  })

  // A well-formed cookie must still round-trip byte-identically — that is what
  // keeps us a faithful copy of main's read despite being stricter above.
  await test("a well-formed cookie is unchanged by the stricter read", async () => {
    const nested = '{"caseLocking":true,"caseMarkers":"b","newHeader":"gds"}'
    const r = createStateRequest({ cookie: `${COOKIE}=${b64url(nested)}` })
    await vnext.handleState(r)
    assertEqual(r.returnBody, nested, "byte-identical")
  })

  await test("PUT wraps the body and scopes the cookie to this exact path", async () => {
    const r = createStateRequest({ method: "PUT", requestText: PREVIEW })
    await vnext.handleState(r)
    assertEqual(r.returnCode, 200, "code")
    assertEqual(cookieValueOf(r), b64url(PREVIEW), "wrapped value")
    assert(setCookieOf(r).includes(`Path=${STATE_PATH}`), setCookieOf(r))
    assert(setCookieOf(r).includes("Secure"), setCookieOf(r))
    assert(setCookieOf(r).includes("SameSite=None"), setCookieOf(r))
  })

  // "null" is how the preview app turns everything off — main's PUT treats it and
  // an empty body as a clear, so ours must too.
  await test("PUT of null clears the cookie", async () => {
    const r = createStateRequest({ method: "PUT", requestText: "null" })
    await vnext.handleState(r)
    assertEqual(cookieValueOf(r), "", "empty value")
    assert(setCookieOf(r).includes("Expires=Thu, 01 Jan 1970"), setCookieOf(r))
  })

  await test("an unsupported method is refused", async () => {
    const r = createStateRequest({ method: "DELETE" })
    await vnext.handleState(r)
    assertEqual(r.returnCode, 405, "code")
  })

  // --- the JSONP read -------------------------------------------------------
  // Document mode 5 has no JSON, and the IE "access data sources across domains"
  // zone forbids cross-origin XHR but not <script src>. A JSONP body is
  // EVALUATED, so Classic gets a real object for free.
  console.log("\nthe JSONP read, for document mode 5:")

  await test("wraps the same JSON in the callback", async () => {
    const r = createStateRequest({ cookie: `${COOKIE}=${b64url(PREVIEW)}`, args: { callback: "cb" } })
    await vnext.handleState(r)
    assertEqual(r.returnBody, `cb(${PREVIEW})`, "body")
    assert(String(r.headersOut["Content-Type"]).includes("javascript"), "content type")
  })

  // The legacy clients' first call repeats the same URL on every page load, so a
  // cacheable answer keeps serving flags the cookie no longer holds.
  await test("forbids caching, so IE mode never reuses an old answer", async () => {
    const r = createStateRequest({ cookie: `${COOKIE}=${b64url(PREVIEW)}`, args: { callback: "cb" } })
    await vnext.handleState(r)
    assertEqual(r.headersOut["Cache-Control"], "no-store", "Cache-Control")
  })

  await test("yields cb(null) when there is no preview, so the client still settles", async () => {
    const r = createStateRequest({ args: { callback: "cb" } })
    await vnext.handleState(r)
    assertEqual(r.returnBody, "cb(null)", "body")
  })

  // The callback name is interpolated into a script body, so anything but an
  // identifier is an injection point.
  await test("refuses a callback name that is not an identifier", async () => {
    const r = createStateRequest({ args: { callback: "alert(1)" } })
    await vnext.handleState(r)
    assertEqual(r.returnCode, 400, "code")
  })

  // --- the ?set= navigation: the dual-jar write -----------------------------
  console.log("\nthe ?set= navigation, which writes both cookie jars:")

  const setRequest = (args, ieaction) =>
    createStateRequest({ uri: STATE_PATH, args, ieaction })

  await test("first pass in Edge writes its jar and hands over to IE", async () => {
    const r = setRequest(
      { set: encodeURIComponent(PREVIEW), return: encodeURIComponent("/global-components/test/preview/") },
      "nonie+configurable+",
    )
    await vnext.handleState(r)
    assertEqual(cookieValueOf(r), b64url(PREVIEW), "Edge jar written")
    assertEqual(r.headersOut["X-InternetExplorerMode"], "1", "flip to IE")
    assertEqual(r.returnCode, 302, "code")
    assert(r.returnBody.endsWith("&done=edge"), `hop: ${r.returnBody}`)
  })

  await test("second pass in IE writes its jar and returns to the preview app", async () => {
    const r = setRequest(
      {
        set: encodeURIComponent(PREVIEW),
        return: encodeURIComponent("/global-components/test/preview/"),
        done: "edge",
      },
      "ie+configurable+",
    )
    await vnext.handleState(r)
    assertEqual(cookieValueOf(r), b64url(PREVIEW), "IE jar written")
    assertEqual(r.headersOut["X-InternetExplorerMode"], "0", "flip back to Edge")
    assertEqual(r.returnCode, 302, "code")
    assertEqual(r.returnBody, "/global-components/test/preview/", "returned")
  })

  // THE TERMINATION PROPERTY. Without `done` this is an infinite redirect: each
  // engine would hand back to the other forever.
  await test("the chain terminates — a pass carrying done never hands over again", async () => {
    const r = setRequest({ set: encodeURIComponent(PREVIEW), return: "%2F", done: "edge" }, "ie+configurable+")
    await vnext.handleState(r)
    assert(!r.returnBody.includes("done="), `should not hop again: ${r.returnBody}`)
  })

  await test("starting in IE hands over to Edge instead", async () => {
    const r = setRequest({ set: encodeURIComponent(PREVIEW), return: "%2F" }, "ie+configurable+")
    await vnext.handleState(r)
    assertEqual(r.headersOut["X-InternetExplorerMode"], "0", "flip to Edge")
    assert(r.returnBody.endsWith("&done=ie"), `hop: ${r.returnBody}`)
  })

  // THE PARTIAL SUCCESS. A site Edge will not let us flip gets ONE jar, and the
  // other engine will never see this preview. It cannot be fixed here, so it is
  // logged — otherwise "my preview did not apply in Classic" is indistinguishable
  // from a bug anywhere else in the chain.
  await test("a site that cannot flip writes one jar, does not hop, and says so", async () => {
    const r = setRequest({ set: encodeURIComponent(PREVIEW), return: "%2F" }, "nonie+nonconfigurable+")
    await vnext.handleState(r)
    assertEqual(cookieValueOf(r), b64url(PREVIEW), "its own jar still written")
    assertEqual(r.headersOut["X-InternetExplorerMode"], undefined, "no flip attempted")
    assertEqual(r.returnCode, 302, "code")
    assertEqual(r.returnBody, "/", "straight back")
    assert(
      logged.some((l) => l.includes("cannot flip")),
      `expected a partial-write log line, got: ${JSON.stringify(logged)}`,
    )
  })

  await test("both jars written is reported as such", async () => {
    const r = setRequest({ set: encodeURIComponent(PREVIEW), return: "%2F", done: "edge" }, "ie+configurable+")
    await vnext.handleState(r)
    assert(
      logged.some((l) => l.includes("jars=both")),
      `expected a both-jars log line, got: ${JSON.stringify(logged)}`,
    )
  })

  await test("set=null clears the cookie in both jars", async () => {
    const r = setRequest({ set: "null", return: "%2F", done: "edge" }, "ie+configurable+")
    await vnext.handleState(r)
    assertEqual(cookieValueOf(r), "", "cleared")
    assert(setCookieOf(r).includes("Expires=Thu, 01 Jan 1970"), setCookieOf(r))
  })

  // The return target is attacker-supplied in principle, so it is confined to
  // same-host absolute paths — the same guard the OS-host switch uses.
  console.log("\nwhere ?set= is willing to send you afterwards:")

  await test("an off-site return is refused and becomes /", async () => {
    const r = setRequest(
      { set: encodeURIComponent(PREVIEW), return: encodeURIComponent("https://evil.example/x"), done: "edge" },
      "ie+configurable+",
    )
    await vnext.handleState(r)
    assertEqual(r.returnBody, "/", "forced home")
  })

  // The one an "is it absolute?" check gets wrong: //host is protocol-relative
  // and navigates off-origin despite starting with a slash.
  await test("a protocol-relative return is refused too", async () => {
    const r = setRequest(
      { set: encodeURIComponent(PREVIEW), return: encodeURIComponent("//evil.example/x"), done: "edge" },
      "ie+configurable+",
    )
    await vnext.handleState(r)
    assertEqual(r.returnBody, "/", "forced home")
  })

  await test("a missing return becomes /", async () => {
    const r = setRequest({ set: encodeURIComponent(PREVIEW), done: "edge" }, "ie+configurable+")
    await vnext.handleState(r)
    assertEqual(r.returnBody, "/", "forced home")
  })

  // --- the round trip -------------------------------------------------------
  // The point of the whole exercise: what ?set= writes is what the JSONP read
  // hands to Classic.
  console.log("\nend to end:")

  await test("what ?set= writes is what the JSONP read gives back", async () => {
    const write = setRequest({ set: encodeURIComponent(PREVIEW), return: "%2F", done: "edge" }, "ie+configurable+")
    await vnext.handleState(write)
    const stored = cookieValueOf(write)

    const read = createStateRequest({ cookie: `${COOKIE}=${stored}`, args: { callback: "cb" } })
    await vnext.handleState(read)
    assertEqual(read.returnBody, `cb(${PREVIEW})`, "round trip")
  })

  console.log("\nUTF-8 state (OURS: Polaris's btoa/atob throw above U+00FF):")

  await test("PUT then GET round-trips non-Latin1 text", async () => {
    const value = JSON.stringify({ note: "Café — ✓ 测试" })
    const put = createStateRequest({ method: "PUT", requestText: value })
    await vnext.handleState(put)
    assertEqual(put.returnCode, 200, "PUT code")
    const stored = cookieValueOf(put)
    assertEqual(stored, b64url(value), "stored as UTF-8 base64url")
    const get = createStateRequest({ cookie: `${COOKIE}=${stored}` })
    await vnext.handleState(get)
    assertEqual(get.returnBody, value, "GET body")
    const jsonp = createStateRequest({ cookie: `${COOKIE}=${stored}`, args: { callback: "cb" } })
    await vnext.handleState(jsonp)
    assertEqual(jsonp.returnBody, `cb(${value})`, "JSONP body")
  })

  await test("?set= writes non-Latin1 text too", async () => {
    const value = JSON.stringify({ note: "Café — ✓" })
    const r = createStateRequest({ args: { set: encodeURIComponent(value), return: "%2F" } })
    await vnext.handleState(r)
    assertEqual(cookieValueOf(r), b64url(value), "stored")
  })

  // ===========================================================================
  // Swagger
  // ===========================================================================

  console.log("\nfilterSwaggerBody:")

  await test("replaces upstream URL with the proxied /api route", async () => {
    const r = createMockRequest({
      headersIn: { Host: "proxy.example.com" },
    })
    const data = '{"server": "http://mock-upstream:3000/api/"}'
    vnext.filterSwaggerBody(r, data, {})
    assert(
      r.sentBuffer.includes("https://proxy.example.com/global-components/api"),
      `Should replace upstream URL, got: ${r.sentBuffer}`
    )
  })

  await test("replaces upstream URL without trailing slash", async () => {
    // WM_MDS_BASE_URL has trailing slash but swagger JSON may not
    const r = createMockRequest({
      headersIn: { Host: "proxy.example.com" },
    })
    const data = '{"url": "http://mock-upstream:3000/api"}'
    vnext.filterSwaggerBody(r, data, {})
    assert(
      r.sentBuffer.includes("https://proxy.example.com/global-components/api"),
      `Should replace upstream URL without trailing slash, got: ${r.sentBuffer}`
    )
    assert(
      !r.sentBuffer.includes("mock-upstream"),
      `Should not contain original URL, got: ${r.sentBuffer}`
    )
  })

  await test("leaves operation paths untouched", async () => {
    // swagger-ui joins these onto the rewritten server url itself. Rewriting
    // them here too would produce /global-components/api/global-components/...
    const r = createMockRequest({
      headersIn: { Host: "proxy.example.com" },
    })
    const data = '{"paths": {"/authenticate": {}}}'
    vnext.filterSwaggerBody(r, data, {})
    assert(
      r.sentBuffer.includes('"/authenticate"'),
      `Operation path should survive verbatim, got: ${r.sentBuffer}`
    )
    assert(
      !r.sentBuffer.includes("/global-components/authenticate"),
      `Operation path should not be prefixed, got: ${r.sentBuffer}`
    )
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
    console.error("Test run failed:", err.message)
    process.exit(1)
  }
})()
