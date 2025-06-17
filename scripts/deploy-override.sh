#!/bin/bash

# Load env vars from secrets file
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/secrets.env"

az storage blob upload \
  --connection-string "$CONNECTION_STRING" \
  --file ../configuration/config.dev.override.json \
  --container-name "dev" \
  --name config.override.json \
  --overwrite true

blob_data_dev=$(<../configuration/config.dev.override.json)

az storage blob upload \
  --connection-string "$CONNECTION_STRING" \
  --data "cps_global_components_config_jsonp_callback($blob_data_dev);" \
  --container-name "dev" \
  --name config.override.js \
  --overwrite true

az storage blob upload \
  --connection-string "$CONNECTION_STRING" \
  --file ../configuration/config.test.override.json \
  --container-name "test" \
  --name config.override.json \
  --overwrite true

blob_data_test=$(<../configuration/config.test.override.json)

az storage blob upload \
  --connection-string "$CONNECTION_STRING" \
  --data "cps_global_components_config_jsonp_callback($blob_data_test);" \
  --container-name "test" \
  --name config.override.js \
  --overwrite true

az storage blob upload \
      --file ../apps/tactical-redirect/index.html \
      --container-name tactical-redirect \
      --name index.html \
      --overwrite true \
      --connection-string "$CONNECTION_STRING" 