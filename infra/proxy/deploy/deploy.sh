#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================"
echo "Global Components Proxy Deployment"
echo "========================================"

# Load secrets from current directory
if [ ! -f "secrets.env" ]; then
  echo -e "${RED}Error: secrets.env not found in current directory${NC}"
  echo ""
  echo "Create secrets.env with the following variables:"
  echo "  AZURE_SUBSCRIPTION_ID"
  echo "  AZURE_RESOURCE_GROUP"
  echo "  AZURE_STORAGE_ACCOUNT"
  echo "  AZURE_STORAGE_CONTAINER"
  echo "  AZURE_WEBAPP_NAME"
  echo "  STATUS_ENDPOINT"
  echo "  WM_MDS_BASE_URL"
  echo "  WM_MDS_ACCESS_KEY"
  exit 1
fi
source secrets.env

# Validate required variables
REQUIRED_VARS="AZURE_SUBSCRIPTION_ID AZURE_RESOURCE_GROUP AZURE_STORAGE_ACCOUNT AZURE_STORAGE_CONTAINER AZURE_WEBAPP_NAME STATUS_ENDPOINT WM_MDS_BASE_URL WM_MDS_ACCESS_KEY"
for var in $REQUIRED_VARS; do
  if [ -z "${!var}" ]; then
    echo -e "${RED}Error: $var is not set in secrets.env${NC}"
    exit 1
  fi
done

# GitHub configuration
GITHUB_REPO="${GITHUB_REPO:-CPS-Innovation/global-components}"
GITHUB_BRANCH="${GITHUB_BRANCH:-main}"
GITHUB_BASE_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/refs/heads/${GITHUB_BRANCH}/infra/proxy"

# Content directory (matches blob container name)
CONTENT_DIR="./$AZURE_STORAGE_CONTAINER"

# Files to deploy
FILES_TO_DEPLOY=(
  "nginx.js"
  "global-components.conf.template"
  "global-components.js"
  "global-components.vnext.conf.template"
  "global-components.vnext.js"
)

# Source paths in repo
declare -A SOURCE_PATHS
SOURCE_PATHS["nginx.js"]="config/main/nginx.js"
SOURCE_PATHS["global-components.conf.template"]="config/global-components/global-components.conf.template"
SOURCE_PATHS["global-components.js"]="config/global-components/global-components.js"
SOURCE_PATHS["global-components.vnext.conf.template"]="config/global-components.vnext/global-components.vnext.conf.template"
SOURCE_PATHS["global-components.vnext.js"]="config/global-components.vnext/global-components.vnext.js"

# App settings to deploy
APP_SETTINGS_VARS="WM_MDS_BASE_URL WM_MDS_ACCESS_KEY"

# Deployment version file
DEPLOYMENT_JSON="global-components-deployment.json"

# Fetch files from GitHub
echo -e "\n${YELLOW}Fetching files from GitHub...${NC}"
echo "  Repo: $GITHUB_REPO"
echo "  Branch: $GITHUB_BRANCH"
echo "  Base URL: $GITHUB_BASE_URL"
mkdir -p "$CONTENT_DIR"

for file in "${FILES_TO_DEPLOY[@]}"; do
  source_path="${SOURCE_PATHS[$file]}"
  url="${GITHUB_BASE_URL}/${source_path}"
  echo "  Fetching $file..."
  if ! curl -fsSL "$url" -o "$CONTENT_DIR/$file"; then
    echo -e "${RED}Error: Failed to fetch ${url}${NC}"
    exit 1
  fi
done
echo -e "${GREEN}Files fetched successfully${NC}"

# Login check
echo -e "\n${YELLOW}Checking Azure CLI login...${NC}"
az account show > /dev/null 2>&1 || {
  echo -e "${RED}Not logged in to Azure CLI. Run 'az login' first.${NC}"
  exit 1
}
az account set --subscription "$AZURE_SUBSCRIPTION_ID"
echo -e "${GREEN}Using subscription: $AZURE_SUBSCRIPTION_ID${NC}"

# Create backup directory
BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
echo -e "\n${YELLOW}Backing up current files to $BACKUP_DIR...${NC}"

# Download current files from blob storage (for backup/rollback)
for file in "${FILES_TO_DEPLOY[@]}"; do
  echo "  Downloading $file..."
  az storage blob download \
    --account-name "$AZURE_STORAGE_ACCOUNT" \
    --container-name "$AZURE_STORAGE_CONTAINER" \
    --name "$file" \
    --file "$BACKUP_DIR/$file" \
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
  CURRENT_VERSION=$(grep -o '"version":[ ]*[0-9]*' "$BACKUP_DIR/$DEPLOYMENT_JSON" | grep -o '[0-9]*' || echo "0")
fi
echo -e "${GREEN}Backup complete${NC}"

# Calculate new version
NEW_VERSION=$((CURRENT_VERSION + 1))
echo -e "\n${YELLOW}Version info:${NC}"
echo "  Current version: $CURRENT_VERSION"
echo "  New version: $NEW_VERSION"

# Create new deployment.json
echo '{"version": '$NEW_VERSION'}' > "$CONTENT_DIR/$DEPLOYMENT_JSON"

# Apply app settings from secrets.env
echo -e "\n${YELLOW}Applying app settings to web app...${NC}"
APP_SETTINGS=""
for var in $APP_SETTINGS_VARS; do
  APP_SETTINGS="$APP_SETTINGS $var=\"${!var}\""
  echo "  $var=***"
done
eval az webapp config appsettings set \
  --name "$AZURE_WEBAPP_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --settings $APP_SETTINGS \
  --output none
echo -e "${GREEN}App settings updated${NC}"

# Upload files to blob storage
echo -e "\n${YELLOW}Uploading files to blob storage...${NC}"
for file in "${FILES_TO_DEPLOY[@]}"; do
  echo "  Uploading $file..."
  az storage blob upload \
    --account-name "$AZURE_STORAGE_ACCOUNT" \
    --container-name "$AZURE_STORAGE_CONTAINER" \
    --name "$file" \
    --file "$CONTENT_DIR/$file" \
    --overwrite \
    --auth-mode login
done

# Upload deployment.json
echo "  Uploading $DEPLOYMENT_JSON..."
az storage blob upload \
  --account-name "$AZURE_STORAGE_ACCOUNT" \
  --container-name "$AZURE_STORAGE_CONTAINER" \
  --name "$DEPLOYMENT_JSON" \
  --file "$CONTENT_DIR/$DEPLOYMENT_JSON" \
  --overwrite \
  --auth-mode login
echo -e "${GREEN}Upload complete${NC}"

# Clean up local deployment.json
rm -f "$CONTENT_DIR/$DEPLOYMENT_JSON"

# Restart web app
echo -e "\n${YELLOW}Restarting web app...${NC}"
az webapp restart \
  --name "$AZURE_WEBAPP_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP"
echo -e "${GREEN}Restart initiated${NC}"

# Poll for new version
echo -e "\n${YELLOW}Waiting for new version to be live...${NC}"
echo "Polling: $STATUS_ENDPOINT"
echo "Expecting version: $NEW_VERSION"
MAX_ATTEMPTS=60
ATTEMPT=1
while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
  HTTP_CODE=$(curl -s -o /tmp/poll_response.txt -w "%{http_code}" "$STATUS_ENDPOINT" 2>/dev/null || echo "000")
  RESPONSE=$(cat /tmp/poll_response.txt 2>/dev/null || echo "{}")
  LIVE_VERSION=$(echo "$RESPONSE" | grep -o '"version":[ ]*[0-9]*' | grep -o '[0-9]*' || echo "0")
  echo ""
  echo "  [$ATTEMPT] HTTP $HTTP_CODE - $RESPONSE"
  if [ "$LIVE_VERSION" = "$NEW_VERSION" ]; then
    echo -e "\n${GREEN}Deployment successful! Version $NEW_VERSION is now live.${NC}"
    rm -f /tmp/poll_response.txt
    exit 0
  fi
  sleep 2
  ((ATTEMPT++))
done
rm -f /tmp/poll_response.txt

echo -e "\n${RED}Timeout waiting for version $NEW_VERSION. Current version: $LIVE_VERSION${NC}"
echo "The deployment may still be in progress, or there may be an issue."
echo "Check the web app logs or try again."
exit 1
