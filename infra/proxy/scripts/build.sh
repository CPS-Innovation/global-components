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

# Copy nginx.js + cmsenv.js (maintained separately, not ours).
# cmsenv.js is imported by nginx.conf (js_import cmsenv.js) so it must ship too.
echo "Copying nginx.js + cmsenv.js..."
cp "$PROXY_DIR/config/main/nginx.js" "$DIST_DIR/nginx.js"
cp "$PROXY_DIR/config/main/cmsenv.js" "$DIST_DIR/cmsenv.js"

# Copy config files (add .template suffix for nginx envsubst)
echo "Copying config files..."
cp "$PROXY_DIR/config/main/nginx.conf" "$DIST_DIR/nginx.conf.template"
cp "$PROXY_DIR/config/main/global-components.conf" "$DIST_DIR/global-components.conf.template"
cp "$PROXY_DIR/config/global-components.vnext/global-components.vnext.conf" "$DIST_DIR/global-components.vnext.conf.template"
# Temporary OS London/Dublin/oapps switch module (FCT2-22132) — delete with the module.
cp "$PROXY_DIR/config/global-components.os-london-dublin-oapps-switch/global-components.os-london-dublin-oapps-switch.conf" "$DIST_DIR/global-components.os-london-dublin-oapps-switch.conf.template"
# NOTE: the v1 spike variants (cms-auth, cms-ping, cms-proxy-no-logout, spike) are
# archived under global-components.cms-augmentation/previous/ for REFERENCE ONLY. They
# are deliberately NOT copied, so they never reach dist/ or any deploy.
#
# NOTE: cms-augmentation and watchdog are deployed by deploy.local.sh, NOT via this
# package's deploy/deploy.sh. Their confs are not copied into dist/: deploy.local.sh
# reads each conf from source (cms-augmentation's needs @@SCRIPT_BASE@@ substituted
# first), and the integration tests mount them from source too. Only their .js
# files are copied into dist/ below.

# Copy the njs modules. They are plain JS (no TypeScript since 2026-11-10): dist/
# keeps the flat names the deploy scripts and docker layers read.
echo "Copying njs modules..."
cp "$PROXY_DIR/config/main/global-components.js" "$DIST_DIR/global-components.js"
for module in vnext os-london-dublin-oapps-switch cms-augmentation watchdog; do
  cp "$PROXY_DIR/config/global-components.$module/global-components.$module.js" "$DIST_DIR/global-components.$module.js"
done

echo ""
echo "Build complete! Contents of dist/:"
ls -la "$DIST_DIR"
