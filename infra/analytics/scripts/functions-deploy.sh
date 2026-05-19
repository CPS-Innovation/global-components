#!/usr/bin/env bash
set -euo pipefail

# Deploy a single KQL function to Log Analytics. For existing functions, looks
# up the saved-search-id / category / displayName from deployed-functions.json
# (produced by functions-export.sh) and updates in place. For new functions,
# generates a saved-search-id and prompts before creating.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/.env"

INFILE="${1:?Usage: functions-deploy.sh <kql-file>}"
DEPLOYED="${SCRIPT_DIR}/output/deployed-functions.json"

if [[ ! -f "$INFILE" ]]; then
  echo "Error: file not found: $INFILE" >&2
  exit 1
fi

if [[ ! -f "$DEPLOYED" ]]; then
  echo "Error: $DEPLOYED not found. Run functions-export.sh first." >&2
  exit 1
fi

ALIAS=$(basename "$INFILE" .kql)
TMP_REMOTE="/tmp/deploy-fn-$$-${ALIAS}.kql"

EXISTING=$(jq --arg a "$ALIAS" '[.[] | select(.functionAlias == $a)] | .[0]' "$DEPLOYED")

if [[ "$EXISTING" == "null" ]]; then
  echo "→ ${ALIAS} not in deployed-functions.json — will create as new function"
  echo "  category    = GloCo"
  echo "  displayName = ${ALIAS}"
  read -r -p "Proceed? [y/N] " REPLY
  if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
    echo "Aborted"
    exit 0
  fi
  GUID=$(uuidgen | tr '[:upper:]' '[:lower:]')
  SAVED_ID="${GUID}_$(echo "$ALIAS" | tr '[:upper:]' '[:lower:]')"
  CATEGORY="GloCo"
  DISPLAY_NAME="$ALIAS"
  ACTION="create"
else
  SAVED_ID=$(echo "$EXISTING" | jq -r '.name')
  CATEGORY=$(echo "$EXISTING" | jq -r '.category')
  DISPLAY_NAME=$(echo "$EXISTING" | jq -r '.displayName')
  ACTION="update"
fi

echo "→ ${AWS_REMOTE}"
echo "→ ${ACTION} ${ALIAS} (id=${SAVED_ID}, category=${CATEGORY})"

scp -q "$INFILE" "${AWS_REMOTE}:${TMP_REMOTE}"

ssh "$AWS_REMOTE" "
  set -euo pipefail
  Q=\$(cat '${TMP_REMOTE}')
  az monitor log-analytics workspace saved-search ${ACTION} \\
    --workspace-name '${WORKSPACE_NAME}' \\
    --resource-group '${RESOURCE_GROUP}' \\
    --subscription '${SUBSCRIPTION}' \\
    --name '${SAVED_ID}' \\
    --category '${CATEGORY}' \\
    --display-name '${DISPLAY_NAME}' \\
    --fa '${ALIAS}' \\
    --saved-query \"\$Q\" > /dev/null
  rm '${TMP_REMOTE}'
"

echo "Done: ${ALIAS}"
if [[ "$ACTION" == "create" ]]; then
  echo "Tip: re-run functions-export.sh so subsequent deploys can find ${ALIAS} by alias"
fi
