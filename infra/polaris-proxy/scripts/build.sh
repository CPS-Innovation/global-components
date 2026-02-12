#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/.."

echo "Building polaris-proxy..."

# Create dist directory if needed
mkdir -p "$ROOT_DIR/dist"

# For now, just copy config files to dist
# In the future, this could compile TypeScript if we convert the njs files
cp "$ROOT_DIR/config/nginx.conf" "$ROOT_DIR/dist/nginx.conf.template"
cp "$ROOT_DIR/config/nginx.js" "$ROOT_DIR/dist/nginx.js"
cp "$ROOT_DIR/config/cmsenv.js" "$ROOT_DIR/dist/cmsenv.js"
cp "$ROOT_DIR/config/polaris-script.js" "$ROOT_DIR/dist/polaris-script.js"

echo "Build complete. Files copied to dist/"
