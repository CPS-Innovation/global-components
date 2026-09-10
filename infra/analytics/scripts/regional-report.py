"""Formats the four rep_*.json exports into output/regional-report.txt.

Reviews-only by default. Triage and admin-finalise columns are opt-in:

    python3 regional-report.py                    # Reviews
    python3 regional-report.py --triage           # Reviews, Triage
    python3 regional-report.py --triage --admin   # Reviews, Triage, Admin finalise

CPSD and Unmapped are included, sorted to the end after the real regions. Neither
is truly a region — CPS Direct sits across all of them as an assisting
organisation, and Unmapped is an attribution failure bucket — so pass
--exclude-non-regions to drop both for a stakeholder-facing document. The
document and national totals are printed to stdout either way.

Note: triage capture has been dead since 2026-07-23, so --triage yields a zero
column for any recent window. See ../email-reproduction-checklist.md.

Invoked by regional-report.sh; run standalone to re-format without re-querying.
"""

import json
import os
import sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")

REVIEW_KEYS = ["First review", "Subsequent review", "EA first review", "EA subsequent review"]
TRIAGE_KEYS = ["Triage OD", "Triage red", "Triage DCP"]

WITH_TRIAGE = "--triage" in sys.argv
WITH_ADMIN = "--admin" in sys.argv
EXCLUDE_NON_REGIONS = "--exclude-non-regions" in sys.argv

# Not regions. CPSD works across all of them; Unmapped is failed attribution.
NON_REGIONS = ("CPSD", "Unmapped")

AREA_W = 32
# (heading, width, value function) — one per column we are emitting.
COLUMNS = [("Reviews", 9, lambda r: sum(num(r, k) for k in REVIEW_KEYS))]
if WITH_TRIAGE:
    COLUMNS.append(("Triage", 9, lambda r: sum(num(r, k) for k in TRIAGE_KEYS)))
if WITH_ADMIN:
    COLUMNS.append(("Admin finalise", 16, lambda r: num(r, "Admin finalise")))

ROW_FMT = "  {:<%d}" % AREA_W + "".join("{:>%d}" % w for _, w, _ in COLUMNS)
RULE_W = AREA_W + sum(w for _, w, _ in COLUMNS)


def header():
    lines = [
        "MaCD REGIONAL ANALYTICS",
        "Reviews = distinct case reviews submitted (first/subsequent, incl. Early Advice).",
    ]
    if WITH_TRIAGE:
        lines.append("Triage = OD, ODPCDReview (red) and DCP triage submissions")
    if WITH_ADMIN:
        lines.append("Admin finalise = PFRI finalisations.")
    lines += ["", "Top users are ranked nationally by number of visits."]
    if EXCLUDE_NON_REGIONS:
        lines.append("CPS Direct is not shown as a region, so the regional figures below do not")
        lines.append("sum to the national total.")
    lines.append("")
    return lines


def load(p):
    return json.load(open(os.path.join(OUT, p)))


def name(email):
    return " ".join(w.capitalize() for w in email.split("@")[0].split("."))


def num(row, key):
    v = row.get(key)
    return int(v) if v not in (None, "") else 0


def reviews_block(rows, region):
    rs = [r for r in rows if r.get("Region") == region]
    areas = sorted([r for r in rs if not str(r.get("Area", "")).endswith(", Total")],
                   key=lambda r: r.get("Area", ""))
    totals = [r for r in rs if str(r.get("Area", "")).endswith(", Total")]
    ordered = areas + totals
    if not ordered:
        return "  (none in this window)\n"
    lines = [ROW_FMT.format("Area", *[h for h, _, _ in COLUMNS]), "  " + "-" * RULE_W]
    for r in ordered:
        lines.append(ROW_FMT.format(r.get("Area", "")[:AREA_W], *[f(r) for _, _, f in COLUMNS]))
    return "\n".join(lines) + "\n"


def users_block(rows, region):
    rs = sorted([r for r in rows if r.get("Region") == region],
                key=lambda r: int(r.get("National_Rank", 0)))
    if not rs:
        return "  (none in this window)\n"
    n = "{:,}".format(int(rs[0].get("Users_In_Window", 0)))
    lines = ["  Top {} of {} active users nationally:".format(len(rs), n),
             "    {:<7}{:<14}{}".format("Rank", "Percentile", "Name"),
             "    " + "-" * 44]
    for r in rs:
        lines.append("    {:<7}{:<14}{}".format(
            r.get("National_Rank"), r.get("Percentile", ""), name(r.get("Auth_Username", ""))))
    return "\n".join(lines) + "\n"


rev30, revAll = load("rep_reviews_30.json"), load("rep_reviews_all.json")
usr30, usrAll = load("rep_users_30.json"), load("rep_users_all.json")

regions = sorted(set(r.get("Region") for r in revAll if r.get("Region")))
tail = [x for x in NON_REGIONS if x in regions]
regions = [x for x in regions if x not in tail]
if not EXCLUDE_NON_REGIONS:
    regions += tail

out = header()
for reg in regions:
    out.append("=" * 70)
    out.append("REGION: " + reg)
    out.append("=" * 70)
    out.append("")
    out.append("Last 30 days")
    out.append("")
    out.append("Reviews by area:")
    out.append(reviews_block(rev30, reg))
    out.append("Most active users:")
    out.append(users_block(usr30, reg))
    out.append("All time (since launch, 9 March):")
    out.append("")
    out.append("Reviews by area:")
    out.append(reviews_block(revAll, reg))
    out.append("Most active users:")
    out.append(users_block(usrAll, reg))
    out.append("")

path = os.path.join(OUT, "regional-report.txt")
open(path, "w").write("\n".join(out))
print("written: {} ({} regions, columns: {})".format(
    path, len(regions), ", ".join(h for h, _, _ in COLUMNS)))


def reviews_total(rows, wanted=None):
    """Sums the Reviews column over the per-region total rows, optionally filtered."""
    return sum(sum(num(r, k) for k in REVIEW_KEYS)
               for r in rows
               if str(r.get("Area", "")).endswith(", Total")
               and (wanted is None or r.get("Region") in wanted))


# Show what is in the document against the national total, so the gap created by
# omitting the non-regions is visible rather than silent.
shown_regions = set(regions)
for label, rows in (("Last 30 days", rev30), ("All time", revAll)):
    print("  {}: {} reviews in document, {} national".format(
        label, reviews_total(rows, shown_regions), reviews_total(rows)))
    for nr in NON_REGIONS:
        if nr not in shown_regions:
            print("      omitted {:<10} {}".format(nr, reviews_total(rows, {nr})))
