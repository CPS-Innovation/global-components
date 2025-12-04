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

echo "Proxy Integration Test Runner"
echo "=============================="

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
  docker compose -f docker-compose.yml -f docker-compose.global-components.yml -f docker-compose.vnext.yml -f docker-compose.vnever.yml down -t 2 2>/dev/null || true
}

# Run a test layer
run_layer() {
  local layer_name="$1"
  local compose_files="$2"
  local health_endpoint="$3"
  local test_file="$4"

  echo ""
  echo -e "${YELLOW}========================================${NC}"
  echo -e "${YELLOW}Layer: $layer_name${NC}"
  echo -e "${YELLOW}========================================${NC}"

  # Start the stack with appropriate compose files
  echo -e "${YELLOW}Starting docker compose...${NC}"
  cd "$DOCKER_DIR"
  docker compose $compose_files down -t 2 2>/dev/null || true
  docker compose $compose_files up -d --build

  # Wait for proxy
  if ! wait_for_proxy "$health_endpoint"; then
    echo -e "${RED}Error: Proxy did not become ready in time${NC}"
    docker compose $compose_files logs nginx
    docker compose $compose_files down -t 2
    return 1
  fi

  # Run the tests
  echo ""
  cd "$SCRIPT_DIR"
  PROXY_BASE="$PROXY_BASE" node "$test_file"
  local test_result=$?

  # Stop the stack
  echo ""
  echo -e "${YELLOW}Stopping docker compose...${NC}"
  cd "$DOCKER_DIR"
  docker compose $compose_files down -t 2

  return $test_result
}

# Track results
TOTAL_PASSED=0
TOTAL_FAILED=0
LAYER_RESULTS=""

# Layer 1: Main (nginx auth redirects)
if run_layer "main" \
  "-f docker-compose.yml" \
  "/health" \
  "$SCRIPT_DIR/config/main/tests/nginx.integration.test.js"; then
  LAYER_RESULTS="${LAYER_RESULTS}  ${GREEN}✓${NC} main\n"
else
  LAYER_RESULTS="${LAYER_RESULTS}  ${RED}✗${NC} main\n"
  TOTAL_FAILED=$((TOTAL_FAILED + 1))
fi

# Layer 2: Global Components
if run_layer "global-components" \
  "-f docker-compose.yml -f docker-compose.global-components.yml" \
  "/global-components/cms-session-hint" \
  "$SCRIPT_DIR/config/global-components/tests/global-components.integration.test.js"; then
  LAYER_RESULTS="${LAYER_RESULTS}  ${GREEN}✓${NC} global-components\n"
else
  LAYER_RESULTS="${LAYER_RESULTS}  ${RED}✗${NC} global-components\n"
  TOTAL_FAILED=$((TOTAL_FAILED + 1))
fi

# Layer 3: VNext (requires global-components)
if run_layer "vnext" \
  "-f docker-compose.yml -f docker-compose.global-components.yml -f docker-compose.vnext.yml" \
  "/global-components/status" \
  "$SCRIPT_DIR/config/global-components.vnext/tests/global-components.vnext.integration.test.js"; then
  LAYER_RESULTS="${LAYER_RESULTS}  ${GREEN}✓${NC} vnext\n"
else
  LAYER_RESULTS="${LAYER_RESULTS}  ${RED}✗${NC} vnext\n"
  TOTAL_FAILED=$((TOTAL_FAILED + 1))
fi

# Layer 4: VNever (requires vnext) - not deployed, test-only features
if run_layer "vnever" \
  "-f docker-compose.yml -f docker-compose.global-components.yml -f docker-compose.vnext.yml -f docker-compose.vnever.yml" \
  "/global-components/status" \
  "$SCRIPT_DIR/config/global-components.vnever/tests/global-components.vnever.integration.test.js"; then
  LAYER_RESULTS="${LAYER_RESULTS}  ${GREEN}✓${NC} vnever\n"
else
  LAYER_RESULTS="${LAYER_RESULTS}  ${RED}✗${NC} vnever\n"
  TOTAL_FAILED=$((TOTAL_FAILED + 1))
fi

# Summary
echo ""
echo "=============================================="
echo "Layer Results:"
echo -e "$LAYER_RESULTS"
echo "=============================================="

if [ $TOTAL_FAILED -gt 0 ]; then
  echo -e "${RED}$TOTAL_FAILED layer(s) failed${NC}"
  exit 1
else
  echo -e "${GREEN}All layers passed${NC}"
  exit 0
fi
