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
#   2. output/entra_jobtitles.jsonl (from entra-jobtitles-export.sh) OVERLAYS job title AND department:
#         JobTitle   = Entra title      if the directory has one, else the analytics-captured title.
#         Department = see the two modes below.
#      Entra is authoritative and complete, so this recovers users who churned before capture began:
#      ~1,300 with no title, and ~1,300 with no department (capture only started 2026-07-06 — before
#      the department overlay, dimension coverage was JobTitle 99.8% vs Department 76.0%).
#      DEPARTMENT OVERLAY HAS TWO MODES, because Entra values are CURRENT, not point-in-time —
#      someone who has moved between CPS Direct and an area would be relabelled with today's
#      department across their whole history, and Auth_Department == "CPS DIRECT" is how we identify
#      CPSD users, so that silently moves the CPSD cohort and everything derived from it.
#        fill      (DEFAULT) only populate a BLANK department. Never contradicts what we actually
#                  observed; point-in-time capture wins where we have it. Pure gain, no cohort churn.
#        overwrite (--overwrite-departments) Entra wins wherever the directory has a value, i.e. the
#                  same precedence job title uses. Use when you want today's org structure throughout.
#      Either way step 2 reports how many users Entra DIFFERS from telemetry on, so one run tells you
#      the impact of the other mode without applying it.
#   3. Assemble the datatable .kql and PUT it to the saved search via `az rest` (@file bypasses ARG_MAX).
#
# Prerequisites: bastion SSH ($AWS_REMOTE) working; a current output/entra_jobtitles.jsonl.
# Usage: ./rebuild-dimension.sh                            (department: fill blanks only — default)
#        ./rebuild-dimension.sh --overwrite-departments    (department: Entra wins everywhere)
#        Refresh the Entra extract first for latest titles/departments.

set -euo pipefail

DEPT_MODE="fill"
for arg in "$@"; do
  case "$arg" in
    --overwrite-departments) DEPT_MODE="overwrite" ;;
    -h|--help) sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "✗ unknown argument: ${arg}"; echo "  Usage: $0 [--overwrite-departments]"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/.env"
OUTDIR="${SCRIPT_DIR}/output"
GEN="${SCRIPT_DIR}/dimension-generator.kql"
ENTRA="${OUTDIR}/entra_jobtitles.jsonl"
DIM="${OUTDIR}/GloCo_UserDimension.kql"
SID="9f856b14-cd8c-4441-a83e-1c1ea791146a_gloco_userdimension"

[ -f "$ENTRA" ] || { echo "✗ Missing ${ENTRA}"; echo "  Run ./entra-jobtitles-export.sh first (needs Entra/Graph access)."; exit 1; }
grep -q '"department"' "$ENTRA" || { echo "✗ ${ENTRA} has no department field — it predates the department overlay."; echo "  Re-run ./entra-jobtitles-export.sh to refresh it."; exit 1; }

echo "→ 1/3 running dimension-generator.kql (analytics-derived rows) …"
GENOUT=$("${SCRIPT_DIR}/run-query.sh" "$(cat "$GEN")" tsv 2>&1 | grep -oE 'output/query_[a-f0-9]+\.txt' | head -1)
GENOUT="${SCRIPT_DIR}/${GENOUT}"
ROWS=$(grep -c '~^~' "$GENOUT" || true)
echo "   analytics rows: ${ROWS}"
[ "$ROWS" -gt 1000 ] || { echo "✗ generator returned only ${ROWS} rows — aborting (SSH/query problem?)"; exit 1; }

echo "→ 2/3 overlaying Entra job titles + departments (department mode: ${DEPT_MODE}) …"
python3 - "$GENOUT" "$ENTRA" "$DIM" "$DEPT_MODE" <<'PY'
import json, sys
genout, entra_path, dim_path, dept_mode = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

# Entra: ObjectId(lower) -> non-blank job title / department
entra, entra_dept = {}, {}
with open(entra_path) as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        o = json.loads(line)
        oid = (o.get("id") or "").lower()
        if not oid:
            continue
        jt = (o.get("jobTitle") or "").strip()
        if jt:
            entra[oid] = jt
        dp = (o.get("department") or "").strip()
        if dp:
            entra_dept[oid] = dp

def esc(s):
    return s.replace("\\", "\\\\").replace('"', '\\"')

rows, n_entra, n_analytics, n_blank = [], 0, 0, 0
d_fill, d_changed, d_differs, d_kept, d_blank = 0, 0, 0, 0, 0
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
        # Department overlay. "fill" (default) only populates a BLANK department, so point-in-time
        # capture always wins where we have it; "overwrite" lets Entra win everywhere, as job title does.
        entra_d = entra_dept.get(objid.lower())
        if entra_d and not dept:
            dept, d_fill = entra_d, d_fill + 1
        elif entra_d and entra_d != dept:
            d_differs += 1
            if dept_mode == "overwrite":
                dept, d_changed = entra_d, d_changed + 1
            else:
                d_kept += 1
        elif dept:
            d_kept += 1
        else:
            d_blank += 1
        vals = [objid, email, area, areaorcpsd, dept, region, title]
        rows.append('    "' + '","'.join(esc(v) for v in vals) + '",')

if rows:
    rows[-1] = rows[-1].rstrip(",")

with open(dim_path, "w") as f:
    f.write(
        "// GloCo_UserDimension — one-hit snapshot: per-user latest-known area/department/region/job-title\n"
        "// across ALL history. Key = Auth_ObjectId. Job title AND department are authoritative from\n"
        "// Entra where available (see rebuild-dimension.sh), else the latest value captured in our own\n"
        "// telemetry. Entra values are CURRENT, not point-in-time.\n"
        "// GENERATED — do NOT hand-edit or commit (PII). Rebuild via scripts/rebuild-dimension.sh.\n"
        "datatable(Auth_ObjectId: string, Email: string, UserArea: string, UserAreaOrCPSD: string, "
        "Department: string, Region: string, JobTitle: string)\n[\n"
    )
    f.write("\n".join(rows))
    f.write("\n]\n")

total = len(rows)
print(f"   users: {total} | title from Entra: {n_entra} | title from telemetry only: {n_analytics} | no title anywhere: {n_blank}")
print(f"   department [{dept_mode}]: filled from Entra: {d_fill} | kept from telemetry: {d_kept} | overwritten: {d_changed} | still blank: {d_blank}")
if d_differs and dept_mode == "overwrite":
    print(f"   ^ {d_differs} users where Entra differs from our telemetry — OVERWRITTEN with Entra's current value.")
elif d_differs:
    print(f"   ^ {d_differs} users where Entra DIFFERS from our telemetry — left as captured (point-in-time wins).")
    print(f"     Re-run with --overwrite-departments to take Entra's current value for those users instead.")
PY

echo "→ 3/3 deploying GloCo_UserDimension via az rest PUT …"
ARM="/subscriptions/${SUBSCRIPTION}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.OperationalInsights/workspaces/${WORKSPACE_NAME}/savedSearches/${SID}"
BODY="${OUTDIR}/_dim_body.json"
jq -n --arg q "$(cat "$DIM")" '{properties:{category:"GloCo", displayName:"GloCo_UserDimension", query:$q, functionAlias:"GloCo_UserDimension"}}' > "$BODY"
scp -q "$BODY" "${AWS_REMOTE}:/tmp/dim_body.json"
ssh "$AWS_REMOTE" "az rest --method PUT --uri 'https://management.azure.com${ARM}?api-version=2020-08-01' --headers Content-Type=application/json --body @/tmp/dim_body.json >/dev/null 2>&1 && echo '   ✓ deployed' || { echo '   ✗ deploy failed'; exit 1; }; rm -f /tmp/dim_body.json"
rm -f "$BODY"
echo "Done. GloCo_PageViews now backfills Auth_JobTitle and Auth_Department from the refreshed dimension."
