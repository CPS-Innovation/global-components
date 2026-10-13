#!/usr/bin/env bash
set -euo pipefail

# PATCH on microsoft.insights/workbooks nulls any property absent from the body
# (not true merge semantics). To avoid wiping displayName/version/tags/etc., we
# fetch the current workbook first and only override serializedData.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/.env"
source "${SCRIPT_DIR}/target.sh"

INFILE="${1:?Usage: workbook-deploy.sh <notebook-json-file>}"

echo "→ Deploying ${INFILE} to ${AWS_REMOTE}"
echo "→ Workbook: ${WORKBOOK_ID}"

: "${WORKBOOK_ID:?No workbook id for this target (PROD_WORKBOOK_ID in .env)}"

SERIALIZED=$(retarget < "$INFILE" | jq -c '.')

# First deploy to a target: there is nothing to PATCH, so create it with a full PUT.
if ! ssh -n "$AWS_REMOTE" "az rest --method GET --uri 'https://management.azure.com${WORKBOOK_ID}?api-version=${WORKBOOK_API_VERSION}' > /dev/null 2>&1"; then
  echo "→ Workbook does not exist yet: creating"
  WORKSPACE_ARM="/subscriptions/${SUBSCRIPTION}/resourcegroups/${RESOURCE_GROUP}/providers/microsoft.operationalinsights/workspaces/${WORKSPACE_NAME}"
  jq -n --arg s "$SERIALIZED" --arg title "${WORKBOOK_DISPLAY_NAME:-MaCD global nav all-time analytics}" --arg source "$WORKSPACE_ARM" --arg location "${WORKBOOK_LOCATION:-uksouth}" '{
    kind: "shared",
    location: $location,
    tags: {"hidden-title": $title},
    properties: {displayName: $title, category: "workbook", sourceId: $source, version: "Notebook/1.0", serializedData: $s}
  }' | ssh "$AWS_REMOTE" "az rest --method PUT --headers Content-Type=application/json --uri 'https://management.azure.com${WORKBOOK_ID}?api-version=${WORKBOOK_API_VERSION}' --body @- --query '{name:name, displayName:properties.displayName}' -o json"
  echo "Done"
  exit 0
fi

ssh "$AWS_REMOTE" "
  set -euo pipefail
  CURRENT=\$(az rest --method GET --uri 'https://management.azure.com${WORKBOOK_ID}?api-version=${WORKBOOK_API_VERSION}&canFetchContent=true')
  BODY=\$(echo \"\$CURRENT\" | jq --arg s $(printf '%q' "$SERIALIZED") '{
    kind: .kind,
    tags: .tags,
    properties: {
      displayName: .properties.displayName,
      category: .properties.category,
      version: .properties.version,
      sourceId: .properties.sourceId,
      serializedData: \$s
    }
  }')
  echo \"\$BODY\" | az rest --method PATCH --headers Content-Type=application/json --uri 'https://management.azure.com${WORKBOOK_ID}?api-version=${WORKBOOK_API_VERSION}' --body @-
"

echo "Done"
