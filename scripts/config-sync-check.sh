#!/bin/bash

# Script to check if local configuration files are in sync with Azure Blob Storage
# Usage: ./scripts/config-sync-check.sh [environment]
# Example: ./scripts/config-sync-check.sh dev

set -e

# Parse command line arguments
FILTER_ENV=""
if [ $# -gt 0 ]; then
    FILTER_ENV="$1"
fi

# Load environment variables from .env if it exists
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
CONFIG_DIR="./configuration"
STORAGE_ACCOUNT="${AZURE_STORAGE_ACCOUNT}"
SAS_TOKEN="${AZURE_STORAGE_SAS_TOKEN}"
CONTAINER_PREFIX=""

echo "=== Configuration Sync Check ==="
echo ""

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo -e "${RED}Error: Azure CLI (az) is not installed${NC}"
    echo "Install it from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Check if storage account is set
if [ -z "$STORAGE_ACCOUNT" ]; then
    echo -e "${RED}Error: AZURE_STORAGE_ACCOUNT environment variable is not set${NC}"
    echo "Set it in .env file or export AZURE_STORAGE_ACCOUNT=yourstorageaccount"
    exit 1
fi

# Determine authentication method
AUTH_METHOD=""
if [ -n "$SAS_TOKEN" ]; then
    echo "Using SAS token authentication"
    AUTH_METHOD="sas"
    # Remove leading '?' if present
    SAS_TOKEN="${SAS_TOKEN#\?}"
else
    echo "Using Azure CLI authentication (az login)"
    AUTH_METHOD="login"
    # Check authentication
    if ! az account show &> /dev/null; then
        echo -e "${RED}Error: Not authenticated with Azure. Run 'az login' first or set AZURE_STORAGE_SAS_TOKEN${NC}"
        exit 1
    fi
fi
echo -e "${GREEN}✓ Authenticated${NC}"
echo ""

# Find all config files
config_files=($(ls "$CONFIG_DIR"/config.*.json 2>/dev/null || true))

if [ ${#config_files[@]} -eq 0 ]; then
    echo -e "${RED}No config files found in $CONFIG_DIR${NC}"
    exit 1
fi

echo "Found ${#config_files[@]} configuration files"
if [ -n "$FILTER_ENV" ]; then
    echo "Filtering for environment: $FILTER_ENV"
fi
echo ""

total_files=0
in_sync=0
out_of_sync=0
missing_remote=0

# Process each config file
for local_file in "${config_files[@]}"; do
    filename=$(basename "$local_file")

    # Extract environment name from filename
    # config.{env}.json or config.{env}.override.json
    if [[ $filename =~ ^config\.([^.]+)\.override\.json$ ]]; then
        env_name="${BASH_REMATCH[1]}"
        remote_filename="config.override.json"
    elif [[ $filename =~ ^config\.([^.]+)\.json$ ]]; then
        env_name="${BASH_REMATCH[1]}"
        remote_filename="config.json"
    else
        echo -e "${YELLOW}⚠ Skipping $filename (doesn't match expected pattern)${NC}"
        continue
    fi

    # Skip prod environment
    if [ "$env_name" == "prod" ]; then
        # Only show message if we're checking all environments
        if [ -z "$FILTER_ENV" ]; then
            echo -e "${YELLOW}⚠ Skipping $filename (prod environment excluded)${NC}"
        fi
        continue
    fi

    # Filter by environment if specified
    if [ -n "$FILTER_ENV" ] && [ "$env_name" != "$FILTER_ENV" ]; then
        continue
    fi

    container_name="$env_name"
    total_files=$((total_files + 1))

    echo "Checking: $filename → $container_name/$remote_filename"

    # Check if container exists
    if [ "$AUTH_METHOD" == "sas" ]; then
        blob_exists=$(az storage blob exists \
            --account-name "$STORAGE_ACCOUNT" \
            --container-name "$container_name" \
            --name "$remote_filename" \
            --sas-token "$SAS_TOKEN" \
            --output json 2>/dev/null || echo '{"exists": false}')
    else
        blob_exists=$(az storage blob exists \
            --account-name "$STORAGE_ACCOUNT" \
            --container-name "$container_name" \
            --name "$remote_filename" \
            --auth-mode login \
            --output json 2>/dev/null || echo '{"exists": false}')
    fi

    if ! echo "$blob_exists" | grep -q '"exists": true'; then
        echo -e "  ${RED}✗ Remote file does not exist${NC}"
        missing_remote=$((missing_remote + 1))
        continue
    fi

    # Get MD5 hash of local file
    if [[ "$OSTYPE" == "darwin"* ]]; then
        local_md5=$(md5 -q "$local_file")
    else
        local_md5=$(md5sum "$local_file" | cut -d' ' -f1)
    fi

    # Download the remote file to a temp location and compare
    temp_file=$(mktemp)
    if [ "$AUTH_METHOD" == "sas" ]; then
        az storage blob download \
            --account-name "$STORAGE_ACCOUNT" \
            --container-name "$container_name" \
            --name "$remote_filename" \
            --file "$temp_file" \
            --sas-token "$SAS_TOKEN" \
            --output none 2>/dev/null
    else
        az storage blob download \
            --account-name "$STORAGE_ACCOUNT" \
            --container-name "$container_name" \
            --name "$remote_filename" \
            --file "$temp_file" \
            --auth-mode login \
            --output none 2>/dev/null
    fi

    if [[ "$OSTYPE" == "darwin"* ]]; then
        remote_md5=$(md5 -q "$temp_file")
    else
        remote_md5=$(md5sum "$temp_file" | cut -d' ' -f1)
    fi

    rm "$temp_file"

    # Compare hashes
    if [ "$local_md5" == "$remote_md5" ]; then
        echo -e "  ${GREEN}✓ In sync${NC}"
        in_sync=$((in_sync + 1))
    else
        echo -e "  ${RED}✗ Out of sync${NC}"
        echo "    Local MD5:  $local_md5"
        echo "    Remote MD5: $remote_md5"
        out_of_sync=$((out_of_sync + 1))
    fi
    echo ""
done

# Summary
echo "=== Summary ==="
echo "Total files checked: $total_files"
echo -e "${GREEN}In sync: $in_sync${NC}"
echo -e "${RED}Out of sync: $out_of_sync${NC}"
echo -e "${YELLOW}Missing remote: $missing_remote${NC}"
echo ""

if [ $out_of_sync -gt 0 ] || [ $missing_remote -gt 0 ]; then
    exit 1
else
    echo -e "${GREEN}All files are in sync!${NC}"
    exit 0
fi
