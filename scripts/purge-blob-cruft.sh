#!/bin/bash
#
# Lists blobs in an env container and deletes anything that isn't part of the
# canonical deployed set defined in .github/workflows/README.md.
#
# Usage:
#   BLOB_STORAGE_CONNECTION_STRING='...' ./scripts/purge-blob-cruft.sh <container>
#
# Dry-run by default. Pass CONFIRM=yes to actually delete.
#
# Examples:
#   ./scripts/purge-blob-cruft.sh dev                  # list what would be deleted
#   CONFIRM=yes ./scripts/purge-blob-cruft.sh dev      # delete for real
#
# Parallelism is controlled by PARALLEL (default 20).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/secrets.env" ]]; then
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/secrets.env"
fi

CONTAINER="${1:-}"
if [[ -z "$CONTAINER" ]]; then
  echo "Usage: $0 <container>" >&2
  exit 2
fi
if [[ -z "${BLOB_STORAGE_CONNECTION_STRING:-}" ]]; then
  echo "BLOB_STORAGE_CONNECTION_STRING must be set — either export it, or add it to scripts/secrets.env" >&2
  exit 2
fi

# A blob is kept iff it matches one of these patterns. Anything else is cruft.
#
# Root-level files (exact match):
#   global-components.js, global-components.js.map
#   cps-global-components.js            (redirect stub)
#   auth-handover.js, auth-handover.js.map
#   global-components-msal-redirect.html (silent-MSAL same-origin termination page)
#   msal-redirect.js, msal-redirect.js.map (IIFE bundle loaded by the termination page)
#   probe-iframe-load.html              (LNA diagnostic probe page)
#   config.json                         (required)
#   notification.json                   (optional; kept if present)
#
# SPA bundles (Vite output — index.html + hashed assets only):
#   preview/index.html, preview/assets/*
#   accessibility/index.html, accessibility/assets/*
is_kept() {
  case "$1" in
    global-components.js|global-components.js.map) return 0 ;;
    cps-global-components.js) return 0 ;;
    auth-handover.js|auth-handover.js.map) return 0 ;;
    global-components-msal-redirect.html) return 0 ;;
    msal-redirect.js|msal-redirect.js.map) return 0 ;;
    probe-iframe-load.html) return 0 ;;
    config.json|notification.json) return 0 ;;
    preview/index.html|accessibility/index.html) return 0 ;;
    preview/assets/*|accessibility/assets/*) return 0 ;;
  esac
  return 1
}

echo "Listing blobs in '$CONTAINER'..."
BLOBS_RAW=$(az storage blob list \
  --container-name "$CONTAINER" \
  --connection-string "$BLOB_STORAGE_CONNECTION_STRING" \
  --query "[].name" -o tsv)

TO_DELETE=()
KEPT=0
while IFS= read -r blob; do
  [[ -z "$blob" ]] && continue
  if is_kept "$blob"; then
    KEPT=$((KEPT + 1))
  else
    TO_DELETE+=("$blob")
  fi
done <<< "$BLOBS_RAW"

echo ""
echo "Container: $CONTAINER"
echo "Keep:      $KEPT"
echo "Delete:    ${#TO_DELETE[@]}"
echo ""

if [[ ${#TO_DELETE[@]} -eq 0 ]]; then
  echo "Nothing to delete."
  exit 0
fi

echo "Files to delete:"
printf '  %s\n' "${TO_DELETE[@]}"
echo ""

if [[ "${CONFIRM:-no}" != "yes" ]]; then
  echo "DRY RUN — pass CONFIRM=yes to actually delete."
  exit 0
fi

PARALLEL="${PARALLEL:-20}"
echo "Deleting with parallelism=$PARALLEL ..."

# xargs runs N deletes concurrently. Each az invocation is one HTTP DELETE.
printf '%s\n' "${TO_DELETE[@]}" | xargs -P "$PARALLEL" -I {} \
  az storage blob delete \
    --container-name "$CONTAINER" \
    --name {} \
    --connection-string "$BLOB_STORAGE_CONNECTION_STRING" \
    --output none

echo ""
echo "Done. Deleted ${#TO_DELETE[@]} blobs from '$CONTAINER'."
