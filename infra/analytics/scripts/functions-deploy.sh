#!/usr/bin/env bash
set -euo pipefail

# Deploy a single KQL function to Log Analytics. For existing functions, looks
# up the saved-search-id / category / displayName from deployed-functions.json
# (produced by functions-export.sh) and updates in place. For new functions,
# generates a saved-search-id and prompts before creating.
#
# --prune: the other direction. Refreshes the export, lists every deployed GloCo_* function
# with no ../kql/<alias>.kql, and deletes them on confirmation. Deploy first, prune last, so
# nothing is deleted while a function that still calls it is live.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/.env"

DEPLOYED="${SCRIPT_DIR}/output/deployed-functions.json"
KQLDIR="${SCRIPT_DIR}/../kql"

# Deployed on purpose with no .kql in the repo (it contains emails / ObjectIds): never pruned.
DEPLOYED_ONLY=("GloCo_UserDimension")

if [[ "${1:-}" == "--prune" ]]; then
  "${SCRIPT_DIR}/functions-export.sh" < /dev/null > /dev/null
  ORPHANS=()
  while IFS=$'\t' read -r ALIAS SAVED_ID; do
    if [[ -f "${KQLDIR}/${ALIAS}.kql" ]]; then
      continue
    fi
    if [[ " ${DEPLOYED_ONLY[*]} " == *" ${ALIAS} "* ]]; then
      continue
    fi
    ORPHANS+=("${ALIAS}"$'\t'"${SAVED_ID}")
  done < <(jq -r '.[] | [.functionAlias, .name] | @tsv' "$DEPLOYED" | sort)

  if [[ ${#ORPHANS[@]} -eq 0 ]]; then
    echo "Nothing to prune: every deployed GloCo_ function has a .kql in ${KQLDIR}"
    exit 0
  fi

  echo "Deployed functions with no .kql in the repo:"
  for O in "${ORPHANS[@]}"; do
    echo "  ${O%%$'\t'*}"
  done
  read -r -p "Delete these ${#ORPHANS[@]} functions from ${WORKSPACE_NAME}? [y/N] " REPLY
  if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
    echo "Aborted"
    exit 0
  fi

  for O in "${ORPHANS[@]}"; do
    ALIAS="${O%%$'\t'*}"
    SAVED_ID="${O#*$'\t'}"
    ssh -n "$AWS_REMOTE" "az monitor log-analytics workspace saved-search delete \
      --workspace-name '${WORKSPACE_NAME}' \
      --resource-group '${RESOURCE_GROUP}' \
      --subscription '${SUBSCRIPTION}' \
      --name '${SAVED_ID}' \
      --yes"
    echo "Deleted: ${ALIAS}"
  done
  "${SCRIPT_DIR}/functions-export.sh" < /dev/null > /dev/null
  echo "Done: re-exported deployed-functions.json"
  exit 0
fi

INFILE="${1:?Usage: functions-deploy.sh <kql-file> | --prune}"

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
