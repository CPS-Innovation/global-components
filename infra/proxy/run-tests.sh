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

# Check if docker compose stack is running
check_stack_running() {
  cd "$DOCKER_DIR"
  # Check if containers are running
  if docker compose ps --status running 2>/dev/null | grep -q "nginx"; then
    return 0
  fi
  return 1
}

# Wait for the proxy to be healthy
wait_for_proxy() {
  local max_attempts=30
  local attempt=1

  echo -n "Waiting for proxy to be ready..."
  while [ $attempt -le $max_attempts ]; do
    if curl -sk "$PROXY_BASE/global-components" >/dev/null 2>&1; then
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

# Start the stack (always rebuild to ensure latest code)
start_stack() {
  echo -e "${YELLOW}Rebuilding and starting docker compose stack...${NC}"
  cd "$DOCKER_DIR"
  docker compose down -t 2 2>/dev/null || true
  docker compose up -d --build
}

# Stop the stack
stop_stack() {
  echo -e "${YELLOW}Stopping docker compose stack...${NC}"
  cd "$DOCKER_DIR"
  docker compose down -t 2
}

# Main logic
STARTED_STACK=false

# Check for --no-start flag
if [[ "$*" == *"--no-start"* ]]; then
  if check_stack_running; then
    echo -e "${GREEN}Docker compose stack is already running${NC}"
  else
    echo -e "${RED}Error: Stack not running and --no-start flag specified${NC}"
    exit 1
  fi
else
  # Always rebuild to ensure we're testing latest code
  start_stack
  STARTED_STACK=true
fi

# Wait for proxy to be healthy
if ! wait_for_proxy; then
  echo -e "${RED}Error: Proxy did not become ready in time${NC}"
  if [ "$STARTED_STACK" = true ]; then
    stop_stack
  fi
  exit 1
fi

# Run the tests
echo ""
PROXY_BASE="$PROXY_BASE" node "$SCRIPT_DIR/tests/proxy.integration.test.js"
TEST_EXIT_CODE=$?

# Stop stack if we started it (unless --keep flag)
if [ "$STARTED_STACK" = true ] && [[ "$*" != *"--keep"* ]]; then
  echo ""
  stop_stack
fi

exit $TEST_EXIT_CODE
