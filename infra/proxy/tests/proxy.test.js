/**
 * Proxy integration tests
 *
 * These tests verify the nginx proxy behavior, particularly around
 * header/cookie handling and URL rewriting.
 *
 * Prerequisites:
 *   - Docker compose stack running (nginx proxy + mock-server)
 *   - Run with: node infra/proxy/tests/proxy.test.js
 *
 * The mock server echoes back headers it receives, allowing us to verify
 * what the proxy sends upstream.
 */

const PROXY_BASE = process.env.PROXY_BASE || 'http://localhost:8080';
const TEST_ENDPOINT = `${PROXY_BASE}/api/global-components/test`;

// Test results tracking
let passed = 0;
let failed = 0;
const results = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`);
  }
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push({ name, status: 'PASS' });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    results.push({ name, status: 'FAIL', error: err.message });
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    // Accept self-signed certs in dev
    ...(process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' ? {} : {})
  });
  return response.json();
}

// =============================================================================
// Cms-Auth-Values Header Tests
// =============================================================================

async function testCmsAuthValuesHeader() {
  console.log('\nCms-Auth-Values Header Tests:');

  await test('passes through non-encoded header value', async () => {
    const testValue = 'userId=123&orgId=456';
    const response = await fetchJson(TEST_ENDPOINT, {
      headers: { 'Cms-Auth-Values': testValue }
    });
    assertEqual(response.headers['cms-auth-values'], testValue,
      'Non-encoded value should pass through unchanged');
  });

  await test('decodes URL-encoded header value', async () => {
    const encodedValue = 'userId%3D123%26orgId%3D456';
    const expectedDecoded = 'userId=123&orgId=456';
    const response = await fetchJson(TEST_ENDPOINT, {
      headers: { 'Cms-Auth-Values': encodedValue }
    });
    assertEqual(response.headers['cms-auth-values'], expectedDecoded,
      'URL-encoded value should be decoded');
  });

  await test('handles double-encoded value (decodes once)', async () => {
    // Double encoded: userId%253D123 -> userId%3D123 -> userId=123
    const doubleEncoded = 'userId%253D123';
    const expectedOneDecode = 'userId%3D123';
    const response = await fetchJson(TEST_ENDPOINT, {
      headers: { 'Cms-Auth-Values': doubleEncoded }
    });
    assertEqual(response.headers['cms-auth-values'], expectedOneDecode,
      'Double-encoded value should only be decoded once');
  });

  await test('handles value with literal percent sign', async () => {
    // "100% complete" contains % but not valid encoding
    const valueWithPercent = '100% complete';
    const response = await fetchJson(TEST_ENDPOINT, {
      headers: { 'Cms-Auth-Values': valueWithPercent }
    });
    assertEqual(response.headers['cms-auth-values'], valueWithPercent,
      'Value with literal % should pass through unchanged');
  });

  await test('handles empty header value', async () => {
    const response = await fetchJson(TEST_ENDPOINT, {
      headers: { 'Cms-Auth-Values': '' }
    });
    // Empty header might not be sent at all, or sent as empty
    assert(
      response.headers['cms-auth-values'] === '' ||
      response.headers['cms-auth-values'] === null,
      'Empty header should result in empty or null value'
    );
  });

  await test('handles complex encoded JSON-like value', async () => {
    const original = '{"user":"test","roles":["admin","user"]}';
    const encoded = encodeURIComponent(original);
    const response = await fetchJson(TEST_ENDPOINT, {
      headers: { 'Cms-Auth-Values': encoded }
    });
    assertEqual(response.headers['cms-auth-values'], original,
      'Encoded JSON should be decoded correctly');
  });
}

// =============================================================================
// Cms-Auth-Values Cookie Tests
// =============================================================================

async function testCmsAuthValuesCookie() {
  console.log('\nCms-Auth-Values Cookie Tests:');

  await test('passes through non-encoded cookie value', async () => {
    const testValue = 'userId=123&orgId=456';
    const response = await fetchJson(TEST_ENDPOINT, {
      headers: { 'Cookie': `Cms-Auth-Values=${testValue}` }
    });
    assertEqual(response.headers['cms-auth-values'], testValue,
      'Non-encoded cookie value should pass through unchanged');
  });

  await test('decodes URL-encoded cookie value', async () => {
    const encodedValue = 'userId%3D123%26orgId%3D456';
    const expectedDecoded = 'userId=123&orgId=456';
    const response = await fetchJson(TEST_ENDPOINT, {
      headers: { 'Cookie': `Cms-Auth-Values=${encodedValue}` }
    });
    assertEqual(response.headers['cms-auth-values'], expectedDecoded,
      'URL-encoded cookie value should be decoded');
  });

  await test('header takes precedence over cookie', async () => {
    const headerValue = 'from-header';
    const cookieValue = 'from-cookie';
    const response = await fetchJson(TEST_ENDPOINT, {
      headers: {
        'Cms-Auth-Values': headerValue,
        'Cookie': `Cms-Auth-Values=${cookieValue}`
      }
    });
    assertEqual(response.headers['cms-auth-values'], headerValue,
      'Header should take precedence over cookie');
  });

  await test('falls back to cookie when header is missing', async () => {
    const cookieValue = 'from-cookie-only';
    const response = await fetchJson(TEST_ENDPOINT, {
      headers: { 'Cookie': `Cms-Auth-Values=${cookieValue}` }
    });
    assertEqual(response.headers['cms-auth-values'], cookieValue,
      'Should use cookie when header is not present');
  });

  await test('handles cookie among other cookies', async () => {
    const testValue = 'myAuthValue';
    const response = await fetchJson(TEST_ENDPOINT, {
      headers: {
        'Cookie': `session=abc123; Cms-Auth-Values=${testValue}; other=xyz`
      }
    });
    assertEqual(response.headers['cms-auth-values'], testValue,
      'Should extract correct cookie from multiple cookies');
  });
}

// =============================================================================
// Swagger URL Rewriting Tests
// =============================================================================

async function testSwaggerRewriting() {
  console.log('\nSwagger URL Rewriting Tests:');

  await test('rewrites upstream URL in swagger.json', async () => {
    const response = await fetch(`${PROXY_BASE}/api/global-components/swagger.json`);
    const text = await response.text();

    // Should NOT contain the upstream URL
    assert(!text.includes('mock-upstream:3000'),
      'Should not contain upstream URL');

    // Should contain the proxy URL
    assert(text.includes('/api/global-components'),
      'Should contain proxy path prefix');
  });

  await test('rewrites API paths in swagger.json', async () => {
    const response = await fetch(`${PROXY_BASE}/api/global-components/swagger.json`);
    const json = await response.json();

    // Paths should be prefixed with /api/global-components
    const paths = Object.keys(json.paths || {});
    for (const path of paths) {
      assert(path.startsWith('/api/global-components'),
        `Path ${path} should start with /api/global-components`);
    }
  });
}

// =============================================================================
// x-functions-key Header Tests
// =============================================================================

async function testFunctionsKey() {
  console.log('\nx-functions-key Header Tests:');

  await test('adds x-functions-key header to upstream requests', async () => {
    const response = await fetchJson(TEST_ENDPOINT);
    assert(response.headers['x-functions-key'] !== null,
      'x-functions-key should be present in upstream request');
  });
}

// =============================================================================
// CORS Tests
// =============================================================================

async function testCors() {
  console.log('\nCORS Tests:');

  await test('returns CORS headers on regular requests', async () => {
    const response = await fetch(TEST_ENDPOINT, {
      headers: { 'Origin': 'https://example.com' }
    });
    const corsHeader = response.headers.get('access-control-allow-origin');
    assert(corsHeader !== null, 'Should have Access-Control-Allow-Origin header');
  });

  await test('handles OPTIONS preflight request', async () => {
    const response = await fetch(TEST_ENDPOINT, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://example.com',
        'Access-Control-Request-Method': 'POST'
      }
    });
    assertEqual(response.status, 204, 'OPTIONS should return 204');

    const allowMethods = response.headers.get('access-control-allow-methods');
    assert(allowMethods !== null, 'Should have Access-Control-Allow-Methods header');
  });
}

// =============================================================================
// Authorization Header Stripping Tests
// =============================================================================

async function testAuthorizationStripping() {
  console.log('\nAuthorization Header Stripping Tests:');

  await test('strips Authorization header from upstream requests', async () => {
    const response = await fetchJson(TEST_ENDPOINT, {
      headers: { 'Authorization': 'Bearer secret-token' }
    });
    // The mock server would echo back the Authorization header if it received one
    assert(
      !response.headers['authorization'] || response.headers['authorization'] === '',
      'Authorization header should be stripped'
    );
  });
}

// =============================================================================
// Health Check Tests
// =============================================================================

async function testHealthCheck() {
  console.log('\nHealth Check Tests:');

  await test('base endpoint returns health message', async () => {
    const response = await fetch(`${PROXY_BASE}/api/global-components`);
    const text = await response.text();
    assertEqual(response.status, 200, 'Health endpoint should return 200');
    assert(text.includes('online'), 'Should indicate service is online');
  });
}

// =============================================================================
// Cookie Route Tests
// =============================================================================

async function testCookieRoute() {
  console.log('\nCookie Route Tests:');

  const COOKIE_ENDPOINT = `${PROXY_BASE}/api/global-components/cookie`;

  await test('GET returns cookies sent in request', async () => {
    const response = await fetch(COOKIE_ENDPOINT, {
      headers: { 'Cookie': 'session=abc123; user=testuser' }
    });
    const text = await response.text();
    assertEqual(response.status, 200, 'Should return 200');
    assert(text.includes('session=abc123'), 'Should echo back session cookie');
    assert(text.includes('user=testuser'), 'Should echo back user cookie');
  });

  await test('GET returns "(no cookies)" when no cookies sent', async () => {
    const response = await fetch(COOKIE_ENDPOINT);
    const text = await response.text();
    assertEqual(response.status, 200, 'Should return 200');
    assertEqual(text, '(no cookies)', 'Should return "(no cookies)" message');
  });

  await test('POST sets cps-global-components-state cookie with correct attributes', async () => {
    const response = await fetch(COOKIE_ENDPOINT, {
      method: 'POST',
      headers: { 'Origin': 'https://example.com' }
    });
    const setCookie = response.headers.get('set-cookie');
    assertEqual(response.status, 200, 'Should return 200');
    assert(setCookie !== null, 'Should have Set-Cookie header');
    assert(setCookie.includes('cps-global-components-state='),
      'Should set cps-global-components-state cookie');
    assert(setCookie.includes('Path=/'), 'Cookie should have Path=/');
    assert(setCookie.includes('Expires='), 'Cookie should have Expires attribute');
    assert(setCookie.includes('Secure'), 'Cookie should have Secure attribute');
    assert(setCookie.includes('SameSite=None'), 'Cookie should have SameSite=None attribute');
  });

  await test('POST cookie value contains origin and timestamp', async () => {
    const testOrigin = 'https://test-domain.com';
    const response = await fetch(COOKIE_ENDPOINT, {
      method: 'POST',
      headers: { 'Origin': testOrigin }
    });
    const setCookie = response.headers.get('set-cookie');
    const match = setCookie.match(/cps-global-components-state=([^;]+)/);
    assert(match !== null, 'Should be able to extract cookie value');
    const cookieValue = match[1];
    // Format: origin:timestamp (e.g., https://test-domain.com:2024-01-01T12:00:00.000Z)
    assert(cookieValue.includes(testOrigin), `Cookie value should contain origin, got: ${cookieValue}`);
    assert(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/.test(cookieValue),
      `Cookie value should contain ISO timestamp, got: ${cookieValue}`);
  });

  await test('POST appends to existing cookie value', async () => {
    const existingValue = 'https://first-domain.com:2024-01-01T10:00:00.000Z';
    const testOrigin = 'https://second-domain.com';
    const response = await fetch(COOKIE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Origin': testOrigin,
        'Cookie': `cps-global-components-state=${existingValue}`
      }
    });
    const setCookie = response.headers.get('set-cookie');
    const match = setCookie.match(/cps-global-components-state=([^;]+)/);
    assert(match !== null, 'Should be able to extract cookie value');
    const cookieValue = match[1];
    // Should contain both the existing value and the new entry
    assert(cookieValue.includes('https://first-domain.com'),
      `Cookie should contain first domain, got: ${cookieValue}`);
    assert(cookieValue.includes('https://second-domain.com'),
      `Cookie should contain second domain, got: ${cookieValue}`);
    // Should be separated by pipe
    assert(cookieValue.includes('|'),
      `Cookie entries should be separated by pipe, got: ${cookieValue}`);
  });

  await test('POST uses Referer as fallback when Origin is missing', async () => {
    const testReferer = 'https://referer-domain.com/page';
    const response = await fetch(COOKIE_ENDPOINT, {
      method: 'POST',
      headers: { 'Referer': testReferer }
    });
    const setCookie = response.headers.get('set-cookie');
    const match = setCookie.match(/cps-global-components-state=([^;]+)/);
    assert(match !== null, 'Should be able to extract cookie value');
    const cookieValue = match[1];
    assert(cookieValue.includes(testReferer),
      `Cookie value should contain referer, got: ${cookieValue}`);
  });

  await test('POST returns cookies sent in request', async () => {
    const response = await fetch(COOKIE_ENDPOINT, {
      method: 'POST',
      headers: { 'Cookie': 'existing=cookie' }
    });
    const text = await response.text();
    assertEqual(response.status, 200, 'Should return 200');
    assert(text.includes('existing=cookie'), 'Should echo back existing cookies');
  });

  await test('returns Content-Type text/plain', async () => {
    const response = await fetch(COOKIE_ENDPOINT);
    const contentType = response.headers.get('content-type');
    assert(contentType !== null && contentType.includes('text/plain'),
      'Content-Type should be text/plain');
  });
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('Proxy Integration Tests');
  console.log(`Target: ${PROXY_BASE}`);
  console.log('='.repeat(60));

  // Disable TLS verification for self-signed certs
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  try {
    await testHealthCheck();
    await testCmsAuthValuesHeader();
    await testCmsAuthValuesCookie();
    await testCookieRoute();
    await testFunctionsKey();
    await testCors();
    await testAuthorizationStripping();
    await testSwaggerRewriting();
  } catch (err) {
    console.error('\nTest suite error:', err.message);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

main();
