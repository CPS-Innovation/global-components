#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROXY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$PROXY_DIR/dist"

echo "Building proxy deployment package..."
echo "========================================"

# Clean dist directory
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# Compile TypeScript
echo "Compiling TypeScript..."
cd "$PROXY_DIR"
npx tsc

# Copy nginx.js (not compiled from TypeScript, maintained separately)
echo "Copying nginx.js..."
cp "$PROXY_DIR/config/main/nginx.js" "$DIST_DIR/nginx.js"

# Copy config templates
echo "Copying config templates..."
cp "$PROXY_DIR/config/main/nginx.conf.template" "$DIST_DIR/nginx.conf.template"
cp "$PROXY_DIR/config/main/global-components.conf.template" "$DIST_DIR/global-components.conf.template"
cp "$PROXY_DIR/config/global-components.vnext/global-components.vnext.conf.template" "$DIST_DIR/global-components.vnext.conf.template"
cp "$PROXY_DIR/config/global-components.vnever/global-components.vnever.conf.template" "$DIST_DIR/global-components.vnever.conf.template"

# Flatten the compiled JS files (they're in subdirectories from tsc)
echo "Flattening compiled JS files..."
mv "$DIST_DIR/main/global-components.js" "$DIST_DIR/global-components.js"
mv "$DIST_DIR/global-components.vnext/global-components.vnext.js" "$DIST_DIR/global-components.vnext.js"
mv "$DIST_DIR/global-components.vnever/global-components.vnever.js" "$DIST_DIR/global-components.vnever.js"

# Remove empty directories
rmdir "$DIST_DIR/main" 2>/dev/null || true
rmdir "$DIST_DIR/global-components.vnext" 2>/dev/null || true
rmdir "$DIST_DIR/global-components.vnever" 2>/dev/null || true

echo ""
echo "Build complete! Contents of dist/:"
ls -la "$DIST_DIR"
