/**
 * Shared test utilities for polaris-proxy integration tests
 */

const PROXY_BASE = process.env.PROXY_BASE || "http://localhost:8080"

// Test results tracking (shared across all test files)
const state = {
  passed: 0,
  failed: 0,
  results: [],
}

function getState() {
  return state
}

function resetState() {
  state.passed = 0
  state.failed = 0
  state.results = []
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message}\n  Expected: ${JSON.stringify(
        expected
      )}\n  Actual:   ${JSON.stringify(actual)}`
    )
  }
}

function assertIncludes(actual, expected, message) {
  if (!actual.includes(expected)) {
    throw new Error(
      `${message}\n  Expected to include: ${JSON.stringify(
        expected
      )}\n  Actual: ${JSON.stringify(actual)}`
    )
  }
}

async function test(name, fn) {
  try {
    await fn()
    state.passed++
    state.results.push({ name, status: "PASS" })
    console.log(`  ✓ ${name}`)
  } catch (err) {
    state.failed++
    state.results.push({ name, status: "FAIL", error: err.message })
    console.log(`  ✗ ${name}`)
    console.log(`    ${err.message}`)
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)
  return response.json()
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, options)
  return response.text()
}

async function fetchResponse(url, options = {}) {
  // By default, don't follow redirects so we can test redirect responses
  return fetch(url, { redirect: 'manual', ...options })
}

module.exports = {
  PROXY_BASE,
  getState,
  resetState,
  assert,
  assertEqual,
  assertIncludes,
  test,
  fetchJson,
  fetchText,
  fetchResponse,
}
