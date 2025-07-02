#!/bin/bash

# Exit on error
set -e

# Check if an argument was provided
if [ $# -eq 0 ]; then
    echo "Error: No configuration name provided"
    echo "Usage: ./build.sh <config-name>"
    echo "Example: ./build.sh dev"
    exit 1
fi

CONFIG_NAME=$1
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/../.." && pwd )"
CONFIG_FILE="$ROOT_DIR/configuration/config.$CONFIG_NAME.json"

# Check if configuration file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: Configuration file not found: $CONFIG_FILE"
    exit 1
fi

echo "Building cps-global-os-handover with configuration: $CONFIG_NAME"
echo "Using config file: $CONFIG_FILE"

# Extract all *_URL* variables from the JSON file and export them as environment variables
echo "Extracting URL variables from configuration..."
eval $(jq -r 'to_entries | .[] | select(.key | test(".*_URL.*")) | "export \(.key)=\(.value | @sh)"' "$CONFIG_FILE")

# Display extracted URL variables
echo "Extracted URL variables:"
env | grep "_URL" | sort || echo "No URL variables found"

# Change to package directory
cd "$SCRIPT_DIR"

# Clean previous build
echo "Cleaning previous build..."
pnpm run clean || true

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    pnpm install
fi

# Build the TypeScript project with Rollup
echo "Building project with Rollup..."
pnpm exec rollup -c rollup.config.mjs

# Verify build output
if [ -d "dist" ]; then
    echo "Build completed successfully!"
    echo "Output directory: $SCRIPT_DIR/dist"
    ls -la dist/
else
    echo "Error: Build failed - dist directory not created"
    exit 1
fi

echo "Build complete for configuration: $CONFIG_NAME"