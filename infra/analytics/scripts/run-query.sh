#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/.env"

OUTDIR="${SCRIPT_DIR}/output"

QUERY="${1:?Usage: run-query.sh \"<query>\" [table|json|tsv]}"
FORMAT="${2:-table}"

# Use a short hash of the query as the filename
HASH=$(printf '%s' "$QUERY" | md5 -q 2>/dev/null || printf '%s' "$QUERY" | md5sum | cut -c1-8)
OUTFILE="${OUTDIR}/query_${HASH:0:12}.txt"

echo "→ ${AWS_REMOTE}"
echo "→ ${OUTFILE}"

ssh "$AWS_REMOTE" "az monitor log-analytics query \
  --workspace ${WORKSPACE_ID} \
  --analytics-query $(printf '%q' "$QUERY") \
  --output ${FORMAT}" > "$OUTFILE"

echo "Done: ${OUTFILE}"
