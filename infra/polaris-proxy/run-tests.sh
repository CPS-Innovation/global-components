#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$SCRIPT_DIR/docker"
PROXY_BASE="${PROXY_BASE:-http://localhost:8080}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "Polaris Proxy Integration Test Runner"
echo "======================================"

# Wait for the proxy to be healthy
wait_for_proxy() {
  local health_endpoint="$1"
  local max_attempts=30
  local attempt=1

  echo -n "Waiting for proxy to be ready..."
  while [ $attempt -le $max_attempts ]; do
    if curl -sk "$PROXY_BASE$health_endpoint" >/dev/null 2>&1; then
      echo -e " ${GREEN}ready${NC}"
      return 0
    fi
    echo -n "."
    sleep 1
    ((attempt++))
  done

  echo -e " ${RED}timeout${NC}"
  return 1
}

# Stop any running stack
stop_stack() {
  cd "$DOCKER_DIR"
  docker compose down -t 2 2>/dev/null || true
}

# Track results
TOTAL_PASSED=0
TOTAL_FAILED=0
TEST_RESULTS=""

# Start the stack
echo ""
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Starting polaris-proxy${NC}"
echo -e "${YELLOW}========================================${NC}"

cd "$DOCKER_DIR"
docker compose down -t 2 2>/dev/null || true
docker compose up -d --build

# Wait for proxy
if ! wait_for_proxy "/"; then
  echo -e "${RED}Error: Proxy did not become ready in time${NC}"
  docker compose logs nginx
  docker compose down -t 2
  exit 1
fi

# Run tests if test files exist
echo ""
echo -e "${YELLOW}Running tests...${NC}"

# Find and run all integration test files
TEST_DIR="$SCRIPT_DIR/config/tests"
if [ -d "$TEST_DIR" ]; then
  for test_file in "$TEST_DIR"/*.integration.test.js; do
    if [ -f "$test_file" ]; then
      echo ""
      echo -e "${YELLOW}Running: $(basename "$test_file")${NC}"
      cd "$SCRIPT_DIR"
      if PROXY_BASE="$PROXY_BASE" node "$test_file"; then
        TEST_RESULTS="${TEST_RESULTS}  ${GREEN}✓${NC} $(basename "$test_file")\n"
      else
        TEST_RESULTS="${TEST_RESULTS}  ${RED}✗${NC} $(basename "$test_file")\n"
        TOTAL_FAILED=$((TOTAL_FAILED + 1))
      fi
    fi
  done
else
  echo -e "${YELLOW}No test directory found at $TEST_DIR${NC}"
  echo -e "${YELLOW}Creating placeholder test...${NC}"

  # Run a basic health check as a placeholder test
  echo ""
  echo "Basic health check:"
  if curl -s "$PROXY_BASE/" | grep -q "online"; then
    echo -e "  ${GREEN}✓${NC} Health check passed"
    TEST_RESULTS="${TEST_RESULTS}  ${GREEN}✓${NC} health-check\n"
  else
    echo -e "  ${RED}✗${NC} Health check failed"
    TEST_RESULTS="${TEST_RESULTS}  ${RED}✗${NC} health-check\n"
    TOTAL_FAILED=$((TOTAL_FAILED + 1))
  fi
fi

# Stop the stack
echo ""
echo -e "${YELLOW}Stopping docker compose...${NC}"
cd "$DOCKER_DIR"
docker compose down -t 2

# Summary
echo ""
echo "=============================================="
echo "Test Results:"
echo -e "$TEST_RESULTS"
echo "=============================================="

if [ $TOTAL_FAILED -gt 0 ]; then
  echo -e "${RED}$TOTAL_FAILED test(s) failed${NC}"
  exit 1
else
  echo -e "${GREEN}All tests passed${NC}"
  exit 0
fi
