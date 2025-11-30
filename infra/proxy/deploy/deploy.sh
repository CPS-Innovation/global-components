#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================"
echo "Global Components Proxy Deployment"
echo "========================================"

# Load secrets
if [ ! -f "$SCRIPT_DIR/secrets.env" ]; then
  echo -e "${RED}Error: secrets.env not found${NC}"
  echo "Copy secrets.env.example to secrets.env and fill in the values"
  exit 1
fi
source "$SCRIPT_DIR/secrets.env"

# Validate required variables
REQUIRED_VARS="AZURE_SUBSCRIPTION_ID AZURE_RESOURCE_GROUP AZURE_STORAGE_ACCOUNT AZURE_STORAGE_CONTAINER AZURE_WEBAPP_NAME STATUS_ENDPOINT"
for var in $REQUIRED_VARS; do
  if [ -z "${!var}" ]; then
    echo -e "${RED}Error: $var is not set in secrets.env${NC}"
    exit 1
  fi
done

# Files to deploy (relative to script dir after fetch)
FILES_TO_DEPLOY=(
  "config/global-components.js"
  "config/global-components.conf.template"
  "config/global-components-vars.js"
  "config-main/nginx.js"
)

# Check files exist
echo -e "\n${YELLOW}Checking files to deploy...${NC}"
for file in "${FILES_TO_DEPLOY[@]}"; do
  if [ ! -f "$SCRIPT_DIR/$file" ]; then
    echo -e "${RED}Error: $file not found${NC}"
    exit 1
  fi
  echo "  ✓ $file"
done

# Login check
echo -e "\n${YELLOW}Checking Azure CLI login...${NC}"
az account show > /dev/null 2>&1 || {
  echo -e "${RED}Not logged in to Azure CLI. Run 'az login' first.${NC}"
  exit 1
}
az account set --subscription "$AZURE_SUBSCRIPTION_ID"
echo -e "${GREEN}Using subscription: $AZURE_SUBSCRIPTION_ID${NC}"

# Get current version from endpoint
echo -e "\n${YELLOW}Getting current version...${NC}"
CURRENT_VERSION=$(curl -s "$STATUS_ENDPOINT" | grep -o '"version":[0-9]*' | grep -o '[0-9]*' || echo "0")
NEW_VERSION=$((CURRENT_VERSION + 1))
echo "Current version: $CURRENT_VERSION"
echo "New version: $NEW_VERSION"

# Create backup directory
BACKUP_DIR="$SCRIPT_DIR/backups/$(date +%Y%m%d_%H%M%S)_v${CURRENT_VERSION}"
mkdir -p "$BACKUP_DIR"
echo -e "\n${YELLOW}Backing up current files to $BACKUP_DIR...${NC}"

# Download current files from blob storage
for file in "${FILES_TO_DEPLOY[@]}"; do
  blob_name=$(basename "$file")
  echo "  Downloading $blob_name..."
  az storage blob download \
    --account-name "$AZURE_STORAGE_ACCOUNT" \
    --container-name "$AZURE_STORAGE_CONTAINER" \
    --name "$blob_name" \
    --file "$BACKUP_DIR/$blob_name" \
    --auth-mode login \
    2>/dev/null || echo "  (file may not exist yet)"
done
echo -e "${GREEN}Backup complete${NC}"

# Update version in global-components-vars.js (fetched from dev machine)
VARS_FILE="$SCRIPT_DIR/config/global-components-vars.js"
echo -e "\n${YELLOW}Updating deploy version...${NC}"
if grep -q "deployVersion:" "$VARS_FILE"; then
  sed -i "s/deployVersion:[[:space:]]*[0-9]*/deployVersion: $NEW_VERSION/" "$VARS_FILE"
else
  # Add deployVersion if it doesn't exist (before the closing brace)
  sed -i "s/};/  deployVersion: $NEW_VERSION,\n};/" "$VARS_FILE"
fi
echo "Updated deployVersion to $NEW_VERSION"

# Upload files
echo -e "\n${YELLOW}Uploading files to blob storage...${NC}"
for file in "${FILES_TO_DEPLOY[@]}"; do
  blob_name=$(basename "$file")
  echo "  Uploading $blob_name..."
  az storage blob upload \
    --account-name "$AZURE_STORAGE_ACCOUNT" \
    --container-name "$AZURE_STORAGE_CONTAINER" \
    --name "$blob_name" \
    --file "$SCRIPT_DIR/$file" \
    --overwrite \
    --auth-mode login
done
echo -e "${GREEN}Upload complete${NC}"

# Restart web app
echo -e "\n${YELLOW}Restarting web app...${NC}"
az webapp restart \
  --name "$AZURE_WEBAPP_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP"
echo -e "${GREEN}Restart initiated${NC}"

# Poll for new version
echo -e "\n${YELLOW}Waiting for new version to be live...${NC}"
echo "Expecting version: $NEW_VERSION"
MAX_ATTEMPTS=60
ATTEMPT=1
while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
  RESPONSE=$(curl -s "$STATUS_ENDPOINT" 2>/dev/null || echo "{}")
  echo -e "\n  Response: $RESPONSE"
  LIVE_VERSION=$(echo "$RESPONSE" | grep -o '"version":[0-9]*' | grep -o '[0-9]*' || echo "0")
  if [ "$LIVE_VERSION" = "$NEW_VERSION" ]; then
    echo -e "\n${GREEN}✓ Deployment successful! Version $NEW_VERSION is now live.${NC}"
    exit 0
  fi
  echo -n "  Waiting..."
  sleep 2
  ((ATTEMPT++))
done

echo -e "\n${RED}Timeout waiting for version $NEW_VERSION. Current version: $LIVE_VERSION${NC}"
echo "The deployment may still be in progress, or there may be an issue."
echo "Check the web app logs or try again."
exit 1
