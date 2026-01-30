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

# Check if gh CLI is available and logged in
echo -e "\n${YELLOW}Checking GitHub CLI...${NC}"
if ! command -v gh &> /dev/null; then
  echo -e "${RED}Error: GitHub CLI (gh) is not installed${NC}"
  echo "Install it from: https://cli.github.com/"
  exit 1
fi
if ! gh auth status &> /dev/null; then
  echo -e "${RED}Error: Not logged in to GitHub CLI${NC}"
  echo "Run: gh auth login"
  exit 1
fi
echo -e "${GREEN}GitHub CLI: OK${NC}"

# Check if az CLI is available and logged in
echo -e "\n${YELLOW}Checking Azure CLI...${NC}"
if ! command -v az &> /dev/null; then
  echo -e "${RED}Error: Azure CLI (az) is not installed${NC}"
  echo "Install it from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
  exit 1
fi
if ! az account show > /dev/null 2>&1; then
  echo -e "${RED}Error: Not logged in to Azure CLI${NC}"
  echo "Run: az login"
  exit 1
fi
echo -e "${GREEN}Azure CLI: OK${NC}"

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
  echo "  GLOBAL_COMPONENTS_APPLICATION_ID"
  echo "  GLOBAL_COMPONENTS_BLOB_STORAGE_URL"
  echo "  CPS_GLOBAL_COMPONENTS_BLOB_STORAGE_DOMAIN"
  exit 1
fi
set -a  # Export all variables defined from here
source secrets.env
set +a  # Stop auto-exporting

# Validate required variables
REQUIRED_VARS="AZURE_SUBSCRIPTION_ID AZURE_RESOURCE_GROUP AZURE_STORAGE_ACCOUNT AZURE_STORAGE_CONTAINER AZURE_WEBAPP_NAME STATUS_ENDPOINT GLOBAL_COMPONENTS_APPLICATION_ID GLOBAL_COMPONENTS_BLOB_STORAGE_URL CPS_GLOBAL_COMPONENTS_BLOB_STORAGE_DOMAIN"
for var in $REQUIRED_VARS; do
  if [ -z "${!var}" ]; then
    echo -e "${RED}Error: $var is not set in secrets.env${NC}"
    exit 1
  fi
done

# GitHub configuration
GITHUB_REPO="${GITHUB_REPO:-CPS-Innovation/global-components}"
ARTIFACT_NAME="${ARTIFACT_NAME:-proxy-artifact}"

# Content directory (use HOME for Windows compatibility)
CONTENT_DIR="${HOME}/.gc-deploy-content"

# Files to deploy (these come from the build artifact's proxy/ folder)
# Note: nginx.js, global-components.conf, and global-components.js
# are deployed by the parent project - we only deploy vnext-specific files
# Source files are .conf but build.sh adds .template suffix for nginx envsubst
FILES_TO_DEPLOY=(
  "global-components.vnext.conf.template"
  "global-components.vnext.js"
)

# App settings to deploy (vnext-specific only)
# Note: WM_MDS_BASE_URL and WM_MDS_ACCESS_KEY are deployed by the parent project
APP_SETTINGS_VARS="GLOBAL_COMPONENTS_APPLICATION_ID GLOBAL_COMPONENTS_BLOB_STORAGE_URL CPS_GLOBAL_COMPONENTS_BLOB_STORAGE_DOMAIN"

# Deployment version file
DEPLOYMENT_JSON="global-components-deployment.json"

# Download artifact from GitHub Actions
echo -e "\n${YELLOW}Downloading build artifact from GitHub Actions...${NC}"
echo "  Repo: $GITHUB_REPO"
echo "  Artifact: $ARTIFACT_NAME"

# Create temp directory for artifact download
# Use HOME for Windows compatibility (current dir may have issues when piped from curl)
ARTIFACT_DIR="${HOME}/.gc-deploy-temp-$$"
if ! mkdir -p "$ARTIFACT_DIR"; then
  echo -e "${RED}Error: Failed to create temp directory: $ARTIFACT_DIR${NC}"
  echo "Current directory: $(pwd)"
  exit 1
fi
trap "rm -rf '$ARTIFACT_DIR'" EXIT

# Download the latest artifact from a successful workflow run on main
echo "  Finding latest successful build..."
RUN_ID=$(gh run list --repo "$GITHUB_REPO" --branch main --status success --workflow "PR" --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || echo "")

if [ -z "$RUN_ID" ]; then
  # Try deploy workflow if PR workflow not found
  RUN_ID=$(gh run list --repo "$GITHUB_REPO" --branch main --status success --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || echo "")
fi

if [ -z "$RUN_ID" ]; then
  echo -e "${RED}Error: Could not find a successful workflow run${NC}"
  exit 1
fi

echo "  Found run: $RUN_ID"
echo "  Downloading artifact..."

if ! gh run download "$RUN_ID" --repo "$GITHUB_REPO" --name "$ARTIFACT_NAME" --dir "$ARTIFACT_DIR"; then
  echo -e "${RED}Error: Failed to download artifact${NC}"
  exit 1
fi

# Debug: show what was downloaded
echo "  Downloaded files:"
ls -la "$ARTIFACT_DIR" 2>&1 | sed 's/^/    /'

# Copy proxy files to content directory
# For .template files, substitute only the vnext-specific variables we know from secrets.env
# Other variables (WEBSITE_DNS_SERVER, WM_MDS_*, etc.) remain as placeholders for nginx's runtime envsubst
mkdir -p "$CONTENT_DIR"
echo "  Processing proxy files..."

# Variables to substitute from secrets.env (leave others for nginx runtime)
ENVSUBST_VARS='$GLOBAL_COMPONENTS_APPLICATION_ID $GLOBAL_COMPONENTS_BLOB_STORAGE_URL $CPS_GLOBAL_COMPONENTS_BLOB_STORAGE_DOMAIN'

for file in "${FILES_TO_DEPLOY[@]}"; do
  if [ -f "$ARTIFACT_DIR/$file" ]; then
    if [[ "$file" == *.template ]]; then
      # Substitute only our known variables, keep .template suffix
      envsubst "$ENVSUBST_VARS" < "$ARTIFACT_DIR/$file" > "$CONTENT_DIR/$file"
      echo "    $file (envsubst: GLOBAL_COMPONENTS_*)"
    else
      # Copy non-template files as-is
      cp "$ARTIFACT_DIR/$file" "$CONTENT_DIR/$file"
      echo "    $file"
    fi
  else
    echo -e "${RED}Error: $file not found in artifact${NC}"
    exit 1
  fi
done
echo -e "${GREEN}Artifact downloaded and processed successfully${NC}"

# Set subscription
az account set --subscription "$AZURE_SUBSCRIPTION_ID"
echo -e "\n${GREEN}Using subscription: $AZURE_SUBSCRIPTION_ID${NC}"

# List current container contents
echo -e "\n${YELLOW}Current blob storage contents:${NC}"
echo "  Storage account: $AZURE_STORAGE_ACCOUNT"
echo "  Container: $AZURE_STORAGE_CONTAINER"
echo "  Running: az storage blob list --account-name $AZURE_STORAGE_ACCOUNT --container-name $AZURE_STORAGE_CONTAINER --auth-mode login --output table"
echo ""
az storage blob list \
  --account-name "$AZURE_STORAGE_ACCOUNT" \
  --container-name "$AZURE_STORAGE_CONTAINER" \
  --auth-mode login \
  --output table \
  2>&1 | sed 's/^/  /'

# Create backup directory
BACKUP_DIR="${HOME}/.gc-deploy-backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
echo -e "\n${YELLOW}Backing up current files to $BACKUP_DIR...${NC}"

# Download current files from blob storage (for backup/rollback)
for file in "${FILES_TO_DEPLOY[@]}"; do
  echo "  Downloading $file..."
  if az storage blob download \
    --account-name "$AZURE_STORAGE_ACCOUNT" \
    --container-name "$AZURE_STORAGE_CONTAINER" \
    --name "$file" \
    --file "$BACKUP_DIR/$file" \
    --auth-mode login \
    2>&1 | sed 's/^/    /'; then
    echo -e "    ${GREEN}✓ Downloaded${NC}"
  else
    echo -e "    ${YELLOW}⚠ File may not exist yet${NC}"
  fi
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
    2>&1 | sed 's/^/    /'; then
  echo -e "    ${GREEN}✓ Downloaded${NC}"
  CURRENT_VERSION=$(grep -o '"version":[ ]*[0-9]*' "$BACKUP_DIR/$DEPLOYMENT_JSON" | grep -o '[0-9]*' || echo "0")
else
  echo -e "    ${YELLOW}⚠ File may not exist yet${NC}"
fi
echo -e "${GREEN}Backup complete${NC}"

# Calculate new version
NEW_VERSION=$((CURRENT_VERSION + 1))
echo -e "\n${YELLOW}Version info:${NC}"
echo "  Current version: $CURRENT_VERSION"
echo "  New version: $NEW_VERSION"

# Create new deployment.json
echo '{"version": '$NEW_VERSION'}' > "$CONTENT_DIR/$DEPLOYMENT_JSON"

# App settings are now baked into the config via envsubst during deployment
# Uncomment below if you also need to set them as runtime app settings
# echo -e "\n${YELLOW}Applying app settings to web app...${NC}"
# APP_SETTINGS=""
# for var in $APP_SETTINGS_VARS; do
#   APP_SETTINGS="$APP_SETTINGS $var=\"${!var}\""
#   echo "  $var=***"
# done
# eval az webapp config appsettings set \
#   --name "$AZURE_WEBAPP_NAME" \
#   --resource-group "$AZURE_RESOURCE_GROUP" \
#   --settings $APP_SETTINGS \
#   --output none
# echo -e "${GREEN}App settings updated${NC}"

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
