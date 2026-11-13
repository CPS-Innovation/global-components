#!/usr/bin/env bash
set -euo pipefail

# One-off bulk copy: every GloCo_* function deployed in the dev (legacy) workspace is PUT into the prod
# workspace with the same id, category and parameters, so the two suites are equivalent. Functions with a
# prod version in ../kql/prod/ (the primitives that union in the legacy data) get that body instead.
#
# Copies the DEPLOYED bodies, not the repo files, so it also carries the two functions the normal deploy
# cannot: GloCo_UserDimension (deployed-only, too big for a command line) and GloCo_LawyerStatus
# (parameterised). Bodies go via `az rest --body @file`. Safe to re-run; it overwrites in place.
#
#   ./functions-copy-to-prod.sh            list what would be copied, change nothing
#   ./functions-copy-to-prod.sh --yes      copy
#
# Day-to-day changes afterwards: ANALYTICS_TARGET=prod ./functions-deploy.sh ../kql/<alias>.kql

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/.env"

: "${PROD_SUBSCRIPTION:?Set PROD_SUBSCRIPTION in .env}"
: "${PROD_RESOURCE_GROUP:?Set PROD_RESOURCE_GROUP in .env}"
: "${PROD_WORKSPACE_NAME:?Set PROD_WORKSPACE_NAME in .env}"

KQLDIR="${SCRIPT_DIR}/../kql"
WORK="${SCRIPT_DIR}/output/copy-to-prod"

echo "→ refreshing the dev export"
ANALYTICS_TARGET=dev "${SCRIPT_DIR}/functions-export.sh" < /dev/null > /dev/null
SOURCE="${SCRIPT_DIR}/output/deployed-functions.json"

rm -rf "$WORK"
mkdir -p "$WORK"

echo "→ ${PROD_WORKSPACE_NAME} (${PROD_RESOURCE_GROUP}) would receive:"
while IFS= read -r ALIAS; do
  OVERRIDE="${KQLDIR}/prod/${ALIAS}.kql"
  if [[ -f "$OVERRIDE" ]]; then
    # Ids are kept out of the repo: fill the placeholder with the legacy (dev) workspace id from .env.
    jq --arg a "$ALIAS" --arg q "$(sed "s/__LEGACY_WORKSPACE_ID__/${WORKSPACE_ID}/g" "$OVERRIDE")" '.[] | select(.functionAlias == $a) | .query = $q' "$SOURCE" > "${WORK}/${ALIAS}.src.json"
    echo "  ${ALIAS}  (prod version from kql/prod/)"
  else
    jq --arg a "$ALIAS" '.[] | select(.functionAlias == $a)' "$SOURCE" > "${WORK}/${ALIAS}.src.json"
    echo "  ${ALIAS}"
  fi
  jq '{properties: ({category, displayName, query, functionAlias, version: 2}
        + (if .functionParameters then {functionParameters} else {} end))}' "${WORK}/${ALIAS}.src.json" > "${WORK}/${ALIAS}.json"
  jq -r '.name' "${WORK}/${ALIAS}.src.json" > "${WORK}/${ALIAS}.id"
  rm "${WORK}/${ALIAS}.src.json"
done < <(jq -r '.[].functionAlias' "$SOURCE" | sort)

if [[ "${1:-}" != "--yes" ]]; then
  # The bodies include GloCo_UserDimension (emails): do not leave copies lying around.
  rm -rf "$WORK"
  echo "Nothing copied. Re-run with --yes to copy."
  exit 0
fi

echo "→ ${AWS_REMOTE}"
REMOTE_DIR="/tmp/copy-to-prod-$$"
ssh -n "$AWS_REMOTE" "mkdir -p '${REMOTE_DIR}'"
scp -q "${WORK}"/*.json "${AWS_REMOTE}:${REMOTE_DIR}/"

BASE="/subscriptions/${PROD_SUBSCRIPTION}/resourceGroups/${PROD_RESOURCE_GROUP}/providers/Microsoft.OperationalInsights/workspaces/${PROD_WORKSPACE_NAME}/savedSearches"
FAILED=0
for IDFILE in "${WORK}"/*.id; do
  ALIAS=$(basename "$IDFILE" .id)
  SAVED_ID=$(cat "$IDFILE")
  if ssh -n "$AWS_REMOTE" "az rest --method PUT --uri 'https://management.azure.com${BASE}/${SAVED_ID}?api-version=2020-08-01' --headers Content-Type=application/json --body @'${REMOTE_DIR}/${ALIAS}.json' > /dev/null"; then
    echo "  ok    ${ALIAS}"
  else
    echo "  FAIL  ${ALIAS}"
    FAILED=$((FAILED + 1))
  fi
done

ssh -n "$AWS_REMOTE" "rm -rf '${REMOTE_DIR}'"
rm -rf "$WORK"

ANALYTICS_TARGET=prod "${SCRIPT_DIR}/functions-export.sh" < /dev/null | tail -1

if [[ "$FAILED" -gt 0 ]]; then
  echo "Done with ${FAILED} failure(s)" >&2
  exit 1
fi
echo "Done: copied to ${PROD_WORKSPACE_NAME}"
