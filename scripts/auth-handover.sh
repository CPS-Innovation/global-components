#!/bin/bash

# Load env vars from secrets file
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/secrets.env"

# Pass the password via env var into the remote ssh command securely
HTML=$(ssh "$REMOTE_USER@$REMOTE_HOST" bash -s <<EOF
curl -s -d "username=$USER_ENV_VAR_NAME&password=$PASSWORD_ENV_VAR_NAME" -X POST "$REMOTE_URL"
EOF
)
# Extract text between <code> and </code>
RAW_CODE=$(echo "$HTML" | xmllint --html --xpath '//code/text()' - 2>/dev/null)
CLEAN_CODE=$(echo "$RAW_CODE" | tr -d '\n\r' | sed -e 's/^[[:space:]]*//' \
                                                   -e 's/[[:space:]]*$//' \
                                                   -e 's/^"\(.*\)"$/\1/')

# That value is a `Set-Cookie` header, so we need to strip all of the path=... etc attributes
COOKIE_HEADER=$(awk -v RS=',' '
{
  # Re-assemble full cookie chunks if there are embedded commas
  block = (block ? block "," : "") $0

  # If we see a semicolon and "expires=", we wait for more (comma might be part of expires date)
  if (tolower(block) ~ /expires=[^;]+$/) {
    next
  }

  # Extract name=value before first ;
  match(block, /^[^=]+=[^;]+/)
  if (RSTART > 0) {
    cookies[++i] = substr(block, RSTART, RLENGTH)
  }

  block = ""
}
END {
  for (j = 1; j <= i; j++) {
    printf "%s%s", cookies[j], (j < i ? "; " : "\n")
  }
}
' <<< "$CLEAN_CODE")  

ENCODED_COOKIE_HEADER=$(jq -rn --arg v "$COOKIE_HEADER" '$v|@uri')
echo $LAUNCH_URL_ROOT$ENCODED_COOKIE_HEADER