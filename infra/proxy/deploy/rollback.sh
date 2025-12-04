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

# Load secrets from current directory
if [ ! -f "secrets.env" ]; then
  echo -e "${RED}Error: secrets.env not found in current directory${NC}"
  exit 1
fi
source secrets.env

# Validate required variables
REQUIRED_VARS="AZURE_SUBSCRIPTION_ID AZURE_RESOURCE_GROUP AZURE_STORAGE_ACCOUNT AZURE_STORAGE_CONTAINER AZURE_WEBAPP_NAME STATUS_ENDPOINT"
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

# Login check
echo -e "\n${YELLOW}Checking Azure CLI login...${NC}"
az account show > /dev/null 2>&1 || {
  echo -e "${RED}Not logged in to Azure CLI. Run 'az login' first.${NC}"
  exit 1
}
az account set --subscription "$AZURE_SUBSCRIPTION_ID"
echo -e "${GREEN}Using subscription: $AZURE_SUBSCRIPTION_ID${NC}"

# Get current version for new backup
CURRENT_VERSION=$(curl -s "$STATUS_ENDPOINT" | grep -o '"version":[ ]*[0-9]*' | grep -o '[0-9]*' || echo "0")

# Create a backup of current state before rollback
PRE_ROLLBACK_DIR="$BACKUPS_DIR/$(date +%Y%m%d_%H%M%S)_pre-rollback_v${CURRENT_VERSION}"
mkdir -p "$PRE_ROLLBACK_DIR"
echo -e "\n${YELLOW}Backing up current state before rollback...${NC}"

FILES_TO_BACKUP=(
  "nginx.js"
  "global-components.conf.template"
  "global-components.js"
  "global-components-deployment.json"
)

for file in "${FILES_TO_BACKUP[@]}"; do
  echo "  Downloading $file..."
  az storage blob download \
    --account-name "$AZURE_STORAGE_ACCOUNT" \
    --container-name "$AZURE_STORAGE_CONTAINER" \
    --name "$file" \
    --file "$PRE_ROLLBACK_DIR/$file" \
    --auth-mode login \
    2>/dev/null || echo "    (file may not exist)"
done

# Upload backup files
echo -e "\n${YELLOW}Uploading backup files...${NC}"
for file in "$SELECTED_BACKUP"/*; do
  if [ -f "$file" ]; then
    blob_name=$(basename "$file")
    echo "  Uploading $blob_name..."
    az storage blob upload \
      --account-name "$AZURE_STORAGE_ACCOUNT" \
      --container-name "$AZURE_STORAGE_CONTAINER" \
      --name "$blob_name" \
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

# Get expected version from backup deployment.json
EXPECTED_VERSION=$(grep -o '"version":[ ]*[0-9]*' "$SELECTED_BACKUP/global-components-deployment.json" 2>/dev/null | grep -o '[0-9]*' || echo "unknown")

# Poll for version change
echo -e "\n${YELLOW}Waiting for rollback to complete...${NC}"
echo "Expected version: $EXPECTED_VERSION"
MAX_ATTEMPTS=60
ATTEMPT=1
while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
  LIVE_VERSION=$(curl -s "$STATUS_ENDPOINT" 2>/dev/null | grep -o '"version":[ ]*[0-9]*' | grep -o '[0-9]*' || echo "0")
  if [ "$LIVE_VERSION" != "$CURRENT_VERSION" ]; then
    echo -e "\n${GREEN}Rollback complete! Version is now: $LIVE_VERSION${NC}"
    exit 0
  fi
  echo -n "."
  sleep 2
  ((ATTEMPT++))
done

echo -e "\n${YELLOW}Timeout waiting for version change.${NC}"
echo "The rollback may still be in progress. Check the web app."
exit 1
