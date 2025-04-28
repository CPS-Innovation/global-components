ENVIRONMENT=$1
VERSION=$(jq -r '.version' package.json)
STORAGE_ACCOUNT_NAME=sacpsglobalcomponents
CACHE_CONTROL="max-age=20, stale-while-revalidate=3600, stale-if-error=3600"

npm run build

for FILE in cps-global-components.js cps-global-components.js.map; do
    az storage blob upload \
        --overwrite true \
        --auth-mode login \
        --content-cache-control "$CACHE_CONTROL" \
        --account-name $STORAGE_ACCOUNT_NAME \
        --container-name $ENVIRONMENT \
        --name "$FILE" \
        --file "./dist/$FILE"
done


