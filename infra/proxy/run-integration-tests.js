#!/usr/bin/env node
/**
 * Legacy integration test runner (deprecated)
 *
 * This file is kept for backwards compatibility but the preferred way to run
 * integration tests is via ./run-tests.sh which runs tests in proper layers:
 *
 *   1. main - nginx auth redirects only
 *   2. global-components - main + proxy functionality
 *   3. vnext - main + global-components + vnext features
 *
 * Each layer starts Docker with only the configs needed for that layer.
 *
 * If you need to run all tests at once (with all configs loaded), use this file
 * with a fully configured Docker compose stack running.
 */

const { getState, resetState } = require("./test-utils")

// Import test modules
const testGlobalComponents = require("./config/global-components/tests/global-components.integration.test.js")
const testVnext = require("./config/global-components.vnext/tests/global-components.vnext.integration.test.js")
const testNginx = require("./config/main/tests/nginx.integration.test.js")

async function main() {
  const PROXY_BASE = process.env.PROXY_BASE || "http://localhost:8080"

  resetState()

  console.log("=".repeat(60))
  console.log("Proxy Integration Tests (All Layers)")
  console.log(`Target: ${PROXY_BASE}`)
  console.log("=".repeat(60))
  console.log(
    "\nNote: This runs all tests together. For proper layered testing,"
  )
  console.log("use ./run-tests.sh instead.\n")

  try {
    await testNginx()
    await testGlobalComponents()
    await testVnext()
  } catch (err) {
    console.error("\nTest suite error:", err.message)
  }

  const state = getState()
  console.log("\n" + "=".repeat(60))
  console.log(`Results: ${state.passed} passed, ${state.failed} failed`)
  console.log("=".repeat(60))

  process.exit(state.failed > 0 ? 1 : 0)
}

main()
