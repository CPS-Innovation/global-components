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
  echo "  GLOBAL_COMPONENTS_APPLICATION_ID"
  echo "  GLOBAL_COMPONENTS_BLOB_STORAGE_URL"
  echo "  CPS_GLOBAL_COMPONENTS_BLOB_STORAGE_DOMAIN"
  exit 1
fi
set -a  # Export all variables defined from here
source secrets.env
set +a  # Stop auto-exporting

# Validate required variables
REQUIRED_VARS="AZURE_SUBSCRIPTION_ID AZURE_RESOURCE_GROUP AZURE_STORAGE_ACCOUNT AZURE_STORAGE_CONTAINER AZURE_WEBAPP_NAME GLOBAL_COMPONENTS_APPLICATION_ID GLOBAL_COMPONENTS_BLOB_STORAGE_URL CPS_GLOBAL_COMPONENTS_BLOB_STORAGE_DOMAIN"
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
  "global-components.vnext.js"
  "global-components.vnext.conf.template"
  # Transitional OS London/Dublin/oapps switch module (FCT2-22132) — delete with the module.
  "global-components.os-london-dublin-oapps-switch.js"
  "global-components.os-london-dublin-oapps-switch.conf.template"
)

# The blob each file lives in. We deploy to the new-generation proxy config only
# (Polaris repo, proxy/config/, booted by start-next.sh): it loads only
# `features/*/*.conf`. A module's conf AND its .js both live in
# features/global-components.<x>/ — the conf does
# `js_import templates/features/global-components.<x>/global-components.<x>.js`.
# Each .js is listed before its conf above, so it is uploaded first: a restart
# between the two never meets a conf whose .js is missing.
#
# The old monolith's root copies of our confs are no longer written; deploy.local.sh
# removes them. Backups are kept under the flat file name (not the blob path) so
# rollback.sh can map each one back through this same function.
blob_name() {
  local file="$1"
  case "$file" in
    global-components.*.conf.template)
      local stem="${file%.conf.template}"
      echo "features/$stem/$file" ;;
    # A module .js (global-components.<x>.js) goes beside its conf. Polaris's own
    # base global-components.js has no <x>, never matches, and is never ours anyway.
    global-components.?*.js)
      local stem="${file%.js}"
      echo "features/$stem/$file" ;;
    *)
      echo "$file" ;;
  esac
}

# App settings to deploy (vnext-specific only)
# Note: WM_MDS_BASE_URL and WM_MDS_ACCESS_KEY are deployed by the parent project
APP_SETTINGS_VARS="GLOBAL_COMPONENTS_APPLICATION_ID GLOBAL_COMPONENTS_BLOB_STORAGE_URL CPS_GLOBAL_COMPONENTS_BLOB_STORAGE_DOMAIN"

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
  blob="$(blob_name "$file")"
  echo "  Downloading $blob..."
  if az storage blob download \
    --account-name "$AZURE_STORAGE_ACCOUNT" \
    --container-name "$AZURE_STORAGE_CONTAINER" \
    --name "$blob" \
    --file "$BACKUP_DIR/$file" \
    --auth-mode login \
    2>&1 | sed 's/^/    /'; then
    echo -e "    ${GREEN}✓ Downloaded${NC}"
  else
    echo -e "    ${YELLOW}⚠ File may not exist yet${NC}"
  fi
done
echo -e "${GREEN}Backup complete${NC}"

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

# Blobs of a module deployed under a name it no longer has. Both copies would be
# loaded by `include features/*/*.conf` and define the same locations, so nginx
# would not start: they are deleted BEFORE the uploads (delete-if-present). A
# restart in between meets neither copy (that feature degraded), never both (down).
RETIRED_BLOBS=(
  "features/global-components.multi-os-domain-testing/global-components.multi-os-domain-testing.conf.template"
  "features/global-components.multi-os-domain-testing/global-components.multi-os-domain-testing.js"
)
echo -e "\n${YELLOW}Removing retired blobs...${NC}"
for blob in "${RETIRED_BLOBS[@]}"; do
  if [ "$(az storage blob exists --account-name "$AZURE_STORAGE_ACCOUNT" --container-name "$AZURE_STORAGE_CONTAINER" --name "$blob" --auth-mode login --query exists --output tsv)" = "true" ]; then
    echo "  Deleting $blob..."
    az storage blob delete \
      --account-name "$AZURE_STORAGE_ACCOUNT" \
      --container-name "$AZURE_STORAGE_CONTAINER" \
      --name "$blob" \
      --auth-mode login
  fi
done

# Upload files to blob storage
echo -e "\n${YELLOW}Uploading files to blob storage...${NC}"
for file in "${FILES_TO_DEPLOY[@]}"; do
  blob="$(blob_name "$file")"
  echo "  Uploading $file -> $blob..."
  az storage blob upload \
    --account-name "$AZURE_STORAGE_ACCOUNT" \
    --container-name "$AZURE_STORAGE_CONTAINER" \
    --name "$blob" \
    --file "$CONTENT_DIR/$file" \
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

# The app takes a few seconds to come back up. There is no version endpoint to
# poll any more, so verify by hitting a route the vnext conf owns, e.g.
#   curl -sI https://<proxy-host>/global-components/swagger.json
echo -e "\n${GREEN}Deployment complete.${NC}"
echo "The web app is restarting; give it a few seconds, then verify a vnext route"
echo "responds (e.g. /global-components/swagger.json). Check the web app logs if not."
exit 0
