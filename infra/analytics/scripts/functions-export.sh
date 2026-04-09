#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/.env"

OUTDIR="${SCRIPT_DIR}/output"
KQLDIR="${SCRIPT_DIR}/../kql"

OUTFILE="${OUTDIR}/deployed-functions.json"

echo "→ ${AWS_REMOTE}"
echo "→ Fetching saved searches and filtering to GloCo_..."

ssh "$AWS_REMOTE" "az monitor log-analytics workspace saved-search list \
  --workspace-name ${WORKSPACE_NAME} \
  --resource-group ${RESOURCE_GROUP} \
  --subscription ${SUBSCRIPTION} \
  -o json" \
  | jq '[.[] | select(.functionAlias != null and (.functionAlias | startswith("GloCo_")))]' \
  > "$OUTFILE"

COUNT=$(jq length "$OUTFILE")
echo "Done: ${OUTFILE} (${COUNT} functions)"

if [[ "${1:-}" == "--sync-kql" ]]; then
  echo "→ Rebuilding ${KQLDIR}/ from deployed functions..."
  rm -f "${KQLDIR}"/*.kql
  jq -c '.[]' "$OUTFILE" | while IFS= read -r ENTRY; do
    ALIAS=$(echo "$ENTRY" | jq -r '.functionAlias')
    QUERY=$(echo "$ENTRY" | jq -r '.query')
    KQLFILE="${KQLDIR}/${ALIAS}.kql"
    printf '%s\n' "$QUERY" > "$KQLFILE"
    echo "  → ${ALIAS}.kql"
  done
  echo "Done: rebuilt $(ls "${KQLDIR}"/*.kql | wc -l | tr -d ' ') .kql files"
fi
