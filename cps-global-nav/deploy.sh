#VERSION=$(jq -r '.version' package.json)
npm run build

az storage container create \
    --auth-mode login \
    --account-name $STORAGE_ACCOUNT_NAME \
    --name $ENVIRONMENT \
    --public-access container

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


