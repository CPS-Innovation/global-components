#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================"
echo "Global Components Proxy Rollback"
echo "========================================"

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
  exit 1
fi
source secrets.env

# Validate required variables
REQUIRED_VARS="AZURE_SUBSCRIPTION_ID AZURE_RESOURCE_GROUP AZURE_STORAGE_ACCOUNT AZURE_STORAGE_CONTAINER AZURE_WEBAPP_NAME"
for var in $REQUIRED_VARS; do
  if [ -z "${!var}" ]; then
    echo -e "${RED}Error: $var is not set in secrets.env${NC}"
    exit 1
  fi
done

# List available backups
BACKUPS_DIR="./backups"
if [ ! -d "$BACKUPS_DIR" ]; then
  echo -e "${RED}No backups directory found${NC}"
  echo "Run a deployment first to create backups."
  exit 1
fi

echo -e "\n${YELLOW}Available backups:${NC}"
BACKUPS=($(ls -1d "$BACKUPS_DIR"/*/ 2>/dev/null | sort -r))

if [ ${#BACKUPS[@]} -eq 0 ]; then
  echo -e "${RED}No backups found${NC}"
  exit 1
fi

for i in "${!BACKUPS[@]}"; do
  backup_name=$(basename "${BACKUPS[$i]}")
  echo "  [$i] $backup_name"
done

# Select backup
echo -e "\n${YELLOW}Enter backup number to restore (or 'q' to quit):${NC}"
read -r selection < /dev/tty

if [ "$selection" = "q" ]; then
  echo "Cancelled"
  exit 0
fi

if ! [[ "$selection" =~ ^[0-9]+$ ]] || [ "$selection" -ge ${#BACKUPS[@]} ]; then
  echo -e "${RED}Invalid selection${NC}"
  exit 1
fi

SELECTED_BACKUP="${BACKUPS[$selection]}"
BACKUP_NAME=$(basename "$SELECTED_BACKUP")
echo -e "\n${YELLOW}Restoring from: $BACKUP_NAME${NC}"

# Confirm
echo -e "${RED}This will overwrite the current deployment. Continue? (y/N)${NC}"
read -r confirm < /dev/tty
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Cancelled"
  exit 0
fi

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

# Create a backup of current state before rollback
PRE_ROLLBACK_DIR="$BACKUPS_DIR/$(date +%Y%m%d_%H%M%S)_pre-rollback"
mkdir -p "$PRE_ROLLBACK_DIR"
echo -e "\n${YELLOW}Backing up current state before rollback to: $PRE_ROLLBACK_DIR${NC}"

# Note: nginx.js, global-components.conf.template, and global-components.js
# are deployed by the parent project - we only backup/restore vnext-specific files
FILES_TO_BACKUP=(
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
# Backups hold flat file names, never blob paths, so this one function is the only
# place the layout is known. A backup taken before this change (root copy plus a
# features/ subfolder copy, identical) restores correctly too: the root file maps
# to the features/ blob, and the subfolder is not a top-level file so it is skipped.
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

for file in "${FILES_TO_BACKUP[@]}"; do
  blob="$(blob_name "$file")"
  echo "  Downloading $blob..."
  if az storage blob download \
    --account-name "$AZURE_STORAGE_ACCOUNT" \
    --container-name "$AZURE_STORAGE_CONTAINER" \
    --name "$blob" \
    --file "$PRE_ROLLBACK_DIR/$file" \
    --auth-mode login \
    2>&1 | sed 's/^/    /'; then
    echo -e "    ${GREEN}✓ Downloaded${NC}"
  else
    echo -e "    ${YELLOW}⚠ File may not exist${NC}"
  fi
done

# Refuse a backup from before the .js moved into features/ (2026-11-09). Its confs
# js_import templates/global-components.<x>.js (the root), but this script restores
# every .js into features/ — the conf would import a file that is not there, and
# nginx would not start. Restore such a backup by hand, both files at the root.
for file in "$SELECTED_BACKUP"/*.conf.template; do
  if [ -f "$file" ] && grep -qE 'js_import[^;]* templates/global-components\.[^/;]*\.js' "$file"; then
    echo -e "${RED}$(basename "$file") imports its .js from the container root — this backup predates${NC}"
    echo -e "${RED}the features/ layout and cannot be restored by this script. Nothing has been uploaded.${NC}"
    exit 1
  fi
done

# Upload backup files
echo -e "\n${YELLOW}Uploading backup files...${NC}"
# Restore from the top-level (flat-named) files only, each mapped through blob_name.
for file in "$SELECTED_BACKUP"/*; do
  if [ -f "$file" ]; then
    file_name=$(basename "$file")
    # Backups taken before the status endpoint was removed may still hold this;
    # nothing reads it any more, so don't resurrect it.
    if [ "$file_name" = "global-components-deployment.json" ]; then
      echo "  Skipping $file_name (retired)"
      continue
    fi
    # The OS switch module's pre-rename files. Restoring them beside the renamed
    # module would define the config.json locations twice and nginx would not start.
    case "$file_name" in
      global-components.multi-os-domain-testing.*)
        echo "  Skipping $file_name (renamed to global-components.os-london-dublin-oapps-switch)"
        continue ;;
    esac
    blob="$(blob_name "$file_name")"
    echo "  Uploading $file_name -> $blob..."
    az storage blob upload \
      --account-name "$AZURE_STORAGE_ACCOUNT" \
      --container-name "$AZURE_STORAGE_CONTAINER" \
      --name "$blob" \
      --file "$file" \
      --overwrite \
      --auth-mode login
  fi
done

echo -e "${GREEN}Upload complete${NC}"
echo -e "Rolled back to: ${YELLOW}$BACKUP_NAME${NC}"

# Restart web app
echo -e "\n${YELLOW}Restarting web app...${NC}"
az webapp restart \
  --name "$AZURE_WEBAPP_NAME" \
  --resource-group "$AZURE_RESOURCE_GROUP"
echo -e "${GREEN}Restart initiated${NC}"

# No version endpoint to poll any more — verify by hitting a route the vnext
# conf owns, e.g. curl -sI https://<proxy-host>/global-components/swagger.json
echo -e "\n${GREEN}Rollback complete.${NC}"
echo "The web app is restarting; give it a few seconds, then verify a vnext route"
echo "responds. Check the web app logs if not."
exit 0
