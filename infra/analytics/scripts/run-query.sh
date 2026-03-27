#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/.env"

OUTDIR="${SCRIPT_DIR}/output"

QUERY="${1:?Usage: run-query.sh \"<query>\" [table|json|tsv]}"
FORMAT="${2:-table}"

# Sanitize first 100 chars of query into a safe filename
SAFE=$(printf '%s' "$QUERY" \
  | cut -c1-100 \
  | tr -cs 'a-zA-Z0-9_-' '_' \
  | sed 's/_\+/_/g; s/^_//; s/_$//')
OUTFILE="${OUTDIR}/${SAFE}.txt"

echo "→ ${AWS_REMOTE}"
echo "→ ${OUTFILE}"

ssh "$AWS_REMOTE" "az monitor log-analytics query \
  --workspace ${WORKSPACE_ID} \
  --analytics-query $(printf '%q' "$QUERY") \
  --output ${FORMAT}" > "$OUTFILE"

echo "Done: ${OUTFILE}"
