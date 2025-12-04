/**
 * Shared test utilities for integration tests
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
  const response = await fetch(url, {
    ...options,
    // Accept self-signed certs in dev
    ...(process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ? {} : {}),
  })
  return response.json()
}

module.exports = {
  PROXY_BASE,
  getState,
  resetState,
  assert,
  assertEqual,
  test,
  fetchJson,
}
