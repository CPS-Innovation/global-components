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

# Load secrets
if [ ! -f "$SCRIPT_DIR/secrets.env" ]; then
  echo -e "${RED}Error: secrets.env not found${NC}"
  echo "Copy secrets.env.example to secrets.env and fill in the values"
  exit 1
fi
source "$SCRIPT_DIR/secrets.env"

# GitHub configuration
GITHUB_REPO="${GITHUB_REPO:-CPS-Innovation/global-components}"
GITHUB_BRANCH="${GITHUB_BRANCH:-main}"
GITHUB_BASE_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/refs/heads/${GITHUB_BRANCH}/infra/proxy"

echo -e "\n${YELLOW}Fetching files from GitHub (${GITHUB_REPO}@${GITHUB_BRANCH})...${NC}"

# Function to fetch a file from GitHub
fetch_file() {
  local remote_path="$1"
  local local_path="$2"
  local url="${GITHUB_BASE_URL}/${remote_path}"

  echo "  Fetching ${remote_path}..."
  if ! curl -fsSL "$url" -o "$local_path"; then
    echo -e "${RED}Error: Failed to fetch ${url}${NC}"
    exit 1
  fi
}

# Create directories
mkdir -p "$SCRIPT_DIR/config"
mkdir -p "$SCRIPT_DIR/config-main"

# Fetch deploy scripts
echo "Fetching deploy scripts..."
fetch_file "deploy/deploy.sh" "$SCRIPT_DIR/deploy.sh"
fetch_file "deploy/rollback.sh" "$SCRIPT_DIR/rollback.sh"

# Fetch config files (except global-components-vars.js which contains secrets)
echo "Fetching config files..."
fetch_file "config/global-components.js" "$SCRIPT_DIR/config/global-components.js"
fetch_file "config/global-components.conf.template" "$SCRIPT_DIR/config/global-components.conf.template"
fetch_file "config-main/nginx.js" "$SCRIPT_DIR/config-main/nginx.js"

# Verify global-components-vars.js exists locally (it contains secrets and is not in git)
if [ ! -f "$SCRIPT_DIR/config/global-components-vars.js" ]; then
  echo -e "${RED}Error: config/global-components-vars.js not found${NC}"
  echo "This file contains secrets and must be created manually."
  echo "See config/global-components-vars.example.js for the template."
  exit 1
fi

echo -e "${GREEN}Files fetched successfully${NC}"

# Make scripts executable
chmod +x "$SCRIPT_DIR/deploy.sh"
chmod +x "$SCRIPT_DIR/rollback.sh"

# Run deploy
echo -e "\n${YELLOW}Starting deployment...${NC}"
"$SCRIPT_DIR/deploy.sh"
