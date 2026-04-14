#!/usr/bin/env bash
set -euo pipefail

# PATCH on microsoft.insights/workbooks nulls any property absent from the body
# (not true merge semantics). To avoid wiping displayName/version/tags/etc., we
# fetch the current workbook first and only override serializedData.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/.env"

INFILE="${1:?Usage: workbook-deploy.sh <notebook-json-file>}"

echo "→ Deploying ${INFILE} to ${AWS_REMOTE}"
echo "→ Workbook: ${WORKBOOK_ID}"

SERIALIZED=$(sed "s/__SUBSCRIPTION_ID__/${SUBSCRIPTION}/g" "$INFILE" | jq -c '.')

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
