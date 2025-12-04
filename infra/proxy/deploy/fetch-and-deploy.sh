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
  mkdir -p "$(dirname "$local_path")"
  if ! curl -fsSL "$url" -o "$local_path"; then
    echo -e "${RED}Error: Failed to fetch ${url}${NC}"
    exit 1
  fi
}

# Create directories
mkdir -p "$SCRIPT_DIR/config/main"
mkdir -p "$SCRIPT_DIR/config/global-components"
mkdir -p "$SCRIPT_DIR/config/global-components.vnext"

# Fetch deploy scripts
echo "Fetching deploy scripts..."
fetch_file "deploy/deploy.sh" "$SCRIPT_DIR/deploy.sh"
fetch_file "deploy/rollback.sh" "$SCRIPT_DIR/rollback.sh"

# Fetch main nginx config
echo "Fetching main config..."
fetch_file "config/main/nginx.conf.template" "$SCRIPT_DIR/config/main/nginx.conf.template"
fetch_file "config/main/nginx.js" "$SCRIPT_DIR/config/main/nginx.js"

# Fetch global-components config (not .env - that stays local with secrets)
echo "Fetching global-components config..."
fetch_file "config/global-components/global-components.conf.template" "$SCRIPT_DIR/config/global-components/global-components.conf.template"
fetch_file "config/global-components/global-components.js" "$SCRIPT_DIR/config/global-components/global-components.js"

# Fetch global-components.vnext config (not .env - that stays local with secrets)
echo "Fetching global-components.vnext config..."
fetch_file "config/global-components.vnext/global-components.vnext.conf.template" "$SCRIPT_DIR/config/global-components.vnext/global-components.vnext.conf.template"
fetch_file "config/global-components.vnext/global-components.vnext.js" "$SCRIPT_DIR/config/global-components.vnext/global-components.vnext.js"

# Verify .env files exist locally (they contain secrets and are not in git)
echo -e "\n${YELLOW}Checking local .env files...${NC}"
if [ ! -f "$SCRIPT_DIR/config/global-components/.env" ]; then
  echo -e "${RED}Error: config/global-components/.env not found${NC}"
  echo "This file contains secrets and must be created manually."
  echo "See .env.example in the repo for the template."
  exit 1
fi
echo "  ✓ config/global-components/.env"

if [ ! -f "$SCRIPT_DIR/config/global-components.vnext/.env" ]; then
  echo -e "${RED}Error: config/global-components.vnext/.env not found${NC}"
  echo "This file contains secrets and must be created manually."
  echo "See .env.example in the repo for the template."
  exit 1
fi
echo "  ✓ config/global-components.vnext/.env"

echo -e "${GREEN}Files fetched successfully${NC}"

# Make scripts executable
chmod +x "$SCRIPT_DIR/deploy.sh"
chmod +x "$SCRIPT_DIR/rollback.sh"

# Run deploy
echo -e "\n${YELLOW}Starting deployment...${NC}"
"$SCRIPT_DIR/deploy.sh"
