#!/usr/bin/env bash
#
# entra-jobtitles-export.sh — bulk-extract every directory user's ObjectId + JobTitle + Department
# from Microsoft Graph, to use as the authoritative source for both when rebuilding
# GloCo_UserDimension. (Name kept for continuity; it pulls department too.)
#
# Why: our analytics only captured job title AND department from ~2026-07-06, and only on a genuine
# AD re-establishment. So ~1,300 users have no title in the data, and ~1,300 have no department
# (dimension coverage: JobTitle 99.8%, Department 76.0%). Entra holds current values for every live
# account, closing both gaps.
#
# CAVEAT: Entra values are CURRENT, not point-in-time. Someone who has moved between CPS Direct and
# an area is relabelled with today's department across their whole history. rebuild-dimension.sh
# reports how many departments this CHANGES rather than fills, so you can see the impact.
#
# Auth/route: runs `az rest` against Graph THROUGH the bastion ($AWS_REMOTE), the same identity the
# other scripts here use for Log Analytics. It needs directory read of jobTitle and department
# (User.Read.All or a Directory.Read.All app role) — jobTitle already confirmed for this identity;
# department is covered by the same permission. If you later run it under a different login,
# re-check with:
#   az rest --method GET --url 'https://graph.microsoft.com/v1.0/users?$select=id,jobTitle,department&$top=1'
#
# Output (gitignored, PII — ObjectId↔title/department; do NOT commit):
#   output/entra_jobtitles.jsonl   one {"id","jobTitle","department"} per line, whole tenant
#
# This pulls the ENTIRE directory (id + jobTitle + department). Filtering to our ~5,400 users happens later,
# in the dimension-merge step — server-side id filtering is limited, and a full scan is cheap.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/.env"
OUTDIR="${SCRIPT_DIR}/output"
OUTFILE="${OUTDIR}/entra_jobtitles.jsonl"

echo "→ paging Graph /users (id, jobTitle, department) via ${AWS_REMOTE} …"

# Page entirely on the bastion so the $skiptoken nextLink never has to survive an SSH round-trip.
ssh "$AWS_REMOTE" 'bash -s' <<'REMOTE'
set -euo pipefail
url='https://graph.microsoft.com/v1.0/users?$select=id,jobTitle,department&$top=999'
out=/tmp/entra_jobtitles.jsonl
: > "$out"
pages=0
while [ -n "$url" ]; do
  resp=$(az rest --method GET --url "$url") || { echo "ERROR: az rest failed on page $pages" >&2; exit 1; }
  printf '%s\n' "$resp" | jq -c '.value[] | {id, jobTitle, department}' >> "$out"
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
WITHDEPT=$(jq -r 'select(.department != null and .department != "") | .id' "$OUTFILE" | wc -l | tr -d ' ')
echo "✓ ${OUTFILE}"
echo "  directory users: ${TOTAL} | with jobTitle: ${WITH} (blank $((TOTAL - WITH))) | with department: ${WITHDEPT} (blank $((TOTAL - WITHDEPT)))"
