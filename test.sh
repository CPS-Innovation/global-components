    # Read config values for the environment
    CONFIG_FILE="./configuration/config.dev.json"
    COOKIE_HANDOVER_URL=$(jq -r '.COOKIE_HANDOVER_URL' "$CONFIG_FILE")
    TOKEN_HANDOVER_URL=$(jq -r '.TOKEN_HANDOVER_URL' "$CONFIG_FILE")

    # Create the output directory
    mkdir -p ./prepared-auth-handover

    # Prepend the window variables to the auth-handover.js file
    echo "window.cps_global_components_cookie_handover_url = '$COOKIE_HANDOVER_URL';" > ./prepared-auth-handover/auth-handover.js
    echo "window.cps_global_components_token_handover_url = '$TOKEN_HANDOVER_URL';" >> ./prepared-auth-handover/auth-handover.js
    cat "./build-artifact/auth-handover.js" >> ./prepared-auth-handover/auth-handover.js

    # Copy the source map
    cp "./build-artifact/auth-handover.js.map" ./prepared-auth-handover/