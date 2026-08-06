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

# Copy nginx.js + cmsenv.js (not compiled from TypeScript, maintained separately).
# cmsenv.js is imported by nginx.conf (js_import cmsenv.js) so it must ship too.
echo "Copying nginx.js + cmsenv.js..."
cp "$PROXY_DIR/config/main/nginx.js" "$DIST_DIR/nginx.js"
cp "$PROXY_DIR/config/main/cmsenv.js" "$DIST_DIR/cmsenv.js"

# Copy config files (add .template suffix for nginx envsubst)
echo "Copying config files..."
cp "$PROXY_DIR/config/main/nginx.conf" "$DIST_DIR/nginx.conf.template"
cp "$PROXY_DIR/config/main/global-components.conf" "$DIST_DIR/global-components.conf.template"
cp "$PROXY_DIR/config/global-components.vnext/global-components.vnext.conf" "$DIST_DIR/global-components.vnext.conf.template"
# NOTE: the v1 spike variants (cms-auth, cms-ping, cms-proxy-no-logout, spike) are
# archived under global-components.cms-auth-v2/previous/ for REFERENCE ONLY. They are
# deliberately NOT built or packaged — tsconfig excludes config/**/previous/**, so they
# never reach dist/ or any deploy.
#
# NOTE: cms-auth-v2 is a POC deployed out-of-band (by hand), NOT via this package.
# Its .conf is deliberately NOT copied into dist/ so it never enters the deploy
# bundle. The integration test mounts the v2 .conf straight from source (see
# docker/docker-compose.cms-auth-v2.yml); only the compiled v2 .js is flattened
# into dist/ below, which is inert unless a deployed .conf js_imports it.
cp "$PROXY_DIR/config/global-components.case-locking/global-components.case-locking.conf" "$DIST_DIR/global-components.case-locking.conf.template"

# Flatten the compiled JS files (they're in subdirectories from tsc)
echo "Flattening compiled JS files..."
mv "$DIST_DIR/main/global-components.js" "$DIST_DIR/global-components.js"
mv "$DIST_DIR/global-components.vnext/global-components.vnext.js" "$DIST_DIR/global-components.vnext.js"
mv "$DIST_DIR/global-components.cms-auth-v2/global-components.cms-auth-v2.js" "$DIST_DIR/global-components.cms-auth-v2.js"
mv "$DIST_DIR/global-components.case-locking/global-components.case-locking.js" "$DIST_DIR/global-components.case-locking.js"
# polaris-non-ddei: another out-of-band POC (like cms-auth-v2) — flatten its
# compiled .js so the hand-deploy can pick it up; its .conf is NOT bundled here.
mv "$DIST_DIR/global-components.polaris-non-ddei/global-components.polaris-non-ddei.js" "$DIST_DIR/global-components.polaris-non-ddei.js"

# Remove empty directories
rmdir "$DIST_DIR/main" 2>/dev/null || true
rmdir "$DIST_DIR/global-components.vnext" 2>/dev/null || true
rmdir "$DIST_DIR/global-components.cms-auth-v2" 2>/dev/null || true
rmdir "$DIST_DIR/global-components.case-locking" 2>/dev/null || true
rmdir "$DIST_DIR/global-components.polaris-non-ddei" 2>/dev/null || true

echo ""
echo "Build complete! Contents of dist/:"
ls -la "$DIST_DIR"
