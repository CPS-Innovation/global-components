# Sourced after .env by the function scripts. ANALYTICS_TARGET picks the workspace they act on:
#   dev  (default)  the legacy shared workspace, la-global-nav-dev
#   prod            la-global-nav, from the PROD_* values in .env
# Each target keeps its own export file, so deploys look up saved-search ids in the right workspace.
# The dashboard and workbook JSON in the repo name the dev resource group and workspace; retarget (below)
# swaps them for the target's.
SOURCE_RESOURCE_GROUP="$RESOURCE_GROUP"
SOURCE_WORKSPACE_NAME="$WORKSPACE_NAME"
# The legacy shared workspace, which prod's primitives union in (__LEGACY_WORKSPACE_ID__ in ../kql/prod/).
LEGACY_WORKSPACE_ID="$WORKSPACE_ID"

case "${ANALYTICS_TARGET:-dev}" in
  dev)
    DEPLOYED_FILE="deployed-functions.json"
    ;;
  prod)
    SUBSCRIPTION="${PROD_SUBSCRIPTION:?Set PROD_SUBSCRIPTION in .env}"
    RESOURCE_GROUP="${PROD_RESOURCE_GROUP:?Set PROD_RESOURCE_GROUP in .env}"
    WORKSPACE_NAME="${PROD_WORKSPACE_NAME:?Set PROD_WORKSPACE_NAME in .env}"
    WORKSPACE_ID="${PROD_WORKSPACE_ID:?Set PROD_WORKSPACE_ID in .env}"
    DEPLOYED_FILE="deployed-functions.prod.json"
    DASHBOARD_ID="${PROD_DASHBOARD_ID:-}"
    WORKBOOK_ID="${PROD_WORKBOOK_ID:-}"
    ;;
  *)
    echo "Error: ANALYTICS_TARGET must be dev or prod, got '${ANALYTICS_TARGET}'" >&2
    exit 1
    ;;
esac
echo "→ target: ${ANALYTICS_TARGET:-dev} (${WORKSPACE_NAME})"

# Filter: repo dashboard/workbook JSON on stdin -> the same JSON pointed at the target's workspace.
retarget() {
  sed -e "s/__SUBSCRIPTION_ID__/${SUBSCRIPTION}/g" \
      -e "s/${SOURCE_RESOURCE_GROUP}/${RESOURCE_GROUP}/g" \
      -e "s/${SOURCE_WORKSPACE_NAME}/${WORKSPACE_NAME}/g"
}
