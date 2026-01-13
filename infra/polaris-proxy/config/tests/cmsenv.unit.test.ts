#!/usr/bin/env npx ts-node
/**
 * Unit tests for cmsenv.js
 *
 * Uses esbuild to bundle the njs module, then runs the unit tests
 * against the bundled code. Environment values are passed via r.variables.
 */

import * as esbuild from "esbuild"
import * as path from "path"
import * as fs from "fs"

const CONFIG_DIR = path.join(__dirname, "..")
const DIST_DIR = path.join(__dirname, "..", "..", ".dist")

// Ensure dist directory exists
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true })
}

interface MockRequest {
  method: string
  uri: string
  status: number
  args: Record<string, string>
  headersIn: Record<string, string>
  headersOut: Record<string, string | string[]>
  variables: Record<string, string>
  returnCode: number | null
  returnBody: string | null
  sentBuffer: string | null
  sentFlags: Record<string, unknown> | null
  return(code: number, body: string): void
  sendBuffer(buffer: string, flags: Record<string, unknown>): void
}

interface MockRequestOptions {
  method?: string
  uri?: string
  status?: number
  args?: Record<string, string>
  headersIn?: Record<string, string>
  headersOut?: Record<string, string | string[]>
  variables?: Record<string, string>
}

// IE User-Agent for convenience
const IE_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Trident/7.0; rv:11.0)"

interface CmsEnvModule {
  getDomainFromCookie(r: MockRequest): string
  proxyDestinationCorsham(r: MockRequest): string
  proxyDestinationCorshamInternal(r: MockRequest): string
  proxyDestinationModernCorsham(r: MockRequest): string
  proxyDestinationModernCorshamInternal(r: MockRequest): string
  proxyDestinationFarnborough(r: MockRequest): string
  proxyDestinationFarnboroughInternal(r: MockRequest): string
  proxyDestinationModernFarnborough(r: MockRequest): string
  proxyDestinationModernFarnboroughInternal(r: MockRequest): string
  upstreamCmsDomainName(r: MockRequest): string
  upstreamCmsModernDomainName(r: MockRequest): string
  upstreamCmsServicesDomainName(r: MockRequest): string
  upstreamCmsIpCorsham(r: MockRequest): string
  upstreamCmsModernIpCorsham(r: MockRequest): string
  upstreamCmsIpFarnborough(r: MockRequest): string
  upstreamCmsModernIpFarnborough(r: MockRequest): string
  replaceCmsDomains(r: MockRequest, data: string, flags: Record<string, unknown>): void
  replaceCmsDomainsAjaxViewer(r: MockRequest, data: string, flags: Record<string, unknown>): void
  cmsMenuBarFilters(r: MockRequest, data: string, flags: Record<string, unknown>): void
  devLoginCookieHandler(r: MockRequest): void
  switchEnvironment(r: MockRequest): void
}

// Standard mock variables for all CMS environments
function createMockVariables(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    endpointHttpProtocol: "https",
    websiteScheme: "https",
    host: "polaris.cps.gov.uk",
    websiteHostname: "polaris.cps.gov.uk",
    // Default environment
    defaultUpstreamCmsIpCorsham: "10.0.0.1",
    defaultUpstreamCmsModernIpCorsham: "10.0.0.2",
    defaultUpstreamCmsIpFarnborough: "10.0.1.1",
    defaultUpstreamCmsModernIpFarnborough: "10.0.1.2",
    defaultUpstreamCmsDomainName: "cms.cps.gov.uk",
    defaultUpstreamCmsServicesDomainName: "services.cps.gov.uk",
    defaultUpstreamCmsModernDomainName: "modern.cps.gov.uk",
    // CIN2 environment
    cin2UpstreamCmsIpCorsham: "10.2.0.1",
    cin2UpstreamCmsModernIpCorsham: "10.2.0.2",
    cin2UpstreamCmsIpFarnborough: "10.2.1.1",
    cin2UpstreamCmsModernIpFarnborough: "10.2.1.2",
    cin2UpstreamCmsDomainName: "cin2.cps.gov.uk",
    cin2UpstreamCmsServicesDomainName: "services-cin2.cps.gov.uk",
    cin2UpstreamCmsModernDomainName: "modern-cin2.cps.gov.uk",
    // CIN4 environment
    cin4UpstreamCmsIpCorsham: "10.4.0.1",
    cin4UpstreamCmsModernIpCorsham: "10.4.0.2",
    cin4UpstreamCmsIpFarnborough: "10.4.1.1",
    cin4UpstreamCmsModernIpFarnborough: "10.4.1.2",
    cin4UpstreamCmsDomainName: "cin4.cps.gov.uk",
    cin4UpstreamCmsServicesDomainName: "services-cin4.cps.gov.uk",
    cin4UpstreamCmsModernDomainName: "modern-cin4.cps.gov.uk",
    // CIN5 environment
    cin5UpstreamCmsIpCorsham: "10.5.0.1",
    cin5UpstreamCmsModernIpCorsham: "10.5.0.2",
    cin5UpstreamCmsIpFarnborough: "10.5.1.1",
    cin5UpstreamCmsModernIpFarnborough: "10.5.1.2",
    cin5UpstreamCmsDomainName: "cin5.cps.gov.uk",
    cin5UpstreamCmsServicesDomainName: "services-cin5.cps.gov.uk",
    cin5UpstreamCmsModernDomainName: "modern-cin5.cps.gov.uk",
    ...overrides,
  }
}

// Bundle the module
async function build(): Promise<void> {
  await esbuild.build({
    entryPoints: [path.join(CONFIG_DIR, "cmsenv.js")],
    bundle: true,
    outfile: path.join(DIST_DIR, "cmsenv.bundle.js"),
    format: "esm",
    platform: "node",
    external: ["fs"],
    logLevel: "error",
  })
}

// Run tests
async function runTests(): Promise<void> {
  const modulePath = path.join(DIST_DIR, "cmsenv.bundle.js")
  const module = await import(modulePath)
  const cmsenv: CmsEnvModule = module.default

  let passed = 0
  let failed = 0

  function assertEqual(actual: unknown, expected: unknown, message: string): void {
    if (actual !== expected) {
      throw new Error(
        `${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`
      )
    }
  }

  function assertIncludes(actual: string, expected: string, message: string): void {
    if (!actual.includes(expected)) {
      throw new Error(
        `${message}\n  Expected to include: ${JSON.stringify(expected)}\n  Actual: ${JSON.stringify(actual)}`
      )
    }
  }

  async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
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
      uri: options.uri || "/test",
      status: options.status || 200,
      args: options.args || {},
      headersIn: options.headersIn || {},
      headersOut: options.headersOut || {},
      variables: options.variables || createMockVariables(),
      returnCode: null,
      returnBody: null,
      sentBuffer: null,
      sentFlags: null,
      return(code: number, body: string) {
        this.returnCode = code
        this.returnBody = body
      },
      sendBuffer(buffer: string, flags: Record<string, unknown>) {
        this.sentBuffer = buffer
        this.sentFlags = flags
      },
    }
  }

  console.log("=".repeat(60))
  console.log("cmsenv.js Unit Tests")
  console.log("=".repeat(60))

  // ============================================================
  // getDomainFromCookie tests
  // ============================================================
  console.log("\ngetDomainFromCookie:")

  await test("extracts domain from simple cookie", async () => {
    const r = createMockRequest({
      headersIn: { Cookie: "session=abc; domain=cin3.cps.gov.uk" },
    })
    assertEqual(cmsenv.getDomainFromCookie(r), "cin3.cps.gov.uk", "Should extract domain")
  })

  await test("extracts first matching domain from cookie", async () => {
    const r = createMockRequest({
      headersIn: { Cookie: "BIGip=cin2.cps.gov.uk; other=value" },
    })
    assertEqual(cmsenv.getDomainFromCookie(r), "cin2.cps.gov.uk", "Should extract first domain")
  })

  await test("handles cin4 domain", async () => {
    const r = createMockRequest({
      headersIn: { Cookie: "env=cin4.cps.gov.uk" },
    })
    assertEqual(cmsenv.getDomainFromCookie(r), "cin4.cps.gov.uk", "Should extract cin4 domain")
  })

  await test("handles cin5 domain", async () => {
    const r = createMockRequest({
      headersIn: { Cookie: "env=cin5.cps.gov.uk" },
    })
    assertEqual(cmsenv.getDomainFromCookie(r), "cin5.cps.gov.uk", "Should extract cin5 domain")
  })

  // ============================================================
  // Environment detection tests (via proxyDestinationCorsham)
  // ============================================================
  console.log("\nEnvironment detection (via proxy destinations):")

  await test("defaults to 'default' environment when no cookie", async () => {
    const r = createMockRequest({
      headersIn: {},
      variables: createMockVariables(),
    })
    assertEqual(
      cmsenv.proxyDestinationCorsham(r),
      "https://10.0.0.1",
      "Should use default environment IP"
    )
  })

  await test("detects cin2 environment from cookie", async () => {
    const r = createMockRequest({
      headersIn: { Cookie: "__CMSENV=cin2" },
      variables: createMockVariables(),
    })
    assertEqual(
      cmsenv.proxyDestinationCorsham(r),
      "https://10.2.0.1",
      "Should use cin2 environment IP"
    )
  })

  await test("detects cin3 as default environment", async () => {
    const r = createMockRequest({
      headersIn: { Cookie: "__CMSENV=cin3" },
      variables: createMockVariables(),
    })
    assertEqual(
      cmsenv.proxyDestinationCorsham(r),
      "https://10.0.0.1",
      "cin3 should map to default environment"
    )
  })

  await test("detects cin4 environment from cookie", async () => {
    const r = createMockRequest({
      headersIn: { Cookie: "__CMSENV=cin4" },
      variables: createMockVariables(),
    })
    assertEqual(
      cmsenv.proxyDestinationCorsham(r),
      "https://10.4.0.1",
      "Should use cin4 environment IP"
    )
  })

  await test("detects cin5 environment from cookie", async () => {
    const r = createMockRequest({
      headersIn: { Cookie: "__CMSENV=cin5" },
      variables: createMockVariables(),
    })
    assertEqual(
      cmsenv.proxyDestinationCorsham(r),
      "https://10.5.0.1",
      "Should use cin5 environment IP"
    )
  })

  await test("cin3 takes precedence when multiple env markers present", async () => {
    const r = createMockRequest({
      headersIn: { Cookie: "cin2=x; cin3=y; cin4=z" },
      variables: createMockVariables(),
    })
    // cin3 is checked first and returns "default"
    assertEqual(
      cmsenv.proxyDestinationCorsham(r),
      "https://10.0.0.1",
      "cin3 should take precedence"
    )
  })

  await test("cin2 detected when cin3 not present", async () => {
    const r = createMockRequest({
      headersIn: { Cookie: "cin2=x; cin4=y" },
      variables: createMockVariables(),
    })
    assertEqual(
      cmsenv.proxyDestinationCorsham(r),
      "https://10.2.0.1",
      "cin2 should be detected"
    )
  })

  // ============================================================
  // Proxy destination tests
  // ============================================================
  console.log("\nProxy destinations:")

  await test("proxyDestinationCorsham returns correct URL", async () => {
    const r = createMockRequest({ variables: createMockVariables() })
    assertEqual(cmsenv.proxyDestinationCorsham(r), "https://10.0.0.1", "Should build correct URL")
  })

  await test("proxyDestinationCorshamInternal returns same as proxyDestinationCorsham", async () => {
    const r = createMockRequest({ variables: createMockVariables() })
    assertEqual(
      cmsenv.proxyDestinationCorshamInternal(r),
      cmsenv.proxyDestinationCorsham(r),
      "Internal should match regular"
    )
  })

  await test("proxyDestinationModernCorsham returns modern IP", async () => {
    const r = createMockRequest({ variables: createMockVariables() })
    assertEqual(
      cmsenv.proxyDestinationModernCorsham(r),
      "https://10.0.0.2",
      "Should use modern IP"
    )
  })

  await test("proxyDestinationFarnborough returns Farnborough IP", async () => {
    const r = createMockRequest({ variables: createMockVariables() })
    assertEqual(
      cmsenv.proxyDestinationFarnborough(r),
      "https://10.0.1.1",
      "Should use Farnborough IP"
    )
  })

  await test("proxyDestinationModernFarnborough returns modern Farnborough IP", async () => {
    const r = createMockRequest({ variables: createMockVariables() })
    assertEqual(
      cmsenv.proxyDestinationModernFarnborough(r),
      "https://10.0.1.2",
      "Should use modern Farnborough IP"
    )
  })

  await test("uses http protocol when configured", async () => {
    const r = createMockRequest({
      variables: createMockVariables({ endpointHttpProtocol: "http" }),
    })
    assertEqual(
      cmsenv.proxyDestinationCorsham(r),
      "http://10.0.0.1",
      "Should use http protocol"
    )
  })

  // ============================================================
  // Upstream domain name tests
  // ============================================================
  console.log("\nUpstream domain names:")

  await test("upstreamCmsDomainName returns correct domain for default env", async () => {
    const r = createMockRequest({ variables: createMockVariables() })
    assertEqual(
      cmsenv.upstreamCmsDomainName(r),
      "cms.cps.gov.uk",
      "Should return default domain"
    )
  })

  await test("upstreamCmsDomainName returns correct domain for cin2", async () => {
    const r = createMockRequest({
      headersIn: { Cookie: "__CMSENV=cin2" },
      variables: createMockVariables(),
    })
    assertEqual(
      cmsenv.upstreamCmsDomainName(r),
      "cin2.cps.gov.uk",
      "Should return cin2 domain"
    )
  })

  await test("upstreamCmsModernDomainName returns modern domain", async () => {
    const r = createMockRequest({ variables: createMockVariables() })
    assertEqual(
      cmsenv.upstreamCmsModernDomainName(r),
      "modern.cps.gov.uk",
      "Should return modern domain"
    )
  })

  await test("upstreamCmsServicesDomainName returns services domain", async () => {
    const r = createMockRequest({ variables: createMockVariables() })
    assertEqual(
      cmsenv.upstreamCmsServicesDomainName(r),
      "services.cps.gov.uk",
      "Should return services domain"
    )
  })

  // ============================================================
  // Upstream IP tests
  // ============================================================
  console.log("\nUpstream IPs:")

  await test("upstreamCmsIpCorsham returns correct IP", async () => {
    const r = createMockRequest({ variables: createMockVariables() })
    assertEqual(cmsenv.upstreamCmsIpCorsham(r), "10.0.0.1", "Should return Corsham IP")
  })

  await test("upstreamCmsModernIpCorsham returns correct IP", async () => {
    const r = createMockRequest({ variables: createMockVariables() })
    assertEqual(cmsenv.upstreamCmsModernIpCorsham(r), "10.0.0.2", "Should return modern Corsham IP")
  })

  await test("upstreamCmsIpFarnborough returns correct IP", async () => {
    const r = createMockRequest({ variables: createMockVariables() })
    assertEqual(cmsenv.upstreamCmsIpFarnborough(r), "10.0.1.1", "Should return Farnborough IP")
  })

  await test("upstreamCmsModernIpFarnborough returns correct IP", async () => {
    const r = createMockRequest({ variables: createMockVariables() })
    assertEqual(
      cmsenv.upstreamCmsModernIpFarnborough(r),
      "10.0.1.2",
      "Should return modern Farnborough IP"
    )
  })

  await test("upstreamCmsIpCorsham returns cin4 IP when cin4 env", async () => {
    const r = createMockRequest({
      headersIn: { Cookie: "__CMSENV=cin4" },
      variables: createMockVariables(),
    })
    assertEqual(cmsenv.upstreamCmsIpCorsham(r), "10.4.0.1", "Should return cin4 Corsham IP")
  })

  // ============================================================
  // replaceCmsDomains tests
  // ============================================================
  console.log("\nreplaceCmsDomains:")

  await test("does not process body on 302 redirect", async () => {
    const r = createMockRequest({
      status: 302,
      variables: createMockVariables(),
    })
    const data = "some content with cms.cps.gov.uk"
    const flags = { last: true }
    cmsenv.replaceCmsDomains(r, data, flags)
    assertEqual(r.sentBuffer, data, "Should pass through unchanged on 302")
  })

  await test("replaces domain names in content", async () => {
    const r = createMockRequest({
      status: 200,
      variables: createMockVariables(),
    })
    // Note: the replacement removes special chars like dots from the search pattern
    const data = "Link to cmscpsgovuk here"
    const flags = { last: true }
    cmsenv.replaceCmsDomains(r, data, flags)
    assertIncludes(
      r.sentBuffer || "",
      "polaris.cps.gov.uk",
      "Should replace domain with host"
    )
  })

  await test("replaces IP addresses in content", async () => {
    const r = createMockRequest({
      status: 200,
      variables: createMockVariables(),
    })
    // The replacement strips dots, so "10.0.0.1" becomes "10001" in the search
    const data = "Connect to 10001 server"
    const flags = { last: true }
    cmsenv.replaceCmsDomains(r, data, flags)
    assertIncludes(
      r.sentBuffer || "",
      "polaris.cps.gov.uk",
      "Should replace IP with host"
    )
  })

  // ============================================================
  // replaceCmsDomainsAjaxViewer tests
  // ============================================================
  console.log("\nreplaceCmsDomainsAjaxViewer:")

  await test("uses websiteHostname instead of host", async () => {
    const r = createMockRequest({
      status: 200,
      variables: createMockVariables({
        host: "proxy.local",
        websiteHostname: "polaris.cps.gov.uk",
      }),
    })
    const data = "Connect to cmscpsgovuk server"
    const flags = { last: true }
    cmsenv.replaceCmsDomainsAjaxViewer(r, data, flags)
    assertIncludes(
      r.sentBuffer || "",
      "polaris.cps.gov.uk",
      "Should use websiteHostname"
    )
  })

  // ============================================================
  // cmsMenuBarFilters tests
  // ============================================================
  console.log("\ncmsMenuBarFilters:")

  await test("replaces POLARIS_URL reference with /polaris", async () => {
    const r = createMockRequest({
      status: 200,
      variables: createMockVariables(),
    })
    const data =
      'var url = objMainWindow.top.frameData.objMasterWindow.top.frameServerJS.POLARIS_URL;'
    const flags = { last: true }
    cmsenv.cmsMenuBarFilters(r, data, flags)
    assertIncludes(r.sentBuffer || "", '"/polaris"', "Should replace POLARIS_URL")
  })

  await test("replaces MENU_BAR_POLARIS_LOGO with base64 image", async () => {
    const r = createMockRequest({
      status: 200,
      variables: createMockVariables(),
    })
    const data = 'var logo = MENU_BAR_POLARIS_LOGO;'
    const flags = { last: true }
    cmsenv.cmsMenuBarFilters(r, data, flags)
    assertIncludes(r.sentBuffer || "", "data:image/png;base64,", "Should replace with base64 image")
  })

  // ============================================================
  // devLoginCookieHandler tests
  // ============================================================
  console.log("\ndevLoginCookieHandler:")

  await test("devLoginCookieHandler clears __CMSENV and all BIG-IP cookies on GET", async () => {
    const r = createMockRequest({
      headersOut: { "Set-Cookie": [] },
      variables: createMockVariables({ request_method: "GET" }),
    })
    cmsenv.devLoginCookieHandler(r)
    const cookies = r.headersOut["Set-Cookie"] as string[]
    // Should have 9 cookies: 1 __CMSENV + 8 BIG-IP (2 per env for cin2,cin3,cin4,cin5)
    assertEqual(cookies.length, 9, "Should have 9 cookies (1 __CMSENV + 8 BIG-IP)")
    assertEqual(
      cookies[0],
      "__CMSENV=deleted; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT",
      "First cookie should delete __CMSENV"
    )
  })

  await test("devLoginCookieHandler clears all 4 environment BIG-IP cookies on GET", async () => {
    const r = createMockRequest({
      headersOut: { "Set-Cookie": [] },
      variables: createMockVariables({ request_method: "GET" }),
    })
    cmsenv.devLoginCookieHandler(r)
    const cookies = r.headersOut["Set-Cookie"] as string[]
    // Check for all environments
    const cin2Cookies = cookies.filter((c) => c.includes("CIN2"))
    const cin3Cookies = cookies.filter((c) => c.includes("CIN3"))
    const cin4Cookies = cookies.filter((c) => c.includes("CIN4"))
    const cin5Cookies = cookies.filter((c) => c.includes("CIN5"))
    assertEqual(cin2Cookies.length, 2, "Should have 2 cin2 BIG-IP cookies")
    assertEqual(cin3Cookies.length, 2, "Should have 2 cin3 BIG-IP cookies")
    assertEqual(cin4Cookies.length, 2, "Should have 2 cin4 BIG-IP cookies")
    assertEqual(cin5Cookies.length, 2, "Should have 2 cin5 BIG-IP cookies")
  })

  await test("devLoginCookieHandler BIG-IP cookies have deletion expiry on GET", async () => {
    const r = createMockRequest({
      headersOut: { "Set-Cookie": [] },
      variables: createMockVariables({ request_method: "GET" }),
    })
    cmsenv.devLoginCookieHandler(r)
    const cookies = r.headersOut["Set-Cookie"] as string[]
    const bigIpCookies = cookies.filter((c) => c.includes("BIGipServer"))
    bigIpCookies.forEach((cookie) => {
      assertIncludes(cookie, "deleted", "BIG-IP cookie should be deleted")
      assertIncludes(cookie, "expires=Thu, 01 Jan 1970", "BIG-IP cookie should have expiry in past")
    })
  })

  await test("devLoginCookieHandler adds __CMSENV and clears BIG-IP on POST for default env", async () => {
    const r = createMockRequest({
      headersOut: { "Set-Cookie": ["session=abc"] },
      variables: createMockVariables({ request_method: "POST" }),
    })
    cmsenv.devLoginCookieHandler(r)
    const cookies = r.headersOut["Set-Cookie"] as string[]
    // Should have 10 cookies: 1 original + 1 __CMSENV + 8 BIG-IP deletions
    assertEqual(cookies.length, 10, "Should have 10 cookies (1 original + 1 env + 8 BIG-IP)")
    assertEqual(cookies[0], "session=abc", "First cookie should be original")
    assertEqual(cookies[1], "__CMSENV=default; path=/", "Second cookie should be __CMSENV")
    // Verify BIG-IP cookies are cleared
    const bigIpCookies = cookies.filter((c) => c.includes("BIGipServer"))
    assertEqual(bigIpCookies.length, 8, "Should have 8 BIG-IP deletion cookies")
  })

  await test("devLoginCookieHandler adds __CMSENV and clears non-active BIG-IP on POST for cin2 env", async () => {
    const r = createMockRequest({
      headersOut: { "Set-Cookie": ["domain=cin2.cps.gov.uk"] },
      variables: createMockVariables({ request_method: "POST" }),
    })
    cmsenv.devLoginCookieHandler(r)
    const cookies = r.headersOut["Set-Cookie"] as string[]
    // Should have 8 cookies: 1 original + 1 __CMSENV + 6 BIG-IP (excludes cin2)
    assertEqual(cookies.length, 8, "Should have 8 cookies (1 original + 1 env + 6 BIG-IP)")
    assertEqual(cookies[1], "__CMSENV=cin2; path=/", "Should add cin2 env cookie")
    // Should NOT have cin2 BIG-IP cookies
    const cin2Cookies = cookies.filter((c) => c.includes("CIN2"))
    assertEqual(cin2Cookies.length, 0, "Should not clear active env BIG-IP cookies")
  })

  await test("devLoginCookieHandler adds __CMSENV and clears non-active BIG-IP on POST for cin4 env", async () => {
    const r = createMockRequest({
      headersOut: { "Set-Cookie": ["domain=cin4.cps.gov.uk"] },
      variables: createMockVariables({ request_method: "POST" }),
    })
    cmsenv.devLoginCookieHandler(r)
    const cookies = r.headersOut["Set-Cookie"] as string[]
    // Should have 8 cookies: 1 original + 1 __CMSENV + 6 BIG-IP (excludes cin4)
    assertEqual(cookies.length, 8, "Should have 8 cookies (1 original + 1 env + 6 BIG-IP)")
    assertEqual(cookies[1], "__CMSENV=cin4; path=/", "Should add cin4 env cookie")
    // Should NOT have cin4 BIG-IP cookies
    const cin4Cookies = cookies.filter((c) => c.includes("CIN4"))
    assertEqual(cin4Cookies.length, 0, "Should not clear active env BIG-IP cookies")
  })

  await test("devLoginCookieHandler clears cookies on PUT", async () => {
    const r = createMockRequest({
      headersOut: { "Set-Cookie": ["existing=cookie"] },
      variables: createMockVariables({ request_method: "PUT" }),
    })
    cmsenv.devLoginCookieHandler(r)
    const cookies = r.headersOut["Set-Cookie"] as string[]
    // Should have 10 cookies: 1 existing + 1 __CMSENV + 8 BIG-IP
    assertEqual(cookies.length, 10, "Should have 10 cookies (1 existing + 1 __CMSENV + 8 BIG-IP)")
    assertEqual(cookies[0], "existing=cookie", "First cookie should be existing")
    assertEqual(
      cookies[1],
      "__CMSENV=deleted; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT",
      "Second cookie should delete __CMSENV"
    )
  })

  await test("devLoginCookieHandler clears cookies on DELETE", async () => {
    const r = createMockRequest({
      headersOut: { "Set-Cookie": ["existing=cookie"] },
      variables: createMockVariables({ request_method: "DELETE" }),
    })
    cmsenv.devLoginCookieHandler(r)
    const cookies = r.headersOut["Set-Cookie"] as string[]
    // Should have 10 cookies: 1 existing + 1 __CMSENV + 8 BIG-IP
    assertEqual(cookies.length, 10, "Should have 10 cookies (1 existing + 1 __CMSENV + 8 BIG-IP)")
  })

  // ============================================================
  // Additional proxy destination tests (Internal variants)
  // ============================================================
  console.log("\nProxy destination Internal variants:")

  await test("proxyDestinationModernCorshamInternal returns same as proxyDestinationModernCorsham", async () => {
    const r = createMockRequest({ variables: createMockVariables() })
    assertEqual(
      cmsenv.proxyDestinationModernCorshamInternal(r),
      cmsenv.proxyDestinationModernCorsham(r),
      "ModernCorshamInternal should match ModernCorsham"
    )
  })

  await test("proxyDestinationFarnboroughInternal returns same as proxyDestinationFarnborough", async () => {
    const r = createMockRequest({ variables: createMockVariables() })
    assertEqual(
      cmsenv.proxyDestinationFarnboroughInternal(r),
      cmsenv.proxyDestinationFarnborough(r),
      "FarnboroughInternal should match Farnborough"
    )
  })

  await test("proxyDestinationModernFarnboroughInternal returns same as proxyDestinationModernFarnborough", async () => {
    const r = createMockRequest({ variables: createMockVariables() })
    assertEqual(
      cmsenv.proxyDestinationModernFarnboroughInternal(r),
      cmsenv.proxyDestinationModernFarnborough(r),
      "ModernFarnboroughInternal should match ModernFarnborough"
    )
  })

  // ============================================================
  // Farnborough with different environments
  // ============================================================
  console.log("\nFarnborough with different environments:")

  await test("proxyDestinationFarnborough uses cin2 IP when cin2 env", async () => {
    const r = createMockRequest({
      headersIn: { Cookie: "__CMSENV=cin2" },
      variables: createMockVariables(),
    })
    assertEqual(
      cmsenv.proxyDestinationFarnborough(r),
      "https://10.2.1.1",
      "Should use cin2 Farnborough IP"
    )
  })

  await test("proxyDestinationFarnborough uses cin4 IP when cin4 env", async () => {
    const r = createMockRequest({
      headersIn: { Cookie: "__CMSENV=cin4" },
      variables: createMockVariables(),
    })
    assertEqual(
      cmsenv.proxyDestinationFarnborough(r),
      "https://10.4.1.1",
      "Should use cin4 Farnborough IP"
    )
  })

  await test("proxyDestinationFarnborough uses cin5 IP when cin5 env", async () => {
    const r = createMockRequest({
      headersIn: { Cookie: "__CMSENV=cin5" },
      variables: createMockVariables(),
    })
    assertEqual(
      cmsenv.proxyDestinationFarnborough(r),
      "https://10.5.1.1",
      "Should use cin5 Farnborough IP"
    )
  })

  await test("proxyDestinationModernFarnborough uses cin2 IP when cin2 env", async () => {
    const r = createMockRequest({
      headersIn: { Cookie: "__CMSENV=cin2" },
      variables: createMockVariables(),
    })
    assertEqual(
      cmsenv.proxyDestinationModernFarnborough(r),
      "https://10.2.1.2",
      "Should use cin2 modern Farnborough IP"
    )
  })

  // ============================================================
  // Domain replacement transformation tests
  // ============================================================
  console.log("\nDomain replacement transformation:")

  await test("replaceCmsDomains strips dots from domain before matching", async () => {
    const r = createMockRequest({
      status: 200,
      variables: createMockVariables(),
    })
    // The actual domain is "cms.cps.gov.uk" but dots are stripped for matching
    // So "cmscpsgovuk" in content should be replaced
    const data = "URL is cmscpsgovuk/path"
    const flags = { last: true }
    cmsenv.replaceCmsDomains(r, data, flags)
    assertEqual(
      r.sentBuffer,
      "URL is polaris.cps.gov.uk/path",
      "Should match domain with dots stripped"
    )
  })

  await test("replaceCmsDomains strips hyphens from domain before matching", async () => {
    const r = createMockRequest({
      status: 200,
      variables: createMockVariables({
        defaultUpstreamCmsServicesDomainName: "services-cms.cps.gov.uk",
      }),
    })
    // Hyphens should also be stripped
    const data = "URL is servicescmscpsgovuk/path"
    const flags = { last: true }
    cmsenv.replaceCmsDomains(r, data, flags)
    assertEqual(
      r.sentBuffer,
      "URL is polaris.cps.gov.uk/path",
      "Should match domain with hyphens stripped"
    )
  })

  await test("replaceCmsDomains replaces all 7 upstream variables", async () => {
    const r = createMockRequest({
      status: 200,
      variables: createMockVariables(),
    })
    // Test that all variable types get replaced (dots stripped in matching)
    const data = [
      "moderncpsgovuk",      // UpstreamCmsModernDomainName
      "servicescpsgovuk",    // UpstreamCmsServicesDomainName
      "cmscpsgovuk",         // UpstreamCmsDomainName
      "10001",               // UpstreamCmsIpCorsham
      "10002",               // UpstreamCmsModernIpCorsham
      "10011",               // UpstreamCmsIpFarnborough
      "10012",               // UpstreamCmsModernIpFarnborough
    ].join(" | ")
    const flags = { last: true }
    cmsenv.replaceCmsDomains(r, data, flags)

    const expected = Array(7).fill("polaris.cps.gov.uk").join(" | ")
    assertEqual(r.sentBuffer, expected, "Should replace all 7 upstream variables")
  })

  await test("replaceCmsDomains uses correct env variables for cin4", async () => {
    const r = createMockRequest({
      status: 200,
      headersIn: { Cookie: "__CMSENV=cin4" },
      variables: createMockVariables(),
    })
    // cin4 domain is "cin4.cps.gov.uk" -> "cin4cpsgovuk" after stripping
    const data = "URL is cin4cpsgovuk/path"
    const flags = { last: true }
    cmsenv.replaceCmsDomains(r, data, flags)
    assertEqual(
      r.sentBuffer,
      "URL is polaris.cps.gov.uk/path",
      "Should use cin4 domain for matching"
    )
  })

  // ============================================================
  // cmsMenuBarFilters comprehensive tests
  // ============================================================
  console.log("\ncmsMenuBarFilters comprehensive:")

  await test("cmsMenuBarFilters replaces both POLARIS_URL and logo in same content", async () => {
    const r = createMockRequest({
      status: 200,
      variables: createMockVariables(),
    })
    const data = 'var url = objMainWindow.top.frameData.objMasterWindow.top.frameServerJS.POLARIS_URL; var logo = MENU_BAR_POLARIS_LOGO;'
    const flags = { last: true }
    cmsenv.cmsMenuBarFilters(r, data, flags)
    assertIncludes(r.sentBuffer || "", '"/polaris"', "Should replace POLARIS_URL")
    assertIncludes(r.sentBuffer || "", "data:image/png;base64,", "Should replace logo")
  })

  await test("cmsMenuBarFilters also performs domain replacement", async () => {
    const r = createMockRequest({
      status: 200,
      variables: createMockVariables(),
    })
    // Content has both menu bar content AND a domain reference
    const data = 'var url = objMainWindow.top.frameData.objMasterWindow.top.frameServerJS.POLARIS_URL; link=cmscpsgovuk'
    const flags = { last: true }
    cmsenv.cmsMenuBarFilters(r, data, flags)
    assertIncludes(r.sentBuffer || "", '"/polaris"', "Should replace POLARIS_URL")
    assertIncludes(r.sentBuffer || "", "polaris.cps.gov.uk", "Should also replace domains")
  })

  // ============================================================
  // switchEnvironment tests
  // IE mode checks are now handled in nginx.conf, these tests verify
  // the cookie setting and redirect behavior only
  // ============================================================
  console.log("\nswitchEnvironment:")

  await test("switchEnvironment sets __CMSENV=cin2 for /cin2", async () => {
    const r = createMockRequest({
      uri: "/cin2",
      headersIn: { Host: "polaris.cps.gov.uk" },
      variables: createMockVariables(),
    })
    cmsenv.switchEnvironment(r)
    assertEqual(r.returnCode, 302, "Should return 302")
    const cookies = r.headersOut["Set-Cookie"] as string[]
    assertEqual(cookies[0], "__CMSENV=cin2; path=/", "First cookie should be __CMSENV=cin2; path=/")
  })

  await test("switchEnvironment sets __CMSENV=default for /cin3", async () => {
    const r = createMockRequest({
      uri: "/cin3",
      headersIn: { Host: "polaris.cps.gov.uk" },
      variables: createMockVariables(),
    })
    cmsenv.switchEnvironment(r)
    const cookies = r.headersOut["Set-Cookie"] as string[]
    assertEqual(cookies[0], "__CMSENV=default; path=/", "cin3 should map to __CMSENV=default; path=/")
  })

  await test("switchEnvironment sets __CMSENV=cin4 for /cin4", async () => {
    const r = createMockRequest({
      uri: "/cin4",
      headersIn: { Host: "polaris.cps.gov.uk" },
      variables: createMockVariables(),
    })
    cmsenv.switchEnvironment(r)
    const cookies = r.headersOut["Set-Cookie"] as string[]
    assertEqual(cookies[0], "__CMSENV=cin4; path=/", "Should set __CMSENV=cin4; path=/")
  })

  await test("switchEnvironment sets __CMSENV=cin5 for /cin5", async () => {
    const r = createMockRequest({
      uri: "/cin5",
      headersIn: { Host: "polaris.cps.gov.uk" },
      variables: createMockVariables(),
    })
    cmsenv.switchEnvironment(r)
    const cookies = r.headersOut["Set-Cookie"] as string[]
    assertEqual(cookies[0], "__CMSENV=cin5; path=/", "Should set __CMSENV=cin5; path=/")
  })

  await test("switchEnvironment clears other environment BIG-IP cookies", async () => {
    const r = createMockRequest({
      uri: "/cin2",
      headersIn: { Host: "polaris.cps.gov.uk" },
      variables: createMockVariables(),
    })
    cmsenv.switchEnvironment(r)
    const cookies = r.headersOut["Set-Cookie"] as string[]
    // Should have 7 cookies: 1 env + 6 BIG-IP deletions (2 each for cin3, cin4, cin5)
    assertEqual(cookies.length, 7, "Should have 7 cookies (1 env + 6 BIG-IP deletions)")
    // Should NOT clear cin2 cookies
    const cin2Cookies = cookies.filter((c) => c.includes("CIN2"))
    assertEqual(cin2Cookies.length, 0, "Should not clear current environment cookies")
    // Should clear cin3, cin4, cin5
    const cin3Cookies = cookies.filter((c) => c.includes("CIN3"))
    assertEqual(cin3Cookies.length, 2, "Should clear 2 cin3 BIG-IP cookies")
  })

  await test("switchEnvironment redirects to /CMS", async () => {
    const r = createMockRequest({
      uri: "/cin4",
      headersIn: { Host: "polaris.cps.gov.uk" },
      variables: createMockVariables(),
    })
    cmsenv.switchEnvironment(r)
    assertEqual(r.returnCode, 302, "Should return 302")
    assertIncludes(r.returnBody || "", "/CMS", "Should redirect to /CMS")
    assertIncludes(r.returnBody || "", "polaris.cps.gov.uk", "Should include host")
  })

  // ============================================================
  // Edge cases
  // ============================================================
  console.log("\nEdge cases:")

  await test("handles empty cookie header gracefully", async () => {
    const r = createMockRequest({
      headersIn: { Cookie: "" },
      variables: createMockVariables(),
    })
    // Should default to "default" environment without throwing
    assertEqual(
      cmsenv.proxyDestinationCorsham(r),
      "https://10.0.0.1",
      "Should handle empty cookie"
    )
  })

  await test("handles missing cookie header gracefully", async () => {
    const r = createMockRequest({
      headersIn: {},
      variables: createMockVariables(),
    })
    assertEqual(
      cmsenv.proxyDestinationCorsham(r),
      "https://10.0.0.1",
      "Should handle missing cookie"
    )
  })

  await test("environment detection is case-sensitive", async () => {
    const r = createMockRequest({
      headersIn: { Cookie: "__CMSENV=CIN2" }, // uppercase
      variables: createMockVariables(),
    })
    // Should NOT match cin2 (lowercase check)
    assertEqual(
      cmsenv.proxyDestinationCorsham(r),
      "https://10.0.0.1",
      "Should be case-sensitive (default)"
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
