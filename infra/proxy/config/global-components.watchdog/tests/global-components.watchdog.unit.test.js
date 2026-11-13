#!/usr/bin/env node
/**
 * Build and run unit tests for global-components.watchdog.js — the SignalR hub
 * route's filters and js_sets, and the presence-jsonp adapter.
 *
 * Loads the njs source with njs-loader.js (an .mjs copy, no bundler).
 */

const path = require("path")
const { loadNjs } = require("../../../njs-loader")

const fs = require("fs")
const CONFIG_DIR = path.join(__dirname, "..", "..")
const MODULE_DIR = path.join(CONFIG_DIR, "global-components.watchdog")

async function runTests() {
  // The module only touches ngx inside handlers, so stubbing it here is enough.
  // Logs are collected so tests can assert what must NOT be logged; fetches are
  // recorded and answered from `fetchReply`.
  const logged = []
  const fetches = []
  let fetchReply = { status: 200, text: "{}" }
  ;globalThis.ngx = {
    WARN: 4,
    ERR: 3,
    log: (_level, msg) => {
      logged.push(msg)
    },
    fetch: async (url, opts) => {
      fetches.push({ url, opts })
      return { status: fetchReply.status, text: async () => fetchReply.text }
    },
  }

  const modulePath = path.join(MODULE_DIR, "global-components.watchdog.js")
  const watchdog = await loadNjs(modulePath)

  let passed = 0
  let failed = 0

  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(
        `${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`
      )
    }
  }

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message)
    }
  }

  async function test(name, fn) {
    logged.length = 0
    fetches.length = 0
    fetchReply = { status: 200, text: "{}" }
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

  function createMockRequest(
    uri,
    opts
    = {}
  ) {
    return {
      uri,
      headersIn: { Host: "proxy.example.com", ...(opts.headersIn ?? {}) },
      headersOut: { ...(opts.headersOut ?? {}) },
      variables: { scheme: "https", host: "proxy.example.com", ...(opts.variables ?? {}) },
      args: { ...(opts.args ?? {}) },
      sentBuffer: null,
      sentFlags: null,
      sendBuffer(buffer, flags) {
        this.sentBuffer = buffer
        this.sentFlags = flags
      },
      returnCode: null,
      returnBody: null,
      return(code, body) {
        this.returnCode = code
        this.returnBody = body
      },
    }
  }

  console.log("=".repeat(60))
  console.log("global-components.watchdog.js Unit Tests")
  console.log("=".repeat(60))

  // ---- presenceBearer ------------------------------------------------------

  await test("presenceBearer lifts the presence cookie into a Bearer header", async () => {
    const r = createMockRequest("/global-components/case-locking/api/hubs/notifications", {
      headersIn: { Cookie: "foo=1; cms-auth-presence-token=abc.def.ghi; bar=2" },
    })
    assertEqual(watchdog.presenceBearer(r), "Bearer abc.def.ghi", "Should build the header from the cookie")
  })

  await test("presenceBearer url-decodes the cookie value", async () => {
    const r = createMockRequest("/global-components/case-locking/api/hubs/notifications", {
      headersIn: { Cookie: "cms-auth-presence-token=a%2Bb%2Fc" },
    })
    assertEqual(watchdog.presenceBearer(r), "Bearer a+b/c", "Should decode percent-encoding")
  })

  await test("presenceBearer returns empty when the cookie is absent", async () => {
    const r = createMockRequest("/global-components/case-locking/api/hubs/notifications", {
      headersIn: { Cookie: "other=1" },
    })
    assertEqual(watchdog.presenceBearer(r), "", "No cookie -> no header (nginx omits empty values)")
  })

  await test("presenceBearer returns empty when there is no Cookie header at all", async () => {
    const r = createMockRequest("/global-components/case-locking/api/hubs/notifications")
    assertEqual(watchdog.presenceBearer(r), "", "Missing Cookie header -> empty")
  })

  await test("presenceBearer is not fooled by a cookie whose name merely ends with ours", async () => {
    const r = createMockRequest("/global-components/case-locking/api/hubs/notifications", {
      headersIn: { Cookie: "not-cms-auth-presence-token=nope" },
    })
    assertEqual(watchdog.presenceBearer(r), "", "Suffix match must not count as the cookie")
  })

  await test("presenceBearer passes a client-supplied Authorization through untouched", async () => {
    const r = createMockRequest("/global-components/case-locking/api/hubs/notifications", {
      headersIn: { Authorization: "Bearer client.sent.token", Cookie: "cms-auth-presence-token=cookie.tok.en" },
    })
    assertEqual(
      watchdog.presenceBearer(r),
      "Bearer client.sent.token",
      "global-components sends its own MSAL token — it must NOT be replaced by the cookie"
    )
  })

  await test("presenceBearer passes the client header through when there is no cookie", async () => {
    const r = createMockRequest("/global-components/case-locking/api/hubs/notifications", {
      headersIn: { Authorization: "Bearer only.the.header" },
    })
    assertEqual(watchdog.presenceBearer(r), "Bearer only.the.header", "Must not strip a credential we cannot replace")
  })

  // ---- watchdogAppName -----------------------------------------------------

  await test("watchdogAppName passes a known application through", async () => {
    const r = createMockRequest("/global-components/case-locking/api/hubs/notifications", {
      args: { appName: "CMS Modern" },
    })
    assertEqual(watchdog.watchdogAppName(r), "CMS Modern", "Known name should be reported")
  })

  await test("watchdogAppName decodes percent-encoding", async () => {
    const r = createMockRequest("/global-components/case-locking/api/hubs/notifications", {
      args: { appName: "Work%20Management%20App" },
    })
    assertEqual(watchdog.watchdogAppName(r), "Work Management App", "Should decode before matching")
  })

  await test("watchdogAppName rejects an unknown application", async () => {
    const r = createMockRequest("/global-components/case-locking/api/hubs/notifications", {
      args: { appName: "Definitely Not An App" },
    })
    assertEqual(watchdog.watchdogAppName(r), "", "Unknown -> no header, never a passthrough")
  })

  await test("watchdogAppName rejects a header-injection attempt", async () => {
    const r = createMockRequest("/global-components/case-locking/api/hubs/notifications", {
      args: { appName: "CMS%20Modern%0d%0aX-Evil:%20yes" },
    })
    assertEqual(watchdog.watchdogAppName(r), "", "CRLF payload must not reach the header")
  })

  await test("watchdogAppName returns empty when the arg is absent", async () => {
    const r = createMockRequest("/global-components/case-locking/api/hubs/notifications")
    assertEqual(watchdog.watchdogAppName(r), "", "No arg -> no header")
  })

  // ---------------------------------------------------------------------------
  // Upstream hosts: process.env -> deploy-time baked token -> "". The settings are
  // read at module load, so each case loads its own copy of the module (njs-loader
  // writes a distinct file each time, so the import cache cannot hand back an earlier one).
  // ---------------------------------------------------------------------------
  const HOST_ENV = ["GLOBAL_COMPONENTS_WATCHDOG_HOST"]
  async function loadWith(env, bake = {}) {
    const saved = {}
    for (const k of HOST_ENV) {
      saved[k] = process.env[k]
      delete process.env[k]
    }
    Object.assign(process.env, env)
    try {
      return await loadNjs(modulePath, (code) =>
        Object.entries(bake).reduce((c, [k, v]) => c.split("@@" + k + "@@").join(v), code),
      )
    } finally {
      for (const k of HOST_ENV) {
        if (saved[k] === undefined) {
          delete process.env[k]
        } else {
          process.env[k] = saved[k]
        }
      }
    }
  }
  const hostReq = () => createMockRequest("/global-components/case-locking/api/hubs/notifications")

  await test("the host is empty when neither app setting nor baked value exists", async () => {
    const m = await loadWith({})
    assertEqual(m.watchdogHost(hostReq()), "", "unbaked token must not leak through as a host")
  })

  await test("the host comes from the baked deploy-time value", async () => {
    const m = await loadWith({}, { GLOBAL_COMPONENTS_WATCHDOG_HOST: "baked-watchdog.example" })
    assertEqual(m.watchdogHost(hostReq()), "baked-watchdog.example", "baked watchdog host")
  })

  await test("an app setting wins over the baked value", async () => {
    const m = await loadWith(
      { GLOBAL_COMPONENTS_WATCHDOG_HOST: "setting-watchdog.example" },
      { GLOBAL_COMPONENTS_WATCHDOG_HOST: "baked-watchdog.example" },
    )
    assertEqual(m.watchdogHost(hostReq()), "setting-watchdog.example", "process.env first")
  })

  // The one setting is the only @@token@@ left in the module: deploy.local.sh
  // stops a live run on any token without a value, so a stray one is a failed deploy.
  await test("GLOBAL_COMPONENTS_WATCHDOG_HOST is the only deploy-time token", async () => {
    const src = fs.readFileSync(path.join(MODULE_DIR, "global-components.watchdog.js"), "utf8")
    const tokens = Array.from(new Set(src.match(/@@[A-Z0-9_]+@@/g) || []))
    assertEqual(JSON.stringify(tokens), JSON.stringify(["@@GLOBAL_COMPONENTS_WATCHDOG_HOST@@"]), "tokens")
  })

  // ---------------------------------------------------------------------------
  // presence-jsonp. whoami is answered locally from the presence cookie; the
  // other ops go upstream through the stubbed ngx.fetch.
  // ---------------------------------------------------------------------------
  console.log("\npresence-jsonp:")

  const b64urlJson = (o) => Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  const fakeJwt = (claims) => `${b64urlJson({ alg: "none" })}.${b64urlJson(claims)}.sig`
  const GNAV = "12377eca-b463-4a6c-80ea-95f678f09591"

  // handlePresenceJsonp reads query args as $arg_<name>: RAW, still percent-encoded.
  const jsonpRequest = (args, cookie) => {
    const variables = {}
    for (const [k, v] of Object.entries(args)) {
      variables["arg_" + k] = v
    }
    return createMockRequest("/global-components/presence-jsonp", {
      variables,
      headersIn: cookie ? { Cookie: cookie } : {},
    })
  }
  const unwrap = (r) => {
    const body = r.returnBody || ""
    assert(body.indexOf("cb(") === 0 && body.endsWith(")"), `JSONP shape: ${body}`)
    return JSON.parse(body.slice(3, -1))
  }

  const withHost = await loadWith({ GLOBAL_COMPONENTS_WATCHDOG_HOST: "watchdog.example" })

  await test("refuses a callback name that is not a bare identifier", async () => {
    const r = jsonpRequest({ op: "whoami", callback: "alert(1)" })
    await watchdog.handlePresenceJsonp(r)
    assertEqual(r.returnCode, 400, "never reflected")
  })

  await test("sends the cookie's token upstream as Bearer — the only scheme now", async () => {
    const r = jsonpRequest({ op: "poll", sid: "s1", callback: "cb" }, "cms-auth-presence-token=a.b.c")
    await withHost.handlePresenceJsonp(r)
    assertEqual(fetches.length, 1, "one upstream call")
    assertEqual(fetches[0].url, "https://watchdog.example/api/sessions/s1", "url")
    assertEqual(fetches[0].opts.method, "GET", "verb")
    assertEqual(fetches[0].opts.headers["Authorization"], "Bearer a.b.c", "Bearer, never Bearer-Test")
  })

  await test("no cookie, no Authorization — the API's 401 is the signal, not a fallback", async () => {
    const r = jsonpRequest({ op: "poll", sid: "s1", callback: "cb" })
    await withHost.handlePresenceJsonp(r)
    assertEqual(fetches[0].opts.headers["Authorization"], undefined, "no header")
  })

  await test("an absent or unknown appName reports as CMS Classic; a known one passes", async () => {
    await withHost.handlePresenceJsonp(jsonpRequest({ op: "poll", sid: "s1", callback: "cb", appName: "Nope" }))
    await withHost.handlePresenceJsonp(jsonpRequest({ op: "poll", sid: "s1", callback: "cb", appName: "CMS%20Modern" }))
    assertEqual(fetches[0].opts.headers["X-Watchdog-App-Name"], "CMS Classic", "default")
    assertEqual(fetches[1].opts.headers["X-Watchdog-App-Name"], "CMS Modern", "known")
  })

  await test("create posts the sectionId", async () => {
    await withHost.handlePresenceJsonp(jsonpRequest({ op: "create", sectionId: "CASE%3A1", callback: "cb" }))
    assertEqual(fetches[0].opts.method, "POST", "verb")
    assertEqual(fetches[0].opts.body, JSON.stringify({ sectionId: "CASE:1" }), "body")
  })

  await test("an upstream failure comes back through the callback", async () => {
    fetchReply = { status: 401, text: "nope" }
    const r = jsonpRequest({ op: "poll", sid: "s1", callback: "cb" })
    await withHost.handlePresenceJsonp(r)
    assertEqual(unwrap(r).jsonpError, "upstream 401", "error channel")
  })

  await test("unconfigured: names the setting and makes no call", async () => {
    const r = jsonpRequest({ op: "poll", sid: "s1", callback: "cb" })
    await watchdog.handlePresenceJsonp(r)
    assertEqual(fetches.length, 0, "no upstream")
    assertEqual(unwrap(r).jsonpError, "presence API not configured (GLOBAL_COMPONENTS_WATCHDOG_HOST)", "message")
  })

  console.log("\nwhoami groups:")

  const whoami = async (cookie) => {
    const r = jsonpRequest({ op: "whoami", callback: "cb" }, cookie)
    await watchdog.handlePresenceJsonp(r)
    return unwrap(r)
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
