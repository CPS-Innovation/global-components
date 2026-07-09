#!/usr/bin/env bash
#
# teams-msg.sh — send a Teams chat message via Microsoft Graph, with all
# HTTPS traffic routed through the SSH bastion ($AWS_REMOTE). Tokens are
# cached locally (only curl runs on the bastion).
#
# Auth: OAuth2 device code flow (one-time interactive sign-in) + silent
# refresh-token rotation. Tokens cached in $CPS_TEAMS_TOKEN_FILE.
#
# Reads from ${SCRIPT_DIR}/.env:
#   AWS_REMOTE            — bastion host (e.g. user@10.x.x.x)
#   CPS_TENANT_ID         — Entra tenant GUID
#   CPS_CLIENT_ID         — App registration client (application) ID
#   CPS_TEAMS_CHAT_ID     — Target chat ID (e.g. 19:...@unq.gbl.spaces)
#   CPS_TEAMS_TOKEN_FILE  — Where to cache tokens (default ~/.teams-tokens)
#
# Usage:
#   teams-msg.sh login                    # one-time device code sign-in
#   teams-msg.sh send "your message"      # send a message
#   teams-msg.sh send-html "<b>hi</b>"    # send HTML-formatted message
#   teams-msg.sh status                   # show token status
#   teams-msg.sh logout                   # delete cached tokens

set -euo pipefail

# ---- config & deps -----------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/.env"

: "${AWS_REMOTE:?AWS_REMOTE not set in ${SCRIPT_DIR}/.env}"
: "${CPS_TENANT_ID:?CPS_TENANT_ID not set in ${SCRIPT_DIR}/.env}"
: "${CPS_CLIENT_ID:?CPS_CLIENT_ID not set in ${SCRIPT_DIR}/.env}"
: "${CPS_TEAMS_CHAT_ID:?CPS_TEAMS_CHAT_ID not set in ${SCRIPT_DIR}/.env}"
TOKEN_FILE="${CPS_TEAMS_TOKEN_FILE:-$HOME/.teams-tokens}"

SCOPES="ChatMessage.Send offline_access"
AUTHORITY="https://login.microsoftonline.com/${CPS_TENANT_ID}"
GRAPH="https://graph.microsoft.com/v1.0"

command -v jq >/dev/null || { echo "jq required locally (brew install jq)" >&2; exit 1; }

# ---- token cache helpers (LOCAL) ---------------------------------------------

save_tokens() {
  local resp="$1"
  local access refresh expires_in expires_at
  access=$(echo "$resp"     | jq -r '.access_token // empty')
  refresh=$(echo "$resp"    | jq -r '.refresh_token // empty')
  expires_in=$(echo "$resp" | jq -r '.expires_in   // empty')

  if [[ -z "$access" || -z "$refresh" || -z "$expires_in" ]]; then
    echo "ERROR: token response missing fields" >&2
    echo "$resp" | jq . >&2 || echo "$resp" >&2
    return 1
  fi

  expires_at=$(( $(date +%s) + expires_in - 60 ))

  umask 077
  cat > "$TOKEN_FILE" <<EOF
ACCESS_TOKEN=$access
REFRESH_TOKEN=$refresh
EXPIRES_AT=$expires_at
EOF
  chmod 600 "$TOKEN_FILE"
}

load_tokens() {
  if [[ ! -f "$TOKEN_FILE" ]]; then
    echo "No tokens cached. Run: teams-msg.sh login" >&2
    return 1
  fi
  # shellcheck source=/dev/null
  source "$TOKEN_FILE"
}

# ---- auth flows (curl via bastion) -------------------------------------------

device_code_login() {
  echo "Starting device code flow (via $AWS_REMOTE)..."
  local init
  init=$(ssh "$AWS_REMOTE" \
    "curl -sS -X POST '${AUTHORITY}/oauth2/v2.0/devicecode' \
       -d 'client_id=${CPS_CLIENT_ID}' \
       --data-urlencode 'scope=${SCOPES}'")

  local device_code user_code verification_uri interval message
  device_code=$(echo "$init"      | jq -r '.device_code      // empty')
  user_code=$(echo "$init"        | jq -r '.user_code        // empty')
  verification_uri=$(echo "$init" | jq -r '.verification_uri // empty')
  interval=$(echo "$init"         | jq -r '.interval         // 5')
  message=$(echo "$init"          | jq -r '.message          // empty')

  if [[ -z "$device_code" ]]; then
    echo "ERROR: device code flow failed to start:" >&2
    echo "$init" | jq . >&2
    return 1
  fi

  echo
  echo "  $message"
  echo
  echo "  Open:  $verification_uri"
  echo "  Code:  $user_code"
  echo
  echo "Waiting for sign-in (Ctrl-C to abort)..."

  while true; do
    sleep "$interval"
    local poll
    poll=$(ssh "$AWS_REMOTE" \
      "curl -sS -X POST '${AUTHORITY}/oauth2/v2.0/token' \
         -d 'grant_type=urn:ietf:params:oauth:grant-type:device_code' \
         -d 'client_id=${CPS_CLIENT_ID}' \
         -d 'device_code=${device_code}'")

    local err
    err=$(echo "$poll" | jq -r '.error // empty')

    if [[ -z "$err" ]]; then
      save_tokens "$poll"
      echo "✅ Signed in. Tokens cached at $TOKEN_FILE"
      return 0
    fi

    case "$err" in
      authorization_pending) ;;
      slow_down) interval=$((interval + 5)) ;;
      expired_token|authorization_declined|bad_verification_code)
        echo "ERROR: $err — $(echo "$poll" | jq -r .error_description)" >&2
        return 1
        ;;
      *)
        echo "ERROR: $err — $(echo "$poll" | jq -r .error_description)" >&2
        return 1
        ;;
    esac
  done
}

refresh_access_token() {
  load_tokens || return 1
  echo "Refreshing access token..." >&2
  local resp
  resp=$(ssh "$AWS_REMOTE" \
    "curl -sS -X POST '${AUTHORITY}/oauth2/v2.0/token' \
       -d 'grant_type=refresh_token' \
       -d 'client_id=${CPS_CLIENT_ID}' \
       -d 'refresh_token=${REFRESH_TOKEN}' \
       --data-urlencode 'scope=${SCOPES}'")

  if echo "$resp" | jq -e '.error' >/dev/null; then
    echo "ERROR: refresh failed — $(echo "$resp" | jq -r .error_description)" >&2
    echo "Run: teams-msg.sh login" >&2
    return 1
  fi

  save_tokens "$resp"
  load_tokens
}

ensure_valid_token() {
  load_tokens || return 1
  if [[ "$(date +%s)" -ge "${EXPIRES_AT:-0}" ]]; then
    refresh_access_token || return 1
  fi
}

# ---- send (curl via bastion, payload streamed via stdin) ---------------------

send_message() {
  local content="$1"
  local content_type="${2:-text}"

  ensure_valid_token

  local payload
  payload=$(jq -n --arg c "$content" --arg t "$content_type" \
    '{body: {contentType: $t, content: $c}}')

  local result http_status body
  result=$(echo "$payload" | ssh "$AWS_REMOTE" \
    "curl -sS -w '\\n%{http_code}' -X POST \
       '${GRAPH}/chats/${CPS_TEAMS_CHAT_ID}/messages' \
       -H 'Authorization: Bearer ${ACCESS_TOKEN}' \
       -H 'Content-Type: application/json' \
       --data @-")

  http_status=$(echo "$result" | tail -n1)
  body=$(echo "$result" | sed '$d')

  if [[ "$http_status" == "201" ]]; then
    local msg_id
    msg_id=$(echo "$body" | jq -r .id)
    echo "✅ Sent (message id: $msg_id)"
  else
    echo "❌ HTTP $http_status" >&2
    echo "$body" | jq . >&2 || echo "$body" >&2
    return 1
  fi
}

# ---- status / logout ---------------------------------------------------------

show_status() {
  if [[ ! -f "$TOKEN_FILE" ]]; then
    echo "Not signed in. Run: teams-msg.sh login"
    return 0
  fi
  load_tokens
  local now=$(date +%s)
  local remaining=$(( EXPIRES_AT - now ))
  echo "Token file:    $TOKEN_FILE"
  echo "Bastion:       $AWS_REMOTE"
  echo "Tenant:        $CPS_TENANT_ID"
  echo "Client:        $CPS_CLIENT_ID"
  echo "Chat:          $CPS_TEAMS_CHAT_ID"
  if (( remaining > 0 )); then
    echo "Access token:  valid for $((remaining / 60))m $((remaining % 60))s"
  else
    echo "Access token:  expired $((-remaining))s ago (will auto-refresh on next send)"
  fi
  local upn
  upn=$(echo "$ACCESS_TOKEN" | cut -d. -f2 \
        | { tr -- '-_' '+/'; echo; } \
        | { base64 -D 2>/dev/null || base64 -d 2>/dev/null; } \
        | jq -r '.upn // .unique_name // empty' 2>/dev/null || true)
  [[ -n "$upn" ]] && echo "Identity:      $upn"
}

logout() {
  if [[ -f "$TOKEN_FILE" ]]; then
    rm -f "$TOKEN_FILE"
    echo "Tokens deleted. (Note: this only clears the local cache — the refresh"
    echo "token remains valid in Entra until you revoke the session at"
    echo "https://mysignins.microsoft.com)"
  else
    echo "No tokens to remove."
  fi
}

# ---- dispatch ----------------------------------------------------------------

case "${1:-}" in
  login)     device_code_login ;;
  send)      shift; send_message "${1:?usage: teams-msg.sh send \"message\"}" "text" ;;
  send-html) shift; send_message "${1:?usage: teams-msg.sh send-html \"<b>html</b>\"}" "html" ;;
  status)    show_status ;;
  logout)    logout ;;
  refresh)   refresh_access_token ;;
  *)
    cat <<EOF
teams-msg.sh — send Teams messages via SSH bastion (\$AWS_REMOTE)

Usage:
  teams-msg.sh login                    Sign in (device code flow, one-time)
  teams-msg.sh send "message"           Send a plain-text message
  teams-msg.sh send-html "<b>hi</b>"    Send an HTML-formatted message
  teams-msg.sh status                   Show auth status
  teams-msg.sh refresh                  Force token refresh
  teams-msg.sh logout                   Delete local token cache

Reads from ${SCRIPT_DIR}/.env:
  AWS_REMOTE, CPS_TENANT_ID, CPS_CLIENT_ID, CPS_TEAMS_CHAT_ID
EOF
    exit 1
    ;;
esac
