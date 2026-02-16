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

# Copy config files (add .template suffix for nginx envsubst)
echo "Copying config files..."
cp "$PROXY_DIR/config/main/nginx.conf" "$DIST_DIR/nginx.conf.template"
cp "$PROXY_DIR/config/main/global-components.conf" "$DIST_DIR/global-components.conf.template"
cp "$PROXY_DIR/config/global-components.vnext/global-components.vnext.conf" "$DIST_DIR/global-components.vnext.conf.template"
cp "$PROXY_DIR/config/global-components.spike/global-components.spike.conf" "$DIST_DIR/global-components.spike.conf.template"
cp "$PROXY_DIR/config/global-components.spike/global-components.cms-proxy-no-logout.conf" "$DIST_DIR/global-components.cms-proxy-no-logout.conf.template"
cp "$PROXY_DIR/config/global-components.spike/global-components.cms-auth.conf" "$DIST_DIR/global-components.cms-auth.conf.template"
cp "$PROXY_DIR/config/global-components.spike/global-components.cms-ping.conf" "$DIST_DIR/global-components.cms-ping.conf.template"

# Flatten the compiled JS files (they're in subdirectories from tsc)
echo "Flattening compiled JS files..."
mv "$DIST_DIR/main/global-components.js" "$DIST_DIR/global-components.js"
mv "$DIST_DIR/global-components.vnext/global-components.vnext.js" "$DIST_DIR/global-components.vnext.js"
mv "$DIST_DIR/global-components.spike/global-components.spike.js" "$DIST_DIR/global-components.spike.js"
mv "$DIST_DIR/global-components.spike/cookie-utils.js" "$DIST_DIR/cookie-utils.js"
mv "$DIST_DIR/global-components.spike/global-components.cms-proxy-no-logout.js" "$DIST_DIR/global-components.cms-proxy-no-logout.js"
mv "$DIST_DIR/global-components.spike/global-components.cms-auth.js" "$DIST_DIR/global-components.cms-auth.js"
mv "$DIST_DIR/global-components.spike/global-components.cms-ping.js" "$DIST_DIR/global-components.cms-ping.js"

# Remove empty directories
rmdir "$DIST_DIR/main" 2>/dev/null || true
rmdir "$DIST_DIR/global-components.vnext" 2>/dev/null || true
rmdir "$DIST_DIR/global-components.spike" 2>/dev/null || true

echo ""
echo "Build complete! Contents of dist/:"
ls -la "$DIST_DIR"
