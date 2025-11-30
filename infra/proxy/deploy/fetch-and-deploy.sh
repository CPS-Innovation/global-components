#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================"
echo "Fetch and Deploy"
echo "========================================"

# Load secrets for SSH config
if [ ! -f "$SCRIPT_DIR/secrets.env" ]; then
  echo -e "${RED}Error: secrets.env not found${NC}"
  echo "Copy secrets.env.example to secrets.env and fill in the values"
  exit 1
fi
source "$SCRIPT_DIR/secrets.env"

# Validate SSH variables
if [ -z "$SSH_HOST" ] || [ -z "$SSH_SOURCE_PATH" ]; then
  echo -e "${RED}Error: SSH_HOST and SSH_SOURCE_PATH must be set in secrets.env${NC}"
  exit 1
fi

SSH_OPTS=""
if [ -n "$SSH_KEY_PATH" ]; then
  SSH_OPTS="-i $SSH_KEY_PATH"
fi

echo -e "\n${YELLOW}Fetching files from $SSH_HOST...${NC}"

# Fetch deploy scripts
echo "  Fetching deploy scripts..."
scp $SSH_OPTS "$SSH_HOST:$SSH_SOURCE_PATH/deploy/deploy.sh" "$SCRIPT_DIR/"
scp $SSH_OPTS "$SSH_HOST:$SSH_SOURCE_PATH/deploy/rollback.sh" "$SCRIPT_DIR/"

# Fetch secrets.env (in case it was updated)
scp $SSH_OPTS "$SSH_HOST:$SSH_SOURCE_PATH/deploy/secrets.env" "$SCRIPT_DIR/" 2>/dev/null || true

# Fetch config files
echo "  Fetching config files..."
mkdir -p "$SCRIPT_DIR/config"
mkdir -p "$SCRIPT_DIR/config-main"

scp $SSH_OPTS "$SSH_HOST:$SSH_SOURCE_PATH/config/global-components.js" "$SCRIPT_DIR/config/"
scp $SSH_OPTS "$SSH_HOST:$SSH_SOURCE_PATH/config/global-components.conf.template" "$SCRIPT_DIR/config/"
scp $SSH_OPTS "$SSH_HOST:$SSH_SOURCE_PATH/config/global-components-vars.js" "$SCRIPT_DIR/config/"
scp $SSH_OPTS "$SSH_HOST:$SSH_SOURCE_PATH/config-main/nginx.js" "$SCRIPT_DIR/config-main/"

echo -e "${GREEN}Files fetched successfully${NC}"

# Make scripts executable
chmod +x "$SCRIPT_DIR/deploy.sh"
chmod +x "$SCRIPT_DIR/rollback.sh"

# Run deploy
echo -e "\n${YELLOW}Starting deployment...${NC}"
"$SCRIPT_DIR/deploy.sh"
