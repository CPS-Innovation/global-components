#!/usr/bin/env npx ts-node
/**
 * Unit tests for global-components.cms-auth-presence.ts — the PREVIEW STATE route.
 *
 * Scope is deliberately narrow: handleStatePreview and its ?set= navigation. The
 * auth flow and the presence adapter in the same module are covered by the Docker
 * integration test next door, because they need an upstream to talk to; this file
 * exists because the ?set= chain is a state machine over $ieaction and `done`, and
 * a state machine wants unit tests rather than a browser.
 *
 * WHAT THE CHAIN IS FOR. The preview app writes its cookie from Edge with a fetch
 * PUT. The legacy clients (CMS Classic at document mode 5, Modern/DCF at 11) read
 * the WinINet jar, which that PUT never touches — the engine is chosen by the
 * X-InternetExplorerMode response header on a TOP-LEVEL navigation, so no XHR and
 * no iframe can cross. ?set= is that navigation: two passes over the same URL,
 * one cookie written per engine, `done` stopping the second pass from bouncing
 * back again.
 *
 * Uses esbuild to bundle the njs module, then runs the tests against the bundle —
 * the same approach as the other module unit tests here.
 */

import * as esbuild from "esbuild"
import * as path from "path"
import * as fs from "fs"

const CONFIG_DIR = path.join(__dirname, "..", "..")
const MODULE_DIR = path.join(CONFIG_DIR, "global-components.cms-auth-presence")
const DIST_DIR = path.join(CONFIG_DIR, "..", ".dist")

if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true })
}

const STATE_PATH = "/global-components/state/preview"
const COOKIE = "cps-global-components-state"

interface MockRequest {
  method: string
  uri: string
  requestText?: string
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
  requestText?: string
  args?: Record<string, string>
  cookie?: string
  ieaction?: string
}

interface AuthPresenceModule {
  handleStatePreview(r: MockRequest): Promise<void>
  handlePresenceJsonp(r: MockRequest): Promise<void>
}

async function build(): Promise<void> {
  await esbuild.build({
    entryPoints: [path.join(MODULE_DIR, "global-components.cms-auth-presence.ts")],
    bundle: true,
    outfile: path.join(DIST_DIR, "global-components.cms-auth-presence.bundle.js"),
    format: "esm",
    platform: "node",
    logLevel: "error",
  })
}

async function runTests(): Promise<void> {
  // The module only touches ngx inside handlers, so stubbing it here is enough.
  // Collected rather than discarded: the "which jars did I write" line is the
  // only signal that a non-configurable site got a partial write, so it is worth
  // asserting on.
  const logged: string[] = []
  ;(globalThis as Record<string, unknown>).ngx = {
    WARN: 4,
    log: (_level: number, msg: string) => {
      logged.push(msg)
    },
  }

  const module = await import(path.join(DIST_DIR, "global-components.cms-auth-presence.bundle.js"))
  const mod: AuthPresenceModule = module.default

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
    logged.length = 0
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

  // _getQueryParam reads $arg_<name>, so query args go in `variables` as the
  // RAW (still percent-encoded) values nginx would expose.
  function createMockRequest(options: MockRequestOptions = {}): MockRequest {
    const variables: Record<string, string> = {
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
      return(code: number, body: string) {
        this.returnCode = code
        this.returnBody = body
      },
    }
  }

  const b64url = (s: string) =>
    Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

  const setCookieOf = (r: MockRequest) => String(r.headersOut["Set-Cookie"] || "")
  const cookieValueOf = (r: MockRequest) => setCookieOf(r).split(";")[0].split("=").slice(1).join("=")

  const PREVIEW = '{"caseLocking":true}'

  console.log("=".repeat(60))
  console.log("global-components.cms-auth-presence.js — preview state route")
  console.log("=".repeat(60))

  // --- main's contract, which we must not change -----------------------------
  // These four pin the behaviour we COPIED from Polaris's handleState. They are
  // the reason the preview app and the web components cannot tell who answered,
  // and the reason this route can be handed back by deleting one location block.
  console.log("\nthe contract inherited from Polaris's handleState:")

  await test("GET with no cookie reports null, not an error", async () => {
    const r = createMockRequest()
    await mod.handleStatePreview(r)
    assertEqual(r.returnCode, 200, "code")
    assertEqual(r.returnBody, "null", "body")
  })

  await test("GET unwraps the base64url cookie", async () => {
    const r = createMockRequest({ cookie: `${COOKIE}=${b64url(PREVIEW)}` })
    await mod.handleStatePreview(r)
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
    const r = createMockRequest({ cookie: `${COOKIE}=!!!not-base64!!!` })
    await mod.handleStatePreview(r)
    assertEqual(r.returnCode, 200, "code")
    assertEqual(r.returnBody, "null", "body")
  })

  // The one that would reach a <script> tag: base64 that decodes cleanly but is
  // not JSON at all.
  await test("GET reports null for a cookie that decodes but is not JSON", async () => {
    const r = createMockRequest({ cookie: `${COOKIE}=${b64url("alert(1)")}` })
    await mod.handleStatePreview(r)
    assertEqual(r.returnBody, "null", "body")
  })

  await test("and the JSONP read cannot emit a non-JSON body either", async () => {
    const r = createMockRequest({ cookie: `${COOKIE}=${b64url("alert(1)")}`, args: { callback: "cb" } })
    await mod.handleStatePreview(r)
    assertEqual(r.returnBody, "cb(null)", "body")
  })

  // A well-formed cookie must still round-trip byte-identically — that is what
  // keeps us a faithful copy of main's read despite being stricter above.
  await test("a well-formed cookie is unchanged by the stricter read", async () => {
    const nested = '{"caseLocking":true,"caseMarkers":"b","newHeader":"gds"}'
    const r = createMockRequest({ cookie: `${COOKIE}=${b64url(nested)}` })
    await mod.handleStatePreview(r)
    assertEqual(r.returnBody, nested, "byte-identical")
  })

  await test("PUT wraps the body and scopes the cookie to this exact path", async () => {
    const r = createMockRequest({ method: "PUT", requestText: PREVIEW })
    await mod.handleStatePreview(r)
    assertEqual(r.returnCode, 200, "code")
    assertEqual(cookieValueOf(r), b64url(PREVIEW), "wrapped value")
    assert(setCookieOf(r).includes(`Path=${STATE_PATH}`), setCookieOf(r))
    assert(setCookieOf(r).includes("Secure"), setCookieOf(r))
    assert(setCookieOf(r).includes("SameSite=None"), setCookieOf(r))
  })

  // "null" is how the preview app turns everything off — main's PUT treats it and
  // an empty body as a clear, so ours must too.
  await test("PUT of null clears the cookie", async () => {
    const r = createMockRequest({ method: "PUT", requestText: "null" })
    await mod.handleStatePreview(r)
    assertEqual(cookieValueOf(r), "", "empty value")
    assert(setCookieOf(r).includes("Expires=Thu, 01 Jan 1970"), setCookieOf(r))
  })

  await test("an unsupported method is refused", async () => {
    const r = createMockRequest({ method: "DELETE" })
    await mod.handleStatePreview(r)
    assertEqual(r.returnCode, 405, "code")
  })

  // --- the JSONP read -------------------------------------------------------
  // Document mode 5 has no JSON, and the IE "access data sources across domains"
  // zone forbids cross-origin XHR but not <script src>. A JSONP body is
  // EVALUATED, so Classic gets a real object for free.
  console.log("\nthe JSONP read, for document mode 5:")

  await test("wraps the same JSON in the callback", async () => {
    const r = createMockRequest({ cookie: `${COOKIE}=${b64url(PREVIEW)}`, args: { callback: "cb" } })
    await mod.handleStatePreview(r)
    assertEqual(r.returnBody, `cb(${PREVIEW})`, "body")
    assert(String(r.headersOut["Content-Type"]).includes("javascript"), "content type")
  })

  await test("yields cb(null) when there is no preview, so the client still settles", async () => {
    const r = createMockRequest({ args: { callback: "cb" } })
    await mod.handleStatePreview(r)
    assertEqual(r.returnBody, "cb(null)", "body")
  })

  // The callback name is interpolated into a script body, so anything but an
  // identifier is an injection point.
  await test("refuses a callback name that is not an identifier", async () => {
    const r = createMockRequest({ args: { callback: "alert(1)" } })
    await mod.handleStatePreview(r)
    assertEqual(r.returnCode, 400, "code")
  })

  // --- the ?set= navigation: the dual-jar write -----------------------------
  console.log("\nthe ?set= navigation, which writes both cookie jars:")

  const setRequest = (args: Record<string, string>, ieaction: string) =>
    createMockRequest({ uri: STATE_PATH, args, ieaction })

  await test("first pass in Edge writes its jar and hands over to IE", async () => {
    const r = setRequest(
      { set: encodeURIComponent(PREVIEW), return: encodeURIComponent("/global-components/test/preview/") },
      "nonie+configurable+",
    )
    await mod.handleStatePreview(r)
    assertEqual(cookieValueOf(r), b64url(PREVIEW), "Edge jar written")
    assertEqual(r.headersOut["X-InternetExplorerMode"], "1", "flip to IE")
    assertEqual(r.returnCode, 302, "code")
    assert(r.returnBody!.endsWith("&done=edge"), `hop: ${r.returnBody}`)
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
    await mod.handleStatePreview(r)
    assertEqual(cookieValueOf(r), b64url(PREVIEW), "IE jar written")
    assertEqual(r.headersOut["X-InternetExplorerMode"], "0", "flip back to Edge")
    assertEqual(r.returnCode, 302, "code")
    assertEqual(r.returnBody, "/global-components/test/preview/", "returned")
  })

  // THE TERMINATION PROPERTY. Without `done` this is an infinite redirect: each
  // engine would hand back to the other forever.
  await test("the chain terminates — a pass carrying done never hands over again", async () => {
    const r = setRequest({ set: encodeURIComponent(PREVIEW), return: "%2F", done: "edge" }, "ie+configurable+")
    await mod.handleStatePreview(r)
    assert(!r.returnBody!.includes("done="), `should not hop again: ${r.returnBody}`)
  })

  await test("starting in IE hands over to Edge instead", async () => {
    const r = setRequest({ set: encodeURIComponent(PREVIEW), return: "%2F" }, "ie+configurable+")
    await mod.handleStatePreview(r)
    assertEqual(r.headersOut["X-InternetExplorerMode"], "0", "flip to Edge")
    assert(r.returnBody!.endsWith("&done=ie"), `hop: ${r.returnBody}`)
  })

  // THE PARTIAL SUCCESS. A site Edge will not let us flip gets ONE jar, and the
  // other engine will never see this preview. It cannot be fixed here, so it is
  // logged — otherwise "my preview did not apply in Classic" is indistinguishable
  // from a bug anywhere else in the chain.
  await test("a site that cannot flip writes one jar, does not hop, and says so", async () => {
    const r = setRequest({ set: encodeURIComponent(PREVIEW), return: "%2F" }, "nonie+nonconfigurable+")
    await mod.handleStatePreview(r)
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
    await mod.handleStatePreview(r)
    assert(
      logged.some((l) => l.includes("jars=both")),
      `expected a both-jars log line, got: ${JSON.stringify(logged)}`,
    )
  })

  await test("set=null clears the cookie in both jars", async () => {
    const r = setRequest({ set: "null", return: "%2F", done: "edge" }, "ie+configurable+")
    await mod.handleStatePreview(r)
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
    await mod.handleStatePreview(r)
    assertEqual(r.returnBody, "/", "forced home")
  })

  // The one an "is it absolute?" check gets wrong: //host is protocol-relative
  // and navigates off-origin despite starting with a slash.
  await test("a protocol-relative return is refused too", async () => {
    const r = setRequest(
      { set: encodeURIComponent(PREVIEW), return: encodeURIComponent("//evil.example/x"), done: "edge" },
      "ie+configurable+",
    )
    await mod.handleStatePreview(r)
    assertEqual(r.returnBody, "/", "forced home")
  })

  await test("a missing return becomes /", async () => {
    const r = setRequest({ set: encodeURIComponent(PREVIEW), done: "edge" }, "ie+configurable+")
    await mod.handleStatePreview(r)
    assertEqual(r.returnBody, "/", "forced home")
  })

  // --- the round trip -------------------------------------------------------
  // The point of the whole exercise: what ?set= writes is what the JSONP read
  // hands to Classic.
  console.log("\nend to end:")

  await test("what ?set= writes is what the JSONP read gives back", async () => {
    const write = setRequest({ set: encodeURIComponent(PREVIEW), return: "%2F", done: "edge" }, "ie+configurable+")
    await mod.handleStatePreview(write)
    const stored = cookieValueOf(write)

    const read = createMockRequest({ cookie: `${COOKIE}=${stored}`, args: { callback: "cb" } })
    await mod.handleStatePreview(read)
    assertEqual(read.returnBody, `cb(${PREVIEW})`, "round trip")
  })

  // ---------------------------------------------------------------------------
  // whoami's group IDs. Answered locally from the presence cookie — no upstream —
  // so unlike the rest of the adapter it can be tested here.
  // ---------------------------------------------------------------------------
  console.log("\nwhoami groups:")

  const b64urlJson = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  const fakeJwt = (claims: Record<string, unknown>) => `${b64urlJson({ alg: "none" })}.${b64urlJson(claims)}.sig`
  const GNAV = "12377eca-b463-4a6c-80ea-95f678f09591"

  async function whoami(cookie?: string): Promise<Record<string, unknown>> {
    const r = createMockRequest({ uri: "/global-components/presence-jsonp", cookie, args: { callback: "cb", op: "whoami" } })
    await mod.handlePresenceJsonp(r)
    const body = r.returnBody || ""
    assert(body.indexOf("cb(") === 0 && body.endsWith(")"), `JSONP shape: ${body}`)
    return JSON.parse(body.slice(3, -1))
  }

  await test("reports the groups the token carries", async () => {
    const data = await whoami(`cms-auth-presence-token=${fakeJwt({ preferred_username: "a@cps.gov.uk", groups: [GNAV] })}`)
    assertEqual(JSON.stringify(data.groups), JSON.stringify([GNAV]), "groups")
  })

  // ApplicationGroup emits only assigned groups, so "none" is the ordinary answer
  // for someone outside every assigned group — and must read as an empty list.
  await test("an empty list when the token has no groups claim", async () => {
    const data = await whoami(`cms-auth-presence-token=${fakeJwt({ preferred_username: "a@cps.gov.uk" })}`)
    assertEqual(JSON.stringify(data.groups), "[]", "no claim")
  })

  await test("an empty list when there is no token at all", async () => {
    const data = await whoami()
    assertEqual(JSON.stringify(data.groups), "[]", "no cookie")
  })

  await test("an empty list when groups is not an array", async () => {
    const data = await whoami(`cms-auth-presence-token=${fakeJwt({ groups: GNAV })}`)
    assertEqual(JSON.stringify(data.groups), "[]", "string, not array")
  })

  // The list is reflected into an executable JSONP body. Only GUIDs get through.
  await test("drops anything that is not a GUID", async () => {
    const data = await whoami(`cms-auth-presence-token=${fakeJwt({ groups: [GNAV, "</script><script>alert(1)", 42, null] })}`)
    assertEqual(JSON.stringify(data.groups), JSON.stringify([GNAV]), "junk filtered")
  })

  await test("lower-cases IDs so a client compares like with like", async () => {
    const data = await whoami(`cms-auth-presence-token=${fakeJwt({ groups: [GNAV.toUpperCase()] })}`)
    assertEqual(JSON.stringify(data.groups), JSON.stringify([GNAV]), "lower-cased")
  })

  // The log is a different audience from the response: op and environment only.
  await test("never logs a group ID", async () => {
    await whoami(`cms-auth-presence-token=${fakeJwt({ groups: [GNAV] })}`)
    assert(!logged.some((l) => l.indexOf(GNAV) !== -1), `logged: ${logged.join(" | ")}`)
  })

  console.log()
  console.log("=".repeat(60))
  console.log(`Results: ${passed} passed, ${failed} failed`)
  console.log("=".repeat(60))

  if (failed > 0) {
    process.exit(1)
  }
}

build()
  .then(runTests)
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
