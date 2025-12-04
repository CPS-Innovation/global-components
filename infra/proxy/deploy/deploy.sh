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

# Files to upload to blob storage (templates and JS only)
FILES_TO_DEPLOY=(
  "config/main/nginx.conf.template"
  "config/main/nginx.js"
  "config/global-components/global-components.conf.template"
  "config/global-components/global-components.js"
  "config/global-components.vnext/global-components.vnext.conf.template"
  "config/global-components.vnext/global-components.vnext.js"
)

# .env files to read and set as app settings (not uploaded to blob)
ENV_FILES=(
  "config/global-components/.env"
  "config/global-components.vnext/.env"
)

# Deployment version file
DEPLOYMENT_JSON="global-components-deployment.json"

# Check files exist
echo -e "\n${YELLOW}Checking files to deploy...${NC}"
for file in "${FILES_TO_DEPLOY[@]}"; do
  if [ ! -f "$SCRIPT_DIR/$file" ]; then
    echo -e "${RED}Error: $file not found${NC}"
    exit 1
  fi
  echo "  ✓ $file"
done

for file in "${ENV_FILES[@]}"; do
  if [ ! -f "$SCRIPT_DIR/$file" ]; then
    echo -e "${RED}Error: $file not found${NC}"
    exit 1
  fi
  echo "  ✓ $file (app settings)"
done

# Login check
echo -e "\n${YELLOW}Checking Azure CLI login...${NC}"
az account show > /dev/null 2>&1 || {
  echo -e "${RED}Not logged in to Azure CLI. Run 'az login' first.${NC}"
  exit 1
}
az account set --subscription "$AZURE_SUBSCRIPTION_ID"
echo -e "${GREEN}Using subscription: $AZURE_SUBSCRIPTION_ID${NC}"

# Create backup directory
BACKUP_DIR="$SCRIPT_DIR/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
echo -e "\n${YELLOW}Backing up current files to $BACKUP_DIR...${NC}"

# Download current files from blob storage (for backup/rollback)
for file in "${FILES_TO_DEPLOY[@]}"; do
  blob_name=$(basename "$file")
  echo "  Downloading $blob_name..."
  az storage blob download \
    --account-name "$AZURE_STORAGE_ACCOUNT" \
    --container-name "$AZURE_STORAGE_CONTAINER" \
    --name "$blob_name" \
    --file "$BACKUP_DIR/$blob_name" \
    --auth-mode login \
    2>/dev/null || echo "    (file may not exist yet)"
done

# Download current deployment.json to get version
echo "  Downloading $DEPLOYMENT_JSON..."
CURRENT_VERSION=0
if az storage blob download \
    --account-name "$AZURE_STORAGE_ACCOUNT" \
    --container-name "$AZURE_STORAGE_CONTAINER" \
    --name "$DEPLOYMENT_JSON" \
    --file "$BACKUP_DIR/$DEPLOYMENT_JSON" \
    --auth-mode login \
    2>/dev/null; then
  # Read current version from downloaded file
  CURRENT_VERSION=$(grep -o '"version":[0-9]*' "$BACKUP_DIR/$DEPLOYMENT_JSON" | grep -o '[0-9]*' || echo "0")
fi
echo -e "${GREEN}Backup complete${NC}"

# Calculate new version
NEW_VERSION=$((CURRENT_VERSION + 1))
echo -e "\n${YELLOW}Version info:${NC}"
echo "  Current version: $CURRENT_VERSION"
echo "  New version: $NEW_VERSION"

# Create new deployment.json
echo '{"version": '$NEW_VERSION'}' > "$SCRIPT_DIR/$DEPLOYMENT_JSON"

# Read .env files and set as app settings
echo -e "\n${YELLOW}Setting app settings from .env files...${NC}"
APP_SETTINGS=""
for env_file in "${ENV_FILES[@]}"; do
  echo "  Reading $env_file..."
  while IFS='=' read -r key value || [ -n "$key" ]; do
    # Skip empty lines and comments
    [[ -z "$key" || "$key" =~ ^# ]] && continue
    # Remove any surrounding quotes from value
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    # Add to settings string
    APP_SETTINGS="$APP_SETTINGS $key=\"$value\""
    echo "    $key=***"
  done < "$SCRIPT_DIR/$env_file"
done

# Apply app settings
echo -e "\n${YELLOW}Applying app settings to web app...${NC}"
eval az webapp config appsettings set \
  --name "$AZURE_WEBAPP_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --settings $APP_SETTINGS \
  --output none
echo -e "${GREEN}App settings updated${NC}"

# Upload files to blob storage
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

# Upload deployment.json
echo "  Uploading $DEPLOYMENT_JSON..."
az storage blob upload \
  --account-name "$AZURE_STORAGE_ACCOUNT" \
  --container-name "$AZURE_STORAGE_CONTAINER" \
  --name "$DEPLOYMENT_JSON" \
  --file "$SCRIPT_DIR/$DEPLOYMENT_JSON" \
  --overwrite \
  --auth-mode login
echo -e "${GREEN}Upload complete${NC}"

# Clean up local deployment.json
rm -f "$SCRIPT_DIR/$DEPLOYMENT_JSON"

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
  LIVE_VERSION=$(echo "$RESPONSE" | grep -o '"version":[0-9]*' | grep -o '[0-9]*' || echo "0")
  if [ "$LIVE_VERSION" = "$NEW_VERSION" ]; then
    echo -e "\n${GREEN}✓ Deployment successful! Version $NEW_VERSION is now live.${NC}"
    exit 0
  fi
  echo -n "."
  sleep 2
  ((ATTEMPT++))
done

echo -e "\n${RED}Timeout waiting for version $NEW_VERSION. Current version: $LIVE_VERSION${NC}"
echo "The deployment may still be in progress, or there may be an issue."
echo "Check the web app logs or try again."
exit 1
