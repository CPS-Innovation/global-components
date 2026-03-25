#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/.env"

INFILE="${1:?Usage: dashboard-deploy.sh <json-file>}"

echo "→ Deploying ${INFILE} to ${AWS_REMOTE}"
echo "→ Dashboard: ${DASHBOARD_ID}"

sed "s/__SUBSCRIPTION_ID__/${SUBSCRIPTION}/g" "$INFILE" \
  | ssh "$AWS_REMOTE" "az rest --method PUT --headers Content-Type=application/json --uri https://management.azure.com${DASHBOARD_ID}?api-version=${API_VERSION} --body @-"

echo "Done"
