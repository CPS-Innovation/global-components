#!/bin/bash

ENVIRONMENT=$1
VERSION=$(jq -r '.version' package.json)
STORAGE_ACCOUNT_NAME=sacpsglobalcomponents
CONTAINER_NAME=\$web
GLOBAL_SCRIPT_URL=https://$STORAGE_ACCOUNT_NAME.blob.core.windows.net/dev/cps-global-components.js npm run build

# If using azcopy with az AD account login, the AD account needs the "Storage Blob Data Contributor" role
export AZCOPY_AUTO_LOGIN_TYPE=AZCLI
azcopy sync ./out/ https://$STORAGE_ACCOUNT_NAME.blob.core.windows.net/\$web/static-app/  --recursive=true --delete-destination=true

# az storage blob delete-batch \
#     --auth-mode login \
#     --account-name $STORAGE_ACCOUNT_NAME \
#     --source $CONTAINER_NAME \
#     --pattern "$ENVIRONMENT/*"

# az storage blob upload-batch \
#     --auth-mode login \
#     --account-name $STORAGE_ACCOUNT_NAME \
#     --destination $CONTAINER_NAME \
#     --source ./out
