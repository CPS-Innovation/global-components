/**
 * Proxy integration tests
 *
 * These tests verify the nginx proxy behavior, particularly around
 * header/cookie handling and URL rewriting.
 *
 * Prerequisites:
 *   - Docker compose stack running (nginx proxy + mock-server)
 *   - Run with: node infra/proxy/tests/proxy.integration.test.js
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

  await test('base endpoint returns JSON with status and version', async () => {
    const response = await fetch(`${PROXY_BASE}/api/global-components`);
    assertEqual(response.status, 200, 'Health endpoint should return 200');
    const contentType = response.headers.get('content-type');
    assert(contentType.includes('application/json'), 'Should return JSON');
    const body = await response.json();
    assertEqual(body.status, 'online', 'Should have status online');
    assert(typeof body.version === 'number', 'Should have numeric version');
  });
}

// =============================================================================
// Cookie Route Tests
// =============================================================================
// Note: handleCookieRoute is currently commented out in global-components.js

// async function testCookieRoute() {
//   console.log('\nCookie Route Tests:');

//   const COOKIE_ENDPOINT = `${PROXY_BASE}/api/global-components/cookie`;
//   const ALLOWED_ORIGIN = 'https://example.com';

//   await test('GET returns cookies sent in request', async () => {
//     const response = await fetch(COOKIE_ENDPOINT, {
//       headers: { 'Cookie': 'session=abc123; user=testuser', 'Origin': ALLOWED_ORIGIN }
//     });
//     const text = await response.text();
//     assertEqual(response.status, 200, 'Should return 200');
//     assert(text.includes('session=abc123'), 'Should echo back session cookie');
//     assert(text.includes('user=testuser'), 'Should echo back user cookie');
//   });

//   await test('GET returns "(no cookies)" when no cookies sent', async () => {
//     const response = await fetch(COOKIE_ENDPOINT, {
//       headers: { 'Origin': ALLOWED_ORIGIN }
//     });
//     const text = await response.text();
//     assertEqual(response.status, 200, 'Should return 200');
//     assertEqual(text, '(no cookies)', 'Should return "(no cookies)" message');
//   });

//   await test('GET returns 403 for disallowed origin', async () => {
//     const response = await fetch(COOKIE_ENDPOINT, {
//       headers: { 'Origin': 'https://evil.com' }
//     });
//     assertEqual(response.status, 403, 'Should return 403 for disallowed origin');
//   });

//   await test('POST sets cps-global-components-state cookie with correct attributes', async () => {
//     const response = await fetch(COOKIE_ENDPOINT, {
//       method: 'POST',
//       headers: { 'Origin': ALLOWED_ORIGIN }
//     });
//     const setCookie = response.headers.get('set-cookie');
//     assertEqual(response.status, 200, 'Should return 200');
//     assert(setCookie !== null, 'Should have Set-Cookie header');
//     assert(setCookie.includes('cps-global-components-state='),
//       'Should set cps-global-components-state cookie');
//     assert(setCookie.includes('Path=/api/global-components/cookie'), 'Cookie should have Path=/api/global-components/cookie');
//     assert(setCookie.includes('Expires='), 'Cookie should have Expires attribute');
//     assert(setCookie.includes('Secure'), 'Cookie should have Secure attribute');
//     assert(setCookie.includes('SameSite=None'), 'Cookie should have SameSite=None attribute');
//   });

//   await test('POST cookie value contains origin and timestamp', async () => {
//     const response = await fetch(COOKIE_ENDPOINT, {
//       method: 'POST',
//       headers: { 'Origin': ALLOWED_ORIGIN }
//     });
//     const setCookie = response.headers.get('set-cookie');
//     const match = setCookie.match(/cps-global-components-state=([^;]+)/);
//     assert(match !== null, 'Should be able to extract cookie value');
//     const cookieValue = match[1];
//     // Format: origin:timestamp (e.g., https://example.com:2024-01-01T12:00:00.000Z)
//     assert(cookieValue.includes(ALLOWED_ORIGIN), `Cookie value should contain origin, got: ${cookieValue}`);
//     assert(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/.test(cookieValue),
//       `Cookie value should contain ISO timestamp, got: ${cookieValue}`);
//   });

//   await test('POST appends to existing cookie value', async () => {
//     const existingValue = 'https://example.com:2024-01-01T10:00:00.000Z';
//     const response = await fetch(COOKIE_ENDPOINT, {
//       method: 'POST',
//       headers: {
//         'Origin': ALLOWED_ORIGIN,
//         'Cookie': `cps-global-components-state=${existingValue}`
//       }
//     });
//     const setCookie = response.headers.get('set-cookie');
//     const match = setCookie.match(/cps-global-components-state=([^;]+)/);
//     assert(match !== null, 'Should be able to extract cookie value');
//     const cookieValue = match[1];
//     // Should contain both entries separated by pipe
//     assert(cookieValue.includes('|'),
//       `Cookie entries should be separated by pipe, got: ${cookieValue}`);
//     // Should have two timestamps (one from existing, one new)
//     const timestamps = cookieValue.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g);
//     assertEqual(timestamps.length, 2, `Should have 2 timestamps, got: ${cookieValue}`);
//   });

//   await test('POST returns cookies sent in request', async () => {
//     const response = await fetch(COOKIE_ENDPOINT, {
//       method: 'POST',
//       headers: { 'Cookie': 'existing=cookie', 'Origin': ALLOWED_ORIGIN }
//     });
//     const text = await response.text();
//     assertEqual(response.status, 200, 'Should return 200');
//     assert(text.includes('existing=cookie'), 'Should echo back existing cookies');
//   });

//   await test('returns Content-Type text/plain', async () => {
//     const response = await fetch(COOKIE_ENDPOINT, {
//       headers: { 'Origin': ALLOWED_ORIGIN }
//     });
//     const contentType = response.headers.get('content-type');
//     assert(contentType !== null && contentType.includes('text/plain'),
//       'Content-Type should be text/plain');
//   });
// }

// =============================================================================
// Session Hint Tests
// =============================================================================

async function testSessionHint() {
  console.log('\nSession Hint Tests (/api/global-components/session-hint):');

  const SESSION_HINT_ENDPOINT = `${PROXY_BASE}/api/global-components/session-hint`;

  await test('returns "null" when no cms-session-hint cookie is present', async () => {
    const response = await fetch(SESSION_HINT_ENDPOINT);
    const text = await response.text();
    assertEqual(response.status, 200, 'Should return 200');
    assertEqual(text, 'null', 'Should return "null" when no cookie present');
  });

  await test('returns cookie value when cms-session-hint cookie is present', async () => {
    const hintValue = JSON.stringify({ cmsDomains: ['foo.cps.gov.uk'], isProxySession: false, handoverEndpoint: null });
    const response = await fetch(SESSION_HINT_ENDPOINT, {
      headers: { 'Cookie': `cms-session-hint=${encodeURIComponent(hintValue)}` }
    });
    const text = await response.text();
    assertEqual(response.status, 200, 'Should return 200');
    assertEqual(text, hintValue, 'Should return decoded cookie value');
  });

  await test('decodes URL-encoded cookie value', async () => {
    const hintValue = JSON.stringify({ cmsDomains: ['test.cps.gov.uk'], isProxySession: true, handoverEndpoint: 'https://test.cps.gov.uk/polaris' });
    const encodedValue = encodeURIComponent(hintValue);
    const response = await fetch(SESSION_HINT_ENDPOINT, {
      headers: { 'Cookie': `cms-session-hint=${encodedValue}` }
    });
    const text = await response.text();
    assertEqual(response.status, 200, 'Should return 200');
    // The value should be decoded
    const parsed = JSON.parse(text);
    assert(Array.isArray(parsed.cmsDomains), 'Should have cmsDomains array');
    assertEqual(parsed.isProxySession, true, 'Should have isProxySession true');
    assertEqual(parsed.handoverEndpoint, 'https://test.cps.gov.uk/polaris', 'Should have correct handoverEndpoint');
  });

  await test('handles cookie among other cookies', async () => {
    const hintValue = JSON.stringify({ cmsDomains: [], isProxySession: false, handoverEndpoint: null });
    const response = await fetch(SESSION_HINT_ENDPOINT, {
      headers: { 'Cookie': `other=value; cms-session-hint=${encodeURIComponent(hintValue)}; another=cookie` }
    });
    const text = await response.text();
    assertEqual(response.status, 200, 'Should return 200');
    assertEqual(text, hintValue, 'Should extract correct cookie from multiple cookies');
  });

  await test('handles OPTIONS preflight request', async () => {
    const response = await fetch(SESSION_HINT_ENDPOINT, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://example.com',
        'Access-Control-Request-Method': 'GET'
      }
    });
    assertEqual(response.status, 204, 'OPTIONS should return 204');
    const allowMethods = response.headers.get('access-control-allow-methods');
    assert(allowMethods !== null, 'Should have Access-Control-Allow-Methods header');
  });

  await test('returns CORS headers on regular requests', async () => {
    const response = await fetch(SESSION_HINT_ENDPOINT, {
      headers: { 'Origin': 'https://example.com' }
    });
    const corsHeader = response.headers.get('access-control-allow-origin');
    assert(corsHeader !== null, 'Should have Access-Control-Allow-Origin header');
    const credentialsHeader = response.headers.get('access-control-allow-credentials');
    assertEqual(credentialsHeader, 'true', 'Should have Access-Control-Allow-Credentials: true');
  });
}

// =============================================================================
// Upstream Handover Health Check Tests
// =============================================================================

async function testUpstreamHealthCheck() {
  console.log('\nUpstream Handover Health Check Tests:');

  const HEALTH_CHECK_ENDPOINT = `${PROXY_BASE}/api/global-components/upstream-handover-health-check`;

  await test('returns 400 when url parameter is missing', async () => {
    const response = await fetch(HEALTH_CHECK_ENDPOINT);
    const json = await response.json();
    assertEqual(response.status, 400, 'Should return 400');
    assertEqual(json.error, 'url parameter required', 'Should have correct error message');
  });

  await test('returns 403 when url is not in whitelist', async () => {
    const response = await fetch(`${HEALTH_CHECK_ENDPOINT}?url=http://evil.com`);
    const json = await response.json();
    assertEqual(response.status, 403, 'Should return 403');
    assertEqual(json.error, 'url not in whitelist', 'Should have correct error message');
    assertEqual(json.url, 'http://evil.com', 'Should include the rejected url');
  });

  await test('returns health check result for whitelisted url', async () => {
    const whitelistedUrl = 'http://mock-upstream:3000/api/health';
    const response = await fetch(`${HEALTH_CHECK_ENDPOINT}?url=${encodeURIComponent(whitelistedUrl)}`);
    const json = await response.json();
    assertEqual(response.status, 200, 'Should return 200');
    assertEqual(json.url, whitelistedUrl, 'Should include the checked url');
    assert(typeof json.status === 'number', 'Should include numeric status');
    assert(typeof json.healthy === 'boolean', 'Should include boolean healthy flag');
  });

  await test('returns Content-Type application/json', async () => {
    const response = await fetch(HEALTH_CHECK_ENDPOINT);
    const contentType = response.headers.get('content-type');
    assert(contentType !== null && contentType.includes('application/json'),
      'Content-Type should be application/json');
  });
}

// =============================================================================
// Auth Redirect Tests (/init endpoint)
// =============================================================================

async function testAuthRedirect() {
  console.log('\nAuth Redirect Tests (/init endpoint):');

  const INIT_ENDPOINT = `${PROXY_BASE}/init`;

  await test('redirects to whitelisted URL with cookie appended', async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=session%3Dabc123`,
      {
        redirect: 'manual',
        headers: {
          'X-Forwarded-Proto': 'https',
          'Host': 'localhost:8080'
        }
      }
    );
    assertEqual(response.status, 302, 'Should return 302 redirect');
    const location = response.headers.get('location');
    assert(location !== null, 'Should have Location header');
    assert(location.includes('/auth-refresh-inbound'), `Should redirect to auth-refresh-inbound, got: ${location}`);
    assert(location.includes('cc='), `Should include cc param, got: ${location}`);
  });

  await test('returns 403 for non-whitelisted URL', async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=http://evil.com/callback&cookie=session%3Dabc`,
      {
        redirect: 'manual',
        headers: {
          'X-Forwarded-Proto': 'https',
          'Host': 'localhost:8080'
        }
      }
    );
    assertEqual(response.status, 403, 'Should return 403 for non-whitelisted URL');
  });

  await test('sets cms-session-hint cookie with correct attributes', async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=PREFIX-foo.cps.gov.uk_POOL%3Dvalue`,
      {
        redirect: 'manual',
        headers: {
          'X-Forwarded-Proto': 'https',
          'Host': 'localhost:8080'
        }
      }
    );
    const setCookie = response.headers.get('set-cookie');
    assert(setCookie !== null, 'Should have Set-Cookie header');
    assert(setCookie.includes('cms-session-hint='), 'Should set cms-session-hint cookie');
    assert(setCookie.includes('Path=/'), 'Should have Path=/');
    assert(setCookie.includes('Secure'), 'Should have Secure attribute');
    assert(setCookie.includes('SameSite=None'), 'Should have SameSite=None');
    assert(setCookie.includes('Expires='), 'Should have Expires attribute');
  });

  await test('session hint cookie contains valid JSON with cmsDomains array', async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=PREFIX-foo.bar.cps.gov.uk_POOL%3Dx%3BPREFIX-other.cps.gov.uk_POOL%3Dy`,
      {
        redirect: 'manual',
        headers: {
          'X-Forwarded-Proto': 'https',
          'Host': 'localhost:8080'
        }
      }
    );
    const setCookie = response.headers.get('set-cookie');
    const match = setCookie.match(/cms-session-hint=([^;]+)/);
    assert(match !== null, 'Should be able to extract cookie value');
    const hint = JSON.parse(decodeURIComponent(match[1]));
    assert(Array.isArray(hint.cmsDomains), 'cmsDomains should be an array');
    assert(hint.cmsDomains.includes('foo.bar.cps.gov.uk'), `Should include first CMS domain, got: ${JSON.stringify(hint.cmsDomains)}`);
    assert(hint.cmsDomains.includes('other.cps.gov.uk'), `Should include second CMS domain, got: ${JSON.stringify(hint.cmsDomains)}`);
  });

  await test('session hint cookie has isProxySession false by default', async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=PREFIX-foo.cps.gov.uk_POOL%3Dvalue`,
      {
        redirect: 'manual',
        headers: {
          'X-Forwarded-Proto': 'https',
          'Host': 'localhost:8080'
        }
      }
    );
    const setCookie = response.headers.get('set-cookie');
    const match = setCookie.match(/cms-session-hint=([^;]+)/);
    const hint = JSON.parse(decodeURIComponent(match[1]));
    assertEqual(hint.isProxySession, false, 'isProxySession should be false by default');
  });

  await test('session hint cookie has isProxySession true when param set', async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=PREFIX-foo.cps.gov.uk_POOL%3Dvalue&is-proxy-session=true`,
      {
        redirect: 'manual',
        headers: {
          'X-Forwarded-Proto': 'https',
          'Host': 'localhost:8080'
        }
      }
    );
    const setCookie = response.headers.get('set-cookie');
    const match = setCookie.match(/cms-session-hint=([^;]+)/);
    const hint = JSON.parse(decodeURIComponent(match[1]));
    assertEqual(hint.isProxySession, true, 'isProxySession should be true when param set');
  });

  await test('session hint has handoverEndpoint using host when isProxySession true', async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=PREFIX-foo.cps.gov.uk_POOL%3Dvalue&is-proxy-session=true`,
      {
        redirect: 'manual',
        headers: {
          'X-Forwarded-Proto': 'https',
          'Host': 'localhost:8080'
        }
      }
    );
    const setCookie = response.headers.get('set-cookie');
    const match = setCookie.match(/cms-session-hint=([^;]+)/);
    const hint = JSON.parse(decodeURIComponent(match[1]));
    assertEqual(hint.handoverEndpoint, 'https://localhost:8080/polaris', 'handoverEndpoint should use request host when isProxySession');
  });

  await test('session hint has handoverEndpoint using first cmsDomain when not proxy session', async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=PREFIX-foo.cps.gov.uk_POOL%3Dvalue`,
      {
        redirect: 'manual',
        headers: {
          'X-Forwarded-Proto': 'https',
          'Host': 'localhost:8080'
        }
      }
    );
    const setCookie = response.headers.get('set-cookie');
    const match = setCookie.match(/cms-session-hint=([^;]+)/);
    const hint = JSON.parse(decodeURIComponent(match[1]));
    assertEqual(hint.handoverEndpoint, 'https://foo.cps.gov.uk/polaris', 'handoverEndpoint should use first cmsDomain when not proxy session');
  });

  await test('session hint has null handoverEndpoint when no CMS cookies', async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=regular%3Dcookie`,
      {
        redirect: 'manual',
        headers: {
          'X-Forwarded-Proto': 'https',
          'Host': 'localhost:8080'
        }
      }
    );
    const setCookie = response.headers.get('set-cookie');
    const match = setCookie.match(/cms-session-hint=([^;]+)/);
    const hint = JSON.parse(decodeURIComponent(match[1]));
    assertEqual(hint.handoverEndpoint, null, 'handoverEndpoint should be null when no CMS cookies');
  });

  await test('session hint cookie has empty cmsDomains when no CMS cookies', async () => {
    const response = await fetch(
      `${INIT_ENDPOINT}?r=/auth-refresh-inbound&cookie=regular%3Dcookie`,
      {
        redirect: 'manual',
        headers: {
          'X-Forwarded-Proto': 'https',
          'Host': 'localhost:8080'
        }
      }
    );
    const setCookie = response.headers.get('set-cookie');
    const match = setCookie.match(/cms-session-hint=([^;]+)/);
    const hint = JSON.parse(decodeURIComponent(match[1]));
    assertEqual(hint.cmsDomains.length, 0, 'cmsDomains should be empty array when no CMS cookies');
  });
}

// =============================================================================
// Polaris Auth Redirect Tests (/polaris endpoint)
// =============================================================================

async function testPolarisRedirect() {
  console.log('\nPolaris Auth Redirect Tests (/polaris endpoint):');

  const POLARIS_ENDPOINT = `${PROXY_BASE}/polaris`;

  await test('redirects to /init with query params and cookies', async () => {
    const response = await fetch(
      `${POLARIS_ENDPOINT}?q=12345`,
      {
        redirect: 'manual',
        headers: {
          'X-Forwarded-Proto': 'https',
          'Host': 'localhost:8080',
          'Cookie': 'session=abc123',
          'Referer': 'http://cms.example.org/page'
        }
      }
    );
    assertEqual(response.status, 302, 'Should return 302 redirect');
    const location = response.headers.get('location');
    assert(location !== null, 'Should have Location header');
    assert(location.includes('/init?'), `Should redirect to /init, got: ${location}`);
    assert(location.includes('q=12345'), `Should include original q param, got: ${location}`);
    assert(location.includes('cookie='), `Should include cookie param, got: ${location}`);
    assert(location.includes('is-proxy-session=true'), `Should include is-proxy-session=true, got: ${location}`);
  });

  await test('includes referer in redirect URL', async () => {
    const response = await fetch(
      `${POLARIS_ENDPOINT}`,
      {
        redirect: 'manual',
        headers: {
          'X-Forwarded-Proto': 'https',
          'Host': 'localhost:8080',
          'Cookie': 'session=abc',
          'Referer': 'http://cms.example.org/somepage'
        }
      }
    );
    const location = response.headers.get('location');
    assert(location.includes('referer='), `Should include referer param, got: ${location}`);
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
    // testCookieRoute is commented out - handleCookieRoute is disabled
    await testSessionHint();
    await testUpstreamHealthCheck();
    await testAuthRedirect();
    await testPolarisRedirect();
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
