#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/.env"

OUTDIR="${SCRIPT_DIR}/output"
DASHDIR="${SCRIPT_DIR}/../dashboard"

SAFE=$(printf '%s' "$DASHBOARD_ID" \
  | tr -cs 'a-zA-Z0-9_-' '_' \
  | sed 's/_\+/_/g; s/^_//; s/_$//')
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
OUTFILE="${OUTDIR}/${SAFE}_${TIMESTAMP}.json"

echo "→ ${AWS_REMOTE}"
echo "→ ${OUTFILE}"

ssh "$AWS_REMOTE" "az rest \
  --method GET \
  --uri $(printf '%q' "https://management.azure.com${DASHBOARD_ID}?api-version=${API_VERSION}")" \
  > "$OUTFILE"

echo "Done: ${OUTFILE}"

if [[ "${1:-}" == "--sync-dashboard" ]]; then
  mkdir -p "$DASHDIR"
  sed "s/${SUBSCRIPTION}/__SUBSCRIPTION_ID__/g" "$OUTFILE" > "${DASHDIR}/dashboard.json"
  echo "→ Synced to ${DASHDIR}/dashboard.json (subscription ID redacted)"
fi
