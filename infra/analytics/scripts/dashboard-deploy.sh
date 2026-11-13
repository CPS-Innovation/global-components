#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/.env"
source "${SCRIPT_DIR}/target.sh"

INFILE="${1:?Usage: dashboard-deploy.sh <json-file>}"

echo "→ Deploying ${INFILE} to ${AWS_REMOTE}"
echo "→ Dashboard: ${DASHBOARD_ID}"

: "${DASHBOARD_ID:?No dashboard id for this target (PROD_DASHBOARD_ID in .env)}"

# id and name are dropped so the URI alone decides which dashboard this is (the repo copy carries dev's).
retarget < "$INFILE" | jq 'del(.id, .name)' \
  | ssh "$AWS_REMOTE" "az rest --method PUT --headers Content-Type=application/json --uri https://management.azure.com${DASHBOARD_ID}?api-version=${API_VERSION} --body @-"

echo "Done"
