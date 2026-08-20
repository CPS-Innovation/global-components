#!/usr/bin/env bash
#
# rebuild-dimension.sh — regenerate and deploy GloCo_UserDimension.
#
# GloCo_UserDimension is a per-user, all-history snapshot (Auth_ObjectId -> Email, area, department,
# region, job title) that GloCo_PageViews looks up to backfill blank pre-2026-07-06 rows. It is a
# DATATABLE embedded in GloCo_PageViews, too big for functions-deploy.sh, and contains PII — so it
# lives only in Log Analytics, never in git.
#
# Pipeline:
#   1. dimension-generator.kql runs in LA  -> analytics-derived latest values per user.
#   2. output/entra_jobtitles.jsonl (from entra-jobtitles-export.sh) OVERLAYS the job title:
#         JobTitle = Entra title if the directory has one, else the analytics-captured title.
#      Entra is authoritative and complete, so this recovers the ~1,300 users who churned before
#      job-title capture began and never had a title in our own telemetry.
#   3. Assemble the datatable .kql and PUT it to the saved search via `az rest` (@file bypasses ARG_MAX).
#
# Prerequisites: bastion SSH ($AWS_REMOTE) working; a current output/entra_jobtitles.jsonl.
# Usage: ./rebuild-dimension.sh          (refresh the Entra extract first for latest titles)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/.env"
OUTDIR="${SCRIPT_DIR}/output"
GEN="${SCRIPT_DIR}/dimension-generator.kql"
ENTRA="${OUTDIR}/entra_jobtitles.jsonl"
DIM="${OUTDIR}/GloCo_UserDimension.kql"
SID="9f856b14-cd8c-4441-a83e-1c1ea791146a_gloco_userdimension"

[ -f "$ENTRA" ] || { echo "✗ Missing ${ENTRA}"; echo "  Run ./entra-jobtitles-export.sh first (needs Entra/Graph access)."; exit 1; }

echo "→ 1/3 running dimension-generator.kql (analytics-derived rows) …"
GENOUT=$("${SCRIPT_DIR}/run-query.sh" "$(cat "$GEN")" tsv 2>&1 | grep -oE 'output/query_[a-f0-9]+\.txt' | head -1)
GENOUT="${SCRIPT_DIR}/${GENOUT}"
ROWS=$(grep -c '~^~' "$GENOUT" || true)
echo "   analytics rows: ${ROWS}"
[ "$ROWS" -gt 1000 ] || { echo "✗ generator returned only ${ROWS} rows — aborting (SSH/query problem?)"; exit 1; }

echo "→ 2/3 overlaying Entra job titles and assembling the datatable …"
python3 - "$GENOUT" "$ENTRA" "$DIM" <<'PY'
import json, sys
genout, entra_path, dim_path = sys.argv[1], sys.argv[2], sys.argv[3]

# Entra: ObjectId(lower) -> non-blank job title
entra = {}
with open(entra_path) as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        o = json.loads(line)
        jt = (o.get("jobTitle") or "").strip()
        if jt and o.get("id"):
            entra[o["id"].lower()] = jt

def esc(s):
    return s.replace("\\", "\\\\").replace('"', '\\"')

rows, n_entra, n_analytics, n_blank = [], 0, 0, 0
with open(genout) as f:
    for line in f:
        line = line.rstrip("\n")
        if "~^~" not in line:
            continue
        parts = line.split("~^~")
        if len(parts) != 7:
            continue
        objid, email, area, areaorcpsd, dept, region, analytics_title = parts
        # defensive: drop junk titles leaked from a past table-format parse (tab / table-name)
        if "\t" in analytics_title or "PrimaryResult" in analytics_title:
            analytics_title = ""
        entra_title = entra.get(objid.lower())
        if entra_title:
            title, n_entra = entra_title, n_entra + 1
        elif analytics_title:
            title, n_analytics = analytics_title, n_analytics + 1
        else:
            title, n_blank = "", n_blank + 1
        vals = [objid, email, area, areaorcpsd, dept, region, title]
        rows.append('    "' + '","'.join(esc(v) for v in vals) + '",')

if rows:
    rows[-1] = rows[-1].rstrip(",")

with open(dim_path, "w") as f:
    f.write(
        "// GloCo_UserDimension — one-hit snapshot: per-user latest-known area/department/region/job-title\n"
        "// across ALL history. Key = Auth_ObjectId. Job title is authoritative from Entra where available\n"
        "// (see rebuild-dimension.sh), else the latest title captured in our own telemetry.\n"
        "// GENERATED — do NOT hand-edit or commit (PII). Rebuild via scripts/rebuild-dimension.sh.\n"
        "datatable(Auth_ObjectId: string, Email: string, UserArea: string, UserAreaOrCPSD: string, "
        "Department: string, Region: string, JobTitle: string)\n[\n"
    )
    f.write("\n".join(rows))
    f.write("\n]\n")

total = len(rows)
print(f"   users: {total} | title from Entra: {n_entra} | title from telemetry only: {n_analytics} | no title anywhere: {n_blank}")
PY

echo "→ 3/3 deploying GloCo_UserDimension via az rest PUT …"
ARM="/subscriptions/${SUBSCRIPTION}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.OperationalInsights/workspaces/${WORKSPACE_NAME}/savedSearches/${SID}"
BODY="${OUTDIR}/_dim_body.json"
jq -n --arg q "$(cat "$DIM")" '{properties:{category:"GloCo", displayName:"GloCo_UserDimension", query:$q, functionAlias:"GloCo_UserDimension"}}' > "$BODY"
scp -q "$BODY" "${AWS_REMOTE}:/tmp/dim_body.json"
ssh "$AWS_REMOTE" "az rest --method PUT --uri 'https://management.azure.com${ARM}?api-version=2020-08-01' --headers Content-Type=application/json --body @/tmp/dim_body.json >/dev/null 2>&1 && echo '   ✓ deployed' || { echo '   ✗ deploy failed'; exit 1; }; rm -f /tmp/dim_body.json"
rm -f "$BODY"
echo "Done. GloCo_PageViews now backfills Auth_JobTitle from the refreshed dimension."
