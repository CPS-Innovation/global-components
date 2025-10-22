#!/bin/bash

# Script to sync local configuration files to Azure Blob Storage
# Usage: ./scripts/config-sync.sh [environment]
# Example: ./scripts/config-sync.sh dev

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
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CONFIG_DIR="./configuration"
STORAGE_ACCOUNT="${AZURE_STORAGE_ACCOUNT}"
SAS_TOKEN="${AZURE_STORAGE_SAS_TOKEN}"
CONTAINER_PREFIX=""

echo "=== Configuration Sync (Upload) ==="
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
uploaded=0
failed=0

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

    echo "Processing: $filename → $container_name/$remote_filename"

    # Get MD5 hash of local file
    if [[ "$OSTYPE" == "darwin"* ]]; then
        local_md5=$(md5 -q "$local_file")
    else
        local_md5=$(md5sum "$local_file" | cut -d' ' -f1)
    fi

    # Check if blob exists
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

    needs_upload=false

    if ! echo "$blob_exists" | grep -q '"exists": true'; then
        echo -e "  ${YELLOW}→ Remote file does not exist, will upload${NC}"
        needs_upload=true
    else
        # Download the remote file to compare
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
            echo -e "  ${GREEN}✓ Already in sync${NC}"
            in_sync=$((in_sync + 1))
        else
            echo -e "  ${YELLOW}→ Out of sync, will upload${NC}"
            echo "    Local MD5:  $local_md5"
            echo "    Remote MD5: $remote_md5"
            needs_upload=true
        fi
    fi

    # Upload if needed
    if [ "$needs_upload" = true ]; then
        echo -e "  ${BLUE}↑ Uploading...${NC}"

        if [ "$AUTH_METHOD" == "sas" ]; then
            if az storage blob upload \
                --account-name "$STORAGE_ACCOUNT" \
                --container-name "$container_name" \
                --name "$remote_filename" \
                --file "$local_file" \
                --sas-token "$SAS_TOKEN" \
                --overwrite \
                --output none 2>/dev/null; then
                echo -e "  ${GREEN}✓ Upload successful${NC}"
                uploaded=$((uploaded + 1))
            else
                echo -e "  ${RED}✗ Upload failed${NC}"
                failed=$((failed + 1))
            fi
        else
            if az storage blob upload \
                --account-name "$STORAGE_ACCOUNT" \
                --container-name "$container_name" \
                --name "$remote_filename" \
                --file "$local_file" \
                --auth-mode login \
                --overwrite \
                --output none 2>/dev/null; then
                echo -e "  ${GREEN}✓ Upload successful${NC}"
                uploaded=$((uploaded + 1))
            else
                echo -e "  ${RED}✗ Upload failed${NC}"
                failed=$((failed + 1))
            fi
        fi
    fi
    echo ""
done

# Summary
echo "=== Summary ==="
echo "Total files processed: $total_files"
echo -e "${GREEN}Already in sync: $in_sync${NC}"
echo -e "${BLUE}Uploaded: $uploaded${NC}"
if [ $failed -gt 0 ]; then
    echo -e "${RED}Failed: $failed${NC}"
fi
echo ""

if [ $failed -gt 0 ]; then
    echo -e "${RED}Some uploads failed!${NC}"
    exit 1
elif [ $uploaded -gt 0 ]; then
    echo -e "${GREEN}All files synced successfully!${NC}"
    exit 0
else
    echo -e "${GREEN}All files were already in sync!${NC}"
    exit 0
fi
