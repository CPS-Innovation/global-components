#!/usr/bin/env bash
# Regenerates the MaCD regional analytics report — one copy-paste lump per region,
# each with a "last 30 days" and an "all time (since launch)" section.
#
#   ./regional-report.sh                    -> Reviews only (default)
#   ./regional-report.sh --triage           -> adds the Triage column
#   ./regional-report.sh --triage --admin   -> adds Triage and Admin finalise
#
# Triage capture has been dead since 2026-07-23, so --triage gives a zero column
# for any recent window. Writes output/regional-report.txt.
#
# Sources: GloCo_CaseReview_AreaByType(days) and GloCo_Users_TopByRegion(days),
# both deployed as saved functions in the workspace. See ../email-reproduction-checklist.md
# for the column definitions and their known ceilings.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTDIR="${SCRIPT_DIR}/output"
ALLTIME_DAYS=3650

run() { # run <kql> <destination>
  local out
  out=$("${SCRIPT_DIR}/run-query.sh" "$1" json | grep -oE '/.*/query_[a-f0-9]+\.txt' | tail -1)
  cp "$out" "${OUTDIR}/$2"
  echo "  $2: $(jq 'length' "${OUTDIR}/$2") rows"
}

echo "Querying..."
run "GloCo_CaseReview_AreaByType(30)"                rep_reviews_30.json
run "GloCo_CaseReview_AreaByType(${ALLTIME_DAYS})"   rep_reviews_all.json
run "GloCo_Users_TopByRegion(30)"                    rep_users_30.json
run "GloCo_Users_TopByRegion(${ALLTIME_DAYS})"       rep_users_all.json

python3 "${SCRIPT_DIR}/regional-report.py" "$@"
