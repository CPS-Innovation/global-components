#!/bin/bash

# Load env vars from secrets file
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/secrets.env"

az storage blob upload \
  --connection-string "$CONNECTION_STRING" \
  --file ../apps/auth-handover-shim/auth-handover-shim.html \
  --container-name "dev" \
  --name auth-handover-shim.html \
  --overwrite true
