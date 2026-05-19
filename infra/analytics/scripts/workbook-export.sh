#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/.env"

OUTDIR="${SCRIPT_DIR}/output"
WBDIR="${SCRIPT_DIR}/../workbook"

SAFE=$(printf '%s' "$WORKBOOK_ID" \
  | tr -cs 'a-zA-Z0-9_-' '_' \
  | sed 's/_\+/_/g; s/^_//; s/_$//')
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
OUTFILE="${OUTDIR}/${SAFE}_${TIMESTAMP}.json"

echo "→ ${AWS_REMOTE}"
echo "→ ${OUTFILE}"

ssh "$AWS_REMOTE" "az rest \
  --method GET \
  --uri $(printf '%q' "https://management.azure.com${WORKBOOK_ID}?api-version=${WORKBOOK_API_VERSION}&canFetchContent=true")" \
  > "$OUTFILE"

echo "Done: ${OUTFILE}"

if [[ "${1:-}" == "--sync-workbook" ]]; then
  mkdir -p "$WBDIR"
  SYNCFILE="${WBDIR}/${WORKBOOK_NAME}.json"
  # extract serializedData (stringified JSON), pretty-print, redact subscription
  jq -r '.properties.serializedData' "$OUTFILE" \
    | jq '.' \
    | sed "s/${SUBSCRIPTION}/__SUBSCRIPTION_ID__/g" \
    > "$SYNCFILE"
  echo "→ Synced to ${SYNCFILE} (subscription ID redacted)"
fi
