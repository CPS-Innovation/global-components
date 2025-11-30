#!/usr/bin/env node
/**
 * Unit tests for nginx.js (auth redirect handlers)
 *
 * Uses esbuild to bundle the njs module with mocked dependencies,
 * then runs the unit tests against the bundled code.
 */

const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

const DOCKER_DIR = path.join(__dirname, "..", "docker");
const TEST_DIR = __dirname;
const DIST_DIR = path.join(TEST_DIR, ".dist");

// Ensure dist directory exists
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

// Bundle the module
async function build() {
  await esbuild.build({
    entryPoints: [path.join(DOCKER_DIR, "nginx.js")],
    bundle: true,
    outfile: path.join(DIST_DIR, "nginx.bundle.js"),
    format: "esm",
    platform: "node",
    logLevel: "error",
  });
}

// Run tests
async function runTests() {
  const modulePath = path.join(DIST_DIR, "nginx.bundle.js");
  const module = await import(modulePath);
  const nginx = module.default;

  // Test framework
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(
        `${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`
      );
    }
  }

  async function test(name, fn) {
    try {
      await fn();
      passed++;
      console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    } catch (err) {
      failed++;
      console.log(`  \x1b[31m✗\x1b[0m ${name}`);
      console.log(`    ${err.message}`);
    }
  }

  function createMockRequest(options = {}) {
    return {
      method: options.method || "GET",
      uri: options.uri || "/init",
      args: options.args || {},
      headersIn: options.headersIn || {},
      headersOut: {},
      variables: options.variables || {},
      returnCode: null,
      returnBody: null,
      return(code, body) {
        this.returnCode = code;
        this.returnBody = body;
      },
    };
  }

  function parseSessionHintCookie(setCookieHeader) {
    const match = setCookieHeader.match(/cms-session-hint=([^;]+)/);
    if (!match) return null;
    return JSON.parse(decodeURIComponent(match[1]));
  }

  function assertDeepEqual(actual, expected, message) {
    const actualStr = JSON.stringify(actual, null, 2);
    const expectedStr = JSON.stringify(expected, null, 2);
    if (actualStr !== expectedStr) {
      throw new Error(
        `${message}\n  Expected: ${expectedStr}\n  Actual:   ${actualStr}`
      );
    }
  }

  console.log("=".repeat(60));
  console.log("nginx.js Unit Tests");
  console.log("=".repeat(60));

  // --- appAuthRedirect tests ---
  console.log("\nappAuthRedirect:");

  await test("redirects to whitelisted URL with cookie appended", async () => {
    process.env.AUTH_HANDOVER_WHITELIST = "/auth-refresh-inbound,http://allowed.example.org";
    const r = createMockRequest({
      args: {
        r: "http://allowed.example.org/callback",
        cookie: "session=abc123",
      },
      headersIn: {
        "X-Forwarded-Proto": "https",
        Host: "proxy.example.com",
      },
    });
    nginx.appAuthRedirect(r);
    assertEqual(r.returnCode, 302, "Should return 302 redirect");
    assert(
      r.returnBody.includes("http://allowed.example.org/callback"),
      `Should redirect to allowed URL, got: ${r.returnBody}`
    );
    assert(
      r.returnBody.includes("cc=session%3Dabc123"),
      `Should append encoded cookie as cc param, got: ${r.returnBody}`
    );
  });

  await test("returns 403 for non-whitelisted URL", async () => {
    process.env.AUTH_HANDOVER_WHITELIST = "http://allowed.example.org";
    const r = createMockRequest({
      args: {
        r: "http://evil.example.org/callback",
        cookie: "session=abc123",
      },
      headersIn: {
        "X-Forwarded-Proto": "https",
        Host: "proxy.example.com",
      },
    });
    nginx.appAuthRedirect(r);
    assertEqual(r.returnCode, 403, "Should return 403");
    assert(
      r.returnBody.includes("403"),
      `Should include 403 in body, got: ${r.returnBody}`
    );
  });

  await test("sets cms-session-hint cookie with correct attributes", async () => {
    process.env.AUTH_HANDOVER_WHITELIST = "/auth-refresh-inbound";
    const r = createMockRequest({
      args: {
        r: "/auth-refresh-inbound",
        cookie: "foo.bar.cps.co.uk_POOL=value;baz.cps.co.uk_POOL=other",
      },
      headersIn: {
        "X-Forwarded-Proto": "https",
        Host: "proxy.example.com",
      },
    });
    nginx.appAuthRedirect(r);
    const setCookie = r.headersOut["Set-Cookie"];
    assert(setCookie !== undefined, "Should set cookie");
    assert(
      setCookie.includes("cms-session-hint="),
      `Should set cms-session-hint cookie, got: ${setCookie}`
    );
    assert(
      setCookie.includes("Path=/"),
      `Should have Path=/, got: ${setCookie}`
    );
    assert(
      setCookie.includes("Secure"),
      `Should have Secure attribute, got: ${setCookie}`
    );
    assert(
      setCookie.includes("SameSite=None"),
      `Should have SameSite=None, got: ${setCookie}`
    );
    assert(
      setCookie.includes("Expires="),
      `Should have Expires attribute, got: ${setCookie}`
    );
  });

  await test("session hint JSON contains cmsDomains array with extracted domains", async () => {
    process.env.AUTH_HANDOVER_WHITELIST = "/auth-refresh-inbound";
    const r = createMockRequest({
      args: {
        r: "/auth-refresh-inbound",
        cookie: "foo.bar.cps.co.uk_POOL=value;something.cps.co.uk_POOL=other",
      },
      headersIn: {
        "X-Forwarded-Proto": "https",
        Host: "proxy.example.com",
      },
    });
    nginx.appAuthRedirect(r);
    const hint = parseSessionHintCookie(r.headersOut["Set-Cookie"]);
    assertDeepEqual(
      hint.cmsDomains,
      ["foo.bar.cps.co.uk_POOL", "something.cps.co.uk_POOL"],
      "Should extract CMS domains into array"
    );
  });

  await test("session hint JSON has isProxySession false when param missing", async () => {
    process.env.AUTH_HANDOVER_WHITELIST = "/auth-refresh-inbound";
    const r = createMockRequest({
      args: {
        r: "/auth-refresh-inbound",
        cookie: "foo.cps.co.uk_POOL=value",
      },
      headersIn: {
        "X-Forwarded-Proto": "https",
        Host: "proxy.example.com",
      },
    });
    nginx.appAuthRedirect(r);
    const hint = parseSessionHintCookie(r.headersOut["Set-Cookie"]);
    assertEqual(hint.isProxySession, false, "isProxySession should be false");
  });

  await test("session hint JSON has isProxySession true when param is 'true'", async () => {
    process.env.AUTH_HANDOVER_WHITELIST = "/auth-refresh-inbound";
    const r = createMockRequest({
      args: {
        r: "/auth-refresh-inbound",
        cookie: "foo.cps.co.uk_POOL=value",
        "is-proxy-session": "true",
      },
      headersIn: {
        "X-Forwarded-Proto": "https",
        Host: "proxy.example.com",
      },
    });
    nginx.appAuthRedirect(r);
    const hint = parseSessionHintCookie(r.headersOut["Set-Cookie"]);
    assertEqual(hint.isProxySession, true, "isProxySession should be true");
  });

  await test("session hint JSON has empty cmsDomains when no CMS cookies present", async () => {
    process.env.AUTH_HANDOVER_WHITELIST = "/auth-refresh-inbound";
    const r = createMockRequest({
      args: {
        r: "/auth-refresh-inbound",
        cookie: "session=abc123;other=value",
      },
      headersIn: {
        "X-Forwarded-Proto": "https",
        Host: "proxy.example.com",
      },
    });
    nginx.appAuthRedirect(r);
    const hint = parseSessionHintCookie(r.headersOut["Set-Cookie"]);
    assertDeepEqual(hint.cmsDomains, [], "cmsDomains should be empty array");
  });

  await test("session hint JSON structure is complete", async () => {
    process.env.AUTH_HANDOVER_WHITELIST = "/auth-refresh-inbound";
    const r = createMockRequest({
      args: {
        r: "/auth-refresh-inbound",
        cookie: "test.cps.co.uk_POOL=x",
        "is-proxy-session": "true",
      },
      headersIn: {
        "X-Forwarded-Proto": "https",
        Host: "proxy.example.com",
      },
    });
    nginx.appAuthRedirect(r);
    const hint = parseSessionHintCookie(r.headersOut["Set-Cookie"]);
    assertDeepEqual(
      hint,
      { cmsDomains: ["test.cps.co.uk_POOL"], isProxySession: true },
      "Session hint should have correct structure"
    );
  });

  await test("creates r param from legacy args when r is missing", async () => {
    process.env.AUTH_HANDOVER_WHITELIST = "/auth-refresh-inbound";
    const r = createMockRequest({
      args: {
        q: "12345",
        referer: "http://cms.example.org/page",
        cookie: "session=abc",
      },
      headersIn: {
        "X-Forwarded-Proto": "https",
        Host: "proxy.example.com",
      },
    });
    nginx.appAuthRedirect(r);
    assertEqual(r.returnCode, 302, "Should return 302 redirect");
    assert(
      r.returnBody.includes("/auth-refresh-inbound"),
      `Should redirect to auth-refresh-inbound, got: ${r.returnBody}`
    );
    assert(
      r.returnBody.includes("q=12345"),
      `Should include q param, got: ${r.returnBody}`
    );
  });

  await test("appends cc with & when URL already has query params", async () => {
    process.env.AUTH_HANDOVER_WHITELIST = "http://allowed.example.org";
    const r = createMockRequest({
      args: {
        r: "http://allowed.example.org/callback?existing=param",
        cookie: "session=abc",
      },
      headersIn: {
        "X-Forwarded-Proto": "https",
        Host: "proxy.example.com",
      },
    });
    nginx.appAuthRedirect(r);
    assert(
      r.returnBody.includes("?existing=param&cc="),
      `Should append with &, got: ${r.returnBody}`
    );
  });

  await test("appends cc with ? when URL has no query params", async () => {
    process.env.AUTH_HANDOVER_WHITELIST = "http://allowed.example.org";
    const r = createMockRequest({
      args: {
        r: "http://allowed.example.org/callback",
        cookie: "session=abc",
      },
      headersIn: {
        "X-Forwarded-Proto": "https",
        Host: "proxy.example.com",
      },
    });
    nginx.appAuthRedirect(r);
    assert(
      r.returnBody.includes("/callback?cc="),
      `Should append with ?, got: ${r.returnBody}`
    );
  });

  // --- polarisAuthRedirect tests ---
  console.log("\npolarisAuthRedirect:");

  await test("redirects to /init with args and cookies", async () => {
    const r = createMockRequest({
      args: {
        q: "12345",
      },
      headersIn: {
        "X-Forwarded-Proto": "https",
        Host: "proxy.example.com",
        Cookie: "session=abc123",
        Referer: "http://cms.example.org/page",
      },
    });
    nginx.polarisAuthRedirect(r);
    assertEqual(r.returnCode, 302, "Should return 302 redirect");
    assert(
      r.returnBody.includes("/init?"),
      `Should redirect to /init, got: ${r.returnBody}`
    );
    assert(
      r.returnBody.includes("q=12345"),
      `Should include original q param, got: ${r.returnBody}`
    );
    assert(
      r.returnBody.includes("cookie=session%3Dabc123"),
      `Should include cookie param, got: ${r.returnBody}`
    );
    assert(
      r.returnBody.includes("is-proxy-session=true"),
      `Should include is-proxy-session=true, got: ${r.returnBody}`
    );
  });

  await test("includes referer in redirect", async () => {
    const r = createMockRequest({
      args: {},
      headersIn: {
        "X-Forwarded-Proto": "https",
        Host: "proxy.example.com",
        Cookie: "session=abc",
        Referer: "http://cms.example.org/somepage",
      },
    });
    nginx.polarisAuthRedirect(r);
    assert(
      r.returnBody.includes("referer="),
      `Should include referer param, got: ${r.returnBody}`
    );
  });

  // --- taskListAuthRedirect tests ---
  console.log("\ntaskListAuthRedirect:");

  await test("redirects to task list with cookie from cc param", async () => {
    const r = createMockRequest({
      args: {
        r: "/some-path",
        cc: "session=abc123",
      },
      headersIn: {
        "X-Forwarded-Proto": "https",
        Host: "proxy.example.com",
      },
      variables: {
        taskListHostAddress: "http://tasklist.example.org",
      },
    });
    nginx.taskListAuthRedirect(r);
    assertEqual(r.returnCode, 302, "Should return 302 redirect");
    assert(
      r.returnBody.includes("http://tasklist.example.org/WorkManagementApp/Redirect"),
      `Should redirect to task list, got: ${r.returnBody}`
    );
    assert(
      r.returnBody.includes("Cookie=session%3Dabc123"),
      `Should include encoded cookie, got: ${r.returnBody}`
    );
  });

  await test("falls back to request Cookie header when cc param missing", async () => {
    const r = createMockRequest({
      args: {
        r: "/some-path",
      },
      headersIn: {
        "X-Forwarded-Proto": "https",
        Host: "proxy.example.com",
        Cookie: "fallback=cookie",
      },
      variables: {
        taskListHostAddress: "http://tasklist.example.org",
      },
    });
    nginx.taskListAuthRedirect(r);
    assert(
      r.returnBody.includes("Cookie=fallback%3Dcookie"),
      `Should use Cookie header as fallback, got: ${r.returnBody}`
    );
  });

  // --- _redirectToAbsoluteUrl behavior (tested via exported functions) ---
  console.log("\nredirect URL handling:");

  await test("converts relative URL to absolute using X-Forwarded-Proto", async () => {
    process.env.AUTH_HANDOVER_WHITELIST = "/auth-refresh-inbound";
    const r = createMockRequest({
      args: {
        r: "/auth-refresh-inbound",
        cookie: "session=abc",
      },
      headersIn: {
        "X-Forwarded-Proto": "https",
        Host: "proxy.example.com",
      },
    });
    nginx.appAuthRedirect(r);
    assert(
      r.returnBody.startsWith("https://proxy.example.com/"),
      `Should convert to absolute URL with https, got: ${r.returnBody}`
    );
  });

  await test("preserves absolute URL starting with http", async () => {
    process.env.AUTH_HANDOVER_WHITELIST = "http://external.example.org";
    const r = createMockRequest({
      args: {
        r: "http://external.example.org/callback",
        cookie: "session=abc",
      },
      headersIn: {
        "X-Forwarded-Proto": "https",
        Host: "proxy.example.com",
      },
    });
    nginx.appAuthRedirect(r);
    assert(
      r.returnBody.startsWith("http://external.example.org/"),
      `Should preserve absolute URL, got: ${r.returnBody}`
    );
  });

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

// Main
(async () => {
  try {
    await build();
    await runTests();
  } catch (err) {
    console.error("Build/test failed:", err.message);
    process.exit(1);
  }
})();
