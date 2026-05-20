#!/usr/bin/env bash
#
# Disaster-recovery script. Restores the `prod` blob container to the state of
# `prod-safe` (the pre-deploy backup created on 2026-05-20).
#
# Behaviour:
#   1. Copies every blob from prod-safe → prod (overwriting whatever's there).
#   2. Deletes any *canonical-named* blob in prod that isn't in prod-safe — i.e.
#      files added by the bad deploy (e.g. a new auth-handover.html that the
#      pre-deploy config doesn't reference). Non-canonical cruft (.git/, packages/,
#      etc.) is left alone — it's invisible to nginx and not part of our concern.
#
# Operates via the same SSH-to-AWS-box route used by the analytics scripts, so
# byte movement is server-side and you don't need a local connection string.
#
# Usage:
#   ./scripts/restore-prod-from-safe.sh                      # dry-run: shows
#                                                            #   what would happen
#   CONFIRM=yes ./scripts/restore-prod-from-safe.sh          # actually run
#
# Requires:
#   - AWS_REMOTE in infra/analytics/scripts/.env (the SSH endpoint)
#   - that SSH endpoint has az CLI installed and an identity with
#     Storage Blob Data Contributor on the sacpsglobalcomponents account.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -f "$ROOT_DIR/infra/analytics/scripts/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "$ROOT_DIR/infra/analytics/scripts/.env"; set +a
fi

if [[ -z "${AWS_REMOTE:-}" ]]; then
  echo "AWS_REMOTE must be set (expected in infra/analytics/scripts/.env)" >&2
  exit 2
fi

ACCOUNT="${ACCOUNT:-sacpsglobalcomponents}"
CONFIRM_VAL="${CONFIRM:-no}"

if [[ "$CONFIRM_VAL" != "yes" ]]; then
  echo "DRY RUN — pass CONFIRM=yes to actually run."
  echo ""
fi

# Heredoc is single-quoted so the local shell doesn't interpolate. Local values
# are passed in as positional parameters via `bash -s …`.
ssh "$AWS_REMOTE" bash -s "$ACCOUNT" "$CONFIRM_VAL" << 'REMOTE_EOF'
set -e

ACCOUNT="$1"
CONFIRM="$2"
SOURCE_CONTAINER="prod-safe"
DEST_CONTAINER="prod"

# Canonical-named blob pattern. Mirrors scripts/purge-blob-cruft.sh keep-list
# plus the three msal-redirect transition files. Files in prod that match this
# pattern but aren't in prod-safe are deletion candidates (the bad deploy
# added them); files that don't match this pattern are left alone.
CANONICAL_PATTERN='^(global-components\.js(\.map)?|cps-global-components\.js|auth-handover\.(js|js\.map|html)|global-components-msal-redirect\.html|msal-redirect\.(js|js\.map)|probe-iframe-load\.html|config\.json|notification\.json|(preview|accessibility)/(index\.html|assets/.+))$'

echo "=== prod-safe contents ==="
SAFE_LIST=$(az storage blob list \
  --account-name "$ACCOUNT" \
  --container-name "$SOURCE_CONTAINER" \
  --auth-mode login \
  --query "[].name" -o tsv)
echo "$SAFE_LIST" | sed 's/^/  /'
SAFE_COUNT=$(echo "$SAFE_LIST" | grep -c . || true)
echo "($SAFE_COUNT file(s))"
echo ""

if [ "$SAFE_COUNT" -eq 0 ]; then
  echo "prod-safe is empty — nothing to restore. Aborting." >&2
  exit 3
fi

echo "=== Orphans (canonical-named files in prod, not in prod-safe) ==="
echo "    these would be deleted to match prod-safe state"
PROD_CANONICAL=$(az storage blob list \
  --account-name "$ACCOUNT" \
  --container-name "$DEST_CONTAINER" \
  --auth-mode login \
  --query "[].name" -o tsv \
  | grep -E "$CANONICAL_PATTERN" || true)
ORPHANS=$(comm -23 <(echo "$PROD_CANONICAL" | sort -u) <(echo "$SAFE_LIST" | sort -u) || true)
if [ -z "$ORPHANS" ]; then
  echo "  (none)"
else
  echo "$ORPHANS" | sed 's/^/  /'
fi
echo ""

if [ "$CONFIRM" != "yes" ]; then
  echo "DRY RUN. Pass CONFIRM=yes to actually restore."
  exit 0
fi

echo "=== Copying prod-safe -> prod ==="
echo "$SAFE_LIST" | while IFS= read -r blob; do
  [ -z "$blob" ] && continue
  az storage blob copy start \
    --account-name "$ACCOUNT" \
    --destination-container "$DEST_CONTAINER" \
    --destination-blob "$blob" \
    --source-container "$SOURCE_CONTAINER" \
    --source-blob "$blob" \
    --auth-mode login \
    --requires-sync true \
    --output none
  echo "  copied: $blob"
done
echo ""

if [ -n "$ORPHANS" ]; then
  echo "=== Deleting orphans ==="
  echo "$ORPHANS" | while IFS= read -r blob; do
    [ -z "$blob" ] && continue
    az storage blob delete \
      --account-name "$ACCOUNT" \
      --container-name "$DEST_CONTAINER" \
      --name "$blob" \
      --auth-mode login \
      --output none
    echo "  deleted: $blob"
  done
  echo ""
fi

echo "=== Done ==="
PROD_COUNT=$(az storage blob list \
  --account-name "$ACCOUNT" \
  --container-name "$DEST_CONTAINER" \
  --auth-mode login \
  --query "length(@)" -o tsv)
echo "prod now contains $PROD_COUNT blob(s) total (canonical + pre-existing cruft)."
REMOTE_EOF
