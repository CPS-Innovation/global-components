#!/usr/bin/env bash
# Entry point kept for CI, package.json and deploy.local.sh. The build is build.js,
# driven by bundles.json.
set -euo pipefail
exec node "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/build.js" "$@"
