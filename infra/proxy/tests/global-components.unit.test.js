#!/usr/bin/env node
/**
 * Build and run unit tests for global-components.js
 *
 * Uses esbuild to bundle the njs module with mocked VARIABLES,
 * then runs the unit tests against the bundled code.
 */

const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

const CONFIG_DIR = path.join(__dirname, "..", "config");
const TEST_DIR = __dirname;
const DIST_DIR = path.join(TEST_DIR, ".dist");

// Ensure dist directory exists
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

// Mock VARIABLES for testing
const mockVariables = `
export default {
  upstreamUrl: "http://mock-upstream:3000/api/",
  functionsKey: "test-functions-key",
  healthCheckAllowedUrls: ["http://allowed-url.com/health"],
  healthCheckTimeoutMs: 2000,
  corsAllowedOrigins: ["https://example.com", "https://allowed-origin.com"],
  deployVersion: 42,
};
`;

// Write mock variables file
const mockVarsPath = path.join(DIST_DIR, "mock-vars.js");
fs.writeFileSync(mockVarsPath, mockVariables);

// Bundle the module with mocked imports
async function build() {
  await esbuild.build({
    entryPoints: [path.join(CONFIG_DIR, "global-components.js")],
    bundle: true,
    outfile: path.join(DIST_DIR, "global-components.bundle.js"),
    format: "esm",
    platform: "node",
    alias: {
      "templates/global-components-vars.js": mockVarsPath,
    },
    logLevel: "error",
  });
}

// Run tests
async function runTests() {
  // Dynamic import of the bundled module
  const modulePath = path.join(DIST_DIR, "global-components.bundle.js");
  const module = await import(modulePath);
  const gloco = module.default;

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
      uri: options.uri || "/api/global-components/test",
      args: options.args || {},
      headersIn: options.headersIn || {},
      headersOut: {},
      variables: options.variables || {},
      returnCode: null,
      returnBody: null,
      sentBuffer: null,
      sentFlags: null,
      return(code, body) {
        this.returnCode = code;
        this.returnBody = body;
      },
      sendBuffer(buffer, flags) {
        this.sentBuffer = buffer;
        this.sentFlags = flags;
      },
    };
  }

  // Mock ngx.fetch globally
  let mockFetchResponse = { status: 200 };
  let mockFetchError = null;
  globalThis.ngx = {
    fetch: async (url, options) => {
      if (mockFetchError) throw mockFetchError;
      return mockFetchResponse;
    },
  };

  console.log("=".repeat(60));
  console.log("global-components.js Unit Tests");
  console.log("=".repeat(60));

  // --- getCmsAuthValues tests ---
  console.log("\ngetCmsAuthValues:");

  await test("returns header value if present", async () => {
    const r = createMockRequest({
      headersIn: { "Cms-Auth-Values": "userId=123" },
    });
    assertEqual(gloco.getCmsAuthValues(r), "userId=123", "Should return header value");
  });

  await test("decodes encoded header value", async () => {
    const r = createMockRequest({
      headersIn: { "Cms-Auth-Values": "userId%3D123" },
    });
    assertEqual(gloco.getCmsAuthValues(r), "userId=123", "Should decode header value");
  });

  await test("falls back to cookie if header missing", async () => {
    const r = createMockRequest({
      headersIn: { Cookie: "Cms-Auth-Values=fromCookie" },
    });
    assertEqual(gloco.getCmsAuthValues(r), "fromCookie", "Should return cookie value");
  });

  await test("header takes precedence over cookie", async () => {
    const r = createMockRequest({
      headersIn: {
        "Cms-Auth-Values": "fromHeader",
        Cookie: "Cms-Auth-Values=fromCookie",
      },
    });
    assertEqual(gloco.getCmsAuthValues(r), "fromHeader", "Should prefer header");
  });

  await test("returns empty string if neither present", async () => {
    const r = createMockRequest({});
    assertEqual(gloco.getCmsAuthValues(r), "", "Should return empty string");
  });

  // --- getCorsOrigin tests ---
  console.log("\ngetCorsOrigin:");

  await test("returns origin if allowed", async () => {
    const r = createMockRequest({
      headersIn: { Origin: "https://example.com" },
    });
    assertEqual(gloco.getCorsOrigin(r), "https://example.com", "Should return origin");
  });

  await test("returns empty string if not allowed", async () => {
    const r = createMockRequest({
      headersIn: { Origin: "https://evil.com" },
    });
    assertEqual(gloco.getCorsOrigin(r), "", "Should return empty string");
  });

  // --- getUpstreamUrl tests ---
  console.log("\ngetUpstreamUrl:");

  await test("returns upstream URL from VARIABLES", async () => {
    const r = createMockRequest({});
    assertEqual(
      gloco.getUpstreamUrl(r),
      "http://mock-upstream:3000/api/",
      "Should return upstream URL"
    );
  });

  // --- getFunctionsKey tests ---
  console.log("\ngetFunctionsKey:");

  await test("returns functions key from VARIABLES", async () => {
    const r = createMockRequest({});
    assertEqual(gloco.getFunctionsKey(r), "test-functions-key", "Should return functions key");
  });

  // --- handleCorsPreflightRequest tests ---
  console.log("\nhandleCorsPreflightRequest:");

  await test("returns 403 for disallowed origin", async () => {
    const r = createMockRequest({
      headersIn: { Origin: "https://evil.com" },
    });
    gloco.handleCorsPreflightRequest(r);
    assertEqual(r.returnCode, 403, "Should return 403");
  });

  await test("returns 204 with CORS headers for allowed origin", async () => {
    const r = createMockRequest({
      headersIn: { Origin: "https://example.com" },
    });
    gloco.handleCorsPreflightRequest(r);
    assertEqual(r.returnCode, 204, "Should return 204");
    assertEqual(
      r.headersOut["Access-Control-Allow-Origin"],
      "https://example.com",
      "Should set Allow-Origin"
    );
    assertEqual(r.headersOut["Access-Control-Allow-Credentials"], "true", "Should set Allow-Credentials");
    assertEqual(r.headersOut["Vary"], "Origin", "Should set Vary");
  });

  // --- swaggerBodyFilter tests ---
  console.log("\nswaggerBodyFilter:");

  await test("replaces upstream URL with proxy URL", async () => {
    const r = createMockRequest({
      headersIn: { Host: "proxy.example.com" },
    });
    const data = '{"server": "http://mock-upstream:3000/api/"}';
    gloco.swaggerBodyFilter(r, data, {});
    assert(
      r.sentBuffer.includes("https://proxy.example.com/api/global-components"),
      `Should replace upstream URL, got: ${r.sentBuffer}`
    );
  });

  await test("rewrites API paths", async () => {
    const r = createMockRequest({
      headersIn: { Host: "proxy.example.com" },
    });
    const data = '{"path": "/api/users"}';
    gloco.swaggerBodyFilter(r, data, {});
    assert(
      r.sentBuffer.includes('"/api/global-components/users"'),
      `Should rewrite API path, got: ${r.sentBuffer}`
    );
  });

  // --- handleHealthCheck tests ---
  console.log("\nhandleHealthCheck:");

  await test("returns 400 if url parameter missing", async () => {
    const r = createMockRequest({ args: {} });
    await gloco.handleHealthCheck(r);
    assertEqual(r.returnCode, 400, "Should return 400");
    assert(r.returnBody.includes("url parameter required"), "Should have error message");
  });

  await test("returns 403 if url not in whitelist", async () => {
    const r = createMockRequest({ args: { url: "http://evil.com" } });
    await gloco.handleHealthCheck(r);
    assertEqual(r.returnCode, 403, "Should return 403");
    assert(r.returnBody.includes("url not in whitelist"), "Should have error message");
  });

  await test("returns healthy true for 2xx response", async () => {
    mockFetchResponse = { status: 200 };
    mockFetchError = null;
    const r = createMockRequest({
      args: { url: "http://allowed-url.com/health" },
    });
    await gloco.handleHealthCheck(r);
    assertEqual(r.returnCode, 200, "Should return 200");
    const body = JSON.parse(r.returnBody);
    assertEqual(body.healthy, true, "Should be healthy");
    assertEqual(body.status, 200, "Should have status 200");
  });

  await test("returns healthy false for 5xx response", async () => {
    mockFetchResponse = { status: 500 };
    mockFetchError = null;
    const r = createMockRequest({
      args: { url: "http://allowed-url.com/health" },
    });
    await gloco.handleHealthCheck(r);
    const body = JSON.parse(r.returnBody);
    assertEqual(body.healthy, false, "Should not be healthy");
    assertEqual(body.status, 500, "Should have status 500");
  });

  await test("returns healthy false on fetch error", async () => {
    mockFetchError = new Error("Connection refused");
    const r = createMockRequest({
      args: { url: "http://allowed-url.com/health" },
    });
    await gloco.handleHealthCheck(r);
    const body = JSON.parse(r.returnBody);
    assertEqual(body.healthy, false, "Should not be healthy");
    assertEqual(body.status, 0, "Should have status 0");
    assertEqual(body.error, "Connection refused", "Should have error message");
    mockFetchError = null;
  });

  // --- handleStatus tests ---
  console.log("\nhandleStatus:");

  await test("returns JSON with status and version", async () => {
    const r = createMockRequest({});
    gloco.handleStatus(r);
    assertEqual(r.returnCode, 200, "Should return 200");
    assertEqual(r.headersOut["Content-Type"], "application/json", "Should be JSON");
    const body = JSON.parse(r.returnBody);
    assertEqual(body.status, "online", "Should have status online");
    assertEqual(body.version, 42, "Should have version from VARIABLES");
  });

  // --- handleCookieRoute tests ---
  // Note: handleCookieRoute is currently commented out in global-components.js
  // console.log("\nhandleCookieRoute:");

  // await test("returns 403 for disallowed origin", async () => {
  //   const r = createMockRequest({
  //     headersIn: { Origin: "https://evil.com" },
  //   });
  //   gloco.handleCookieRoute(r);
  //   assertEqual(r.returnCode, 403, "Should return 403");
  // });

  // await test("handles OPTIONS by delegating to CORS handler", async () => {
  //   const r = createMockRequest({
  //     method: "OPTIONS",
  //     headersIn: { Origin: "https://example.com" },
  //   });
  //   gloco.handleCookieRoute(r);
  //   assertEqual(r.returnCode, 204, "Should return 204 for OPTIONS");
  // });

  // await test("GET returns cookies from request", async () => {
  //   const r = createMockRequest({
  //     method: "GET",
  //     headersIn: {
  //       Origin: "https://example.com",
  //       Cookie: "session=abc123",
  //     },
  //   });
  //   gloco.handleCookieRoute(r);
  //   assertEqual(r.returnCode, 200, "Should return 200");
  //   assert(r.returnBody.includes("session=abc123"), "Should echo cookies");
  // });

  // await test("GET returns '(no cookies)' when none sent", async () => {
  //   const r = createMockRequest({
  //     method: "GET",
  //     headersIn: { Origin: "https://example.com" },
  //   });
  //   gloco.handleCookieRoute(r);
  //   assertEqual(r.returnBody, "(no cookies)", "Should return no cookies message");
  // });

  // await test("POST sets cookie with origin and timestamp", async () => {
  //   const r = createMockRequest({
  //     method: "POST",
  //     uri: "/api/global-components/cookie",
  //     headersIn: { Origin: "https://example.com" },
  //   });
  //   gloco.handleCookieRoute(r);
  //   assertEqual(r.returnCode, 200, "Should return 200");
  //   const setCookie = r.headersOut["Set-Cookie"];
  //   assert(setCookie.includes("cps-global-components-state="), "Should set cookie");
  //   assert(setCookie.includes("https://example.com:"), "Should include origin");
  //   assert(setCookie.includes("Path=/api/global-components/cookie"), "Should have correct path");
  //   assert(setCookie.includes("Secure"), "Should have Secure");
  //   assert(setCookie.includes("SameSite=None"), "Should have SameSite=None");
  // });

  // await test("POST appends to existing cookie value", async () => {
  //   const existingValue = "https://example.com:2024-01-01T10:00:00.000Z";
  //   const r = createMockRequest({
  //     method: "POST",
  //     uri: "/api/global-components/cookie",
  //     headersIn: {
  //       Origin: "https://example.com",
  //       Cookie: `cps-global-components-state=${existingValue}`,
  //     },
  //   });
  //   gloco.handleCookieRoute(r);
  //   const setCookie = r.headersOut["Set-Cookie"];
  //   assert(setCookie.includes("|"), "Should have pipe separator");
  //   assert(setCookie.includes(existingValue), "Should include existing value");
  // });

  // await test("sets CORS headers on response", async () => {
  //   const r = createMockRequest({
  //     method: "GET",
  //     headersIn: { Origin: "https://example.com" },
  //   });
  //   gloco.handleCookieRoute(r);
  //   assertEqual(
  //     r.headersOut["Access-Control-Allow-Origin"],
  //     "https://example.com",
  //     "Should set Allow-Origin"
  //   );
  //   assertEqual(r.headersOut["Access-Control-Allow-Credentials"], "true", "Should set Allow-Credentials");
  // });

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
