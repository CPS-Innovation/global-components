#!/usr/bin/env bash
#
# entra-jobtitles-export.sh — bulk-extract every directory user's ObjectId + JobTitle from
# Microsoft Graph, to use as the authoritative JobTitle source when rebuilding GloCo_UserDimension.
#
# Why: our analytics only captured a job title from ~2026-07-06 and only on a genuine AD
# re-establishment, so ~1,300 users (mostly churned before that date) have no title in the data.
# Entra holds the current title for every live account, closing that gap.
#
# Auth/route: runs `az rest` against Graph THROUGH the bastion ($AWS_REMOTE), the same identity the
# other scripts here use for Log Analytics. It needs directory read of jobTitle (User.Read.All or a
# Directory.Read.All app role) — already confirmed working for this identity. If you later run it
# under a different login, re-check with:
#   az rest --method GET --url 'https://graph.microsoft.com/v1.0/users?$select=id,jobTitle&$top=1'
#
# Output (gitignored, PII — ObjectId↔title; do NOT commit):
#   output/entra_jobtitles.jsonl   one {"id","jobTitle"} per line, whole tenant
#
# This pulls the ENTIRE directory (id + jobTitle only). Filtering to our ~5,400 users happens later,
# in the dimension-merge step — server-side id filtering is limited, and a full scan is cheap.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/.env"
OUTDIR="${SCRIPT_DIR}/output"
OUTFILE="${OUTDIR}/entra_jobtitles.jsonl"

echo "→ paging Graph /users (id, jobTitle) via ${AWS_REMOTE} …"

# Page entirely on the bastion so the $skiptoken nextLink never has to survive an SSH round-trip.
ssh "$AWS_REMOTE" 'bash -s' <<'REMOTE'
set -euo pipefail
url='https://graph.microsoft.com/v1.0/users?$select=id,jobTitle&$top=999'
out=/tmp/entra_jobtitles.jsonl
: > "$out"
pages=0
while [ -n "$url" ]; do
  resp=$(az rest --method GET --url "$url") || { echo "ERROR: az rest failed on page $pages" >&2; exit 1; }
  printf '%s\n' "$resp" | jq -c '.value[] | {id, jobTitle}' >> "$out"
  url=$(printf '%s' "$resp" | jq -r '."@odata.nextLink" // empty')
  pages=$((pages + 1))
  if [ $((pages % 5)) -eq 0 ]; then echo "  … ${pages} pages, $(wc -l < "$out") users so far" >&2; fi
  if [ "$pages" -gt 500 ]; then echo "ERROR: exceeded 500 pages, aborting" >&2; exit 1; fi
done
echo "REMOTE_DONE pages=${pages} rows=$(wc -l < "$out")" >&2
REMOTE

scp -q "${AWS_REMOTE}:/tmp/entra_jobtitles.jsonl" "$OUTFILE"
ssh "$AWS_REMOTE" "rm -f /tmp/entra_jobtitles.jsonl"

TOTAL=$(wc -l < "$OUTFILE" | tr -d ' ')
WITH=$(jq -r 'select(.jobTitle != null and .jobTitle != "") | .id' "$OUTFILE" | wc -l | tr -d ' ')
BLANK=$((TOTAL - WITH))
echo "✓ ${OUTFILE}"
echo "  directory users: ${TOTAL} | with jobTitle: ${WITH} | blank: ${BLANK}"
