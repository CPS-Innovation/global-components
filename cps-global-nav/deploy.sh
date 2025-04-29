#VERSION=$(jq -r '.version' package.json)
npm run build

az storage container create \
    --auth-mode login \
    --account-name $STORAGE_ACCOUNT_NAME \
    --name $ENVIRONMENT \
    --public-access container

FILES=($(find dist -type f -path "$FILE_PATTERN"))

for FILE in "${FILES[@]}"; do
    DESTINATION_FILE=$(echo $FILE | sed "s|^dist/||") 
    az storage blob upload \
        --overwrite true \
        --auth-mode login \
        --content-cache-control "$CACHE_CONTROL" \
        --account-name $STORAGE_ACCOUNT_NAME \
        --container-name $ENVIRONMENT \
        --name "$DESTINATION_FILE" \
        --file "$FILE"
done
