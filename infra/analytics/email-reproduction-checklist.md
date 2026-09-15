# Regional email — reproduction checklist

Goal (reframed): produce a **document of region-by-region lumps** the stakeholder can copy-paste
into per-region emails. Each region's lump has THREE sub-sections, each in both windows:

```
## <Region>
### Last 30 days
  Reviews    — by area:  Area | Reviews   (+ region total)        [case-reviews-only]
  Triages    — Green | Red | Admin finalise   (ONE row, whole region — not per area)
  Top users  — top 10 most active by national rank   (bonus: "rank out of N users this window")
### All time
  Reviews / Triages / Top users   (same three)
```

Deliverable A: record the **means** (queries/functions) per output. Deliverable B: generate the
copy-paste document.

Column definitions (LOCKED — do not relitigate):
- **Reviews** = case-review submissions ONLY (`Is_Submitted_First_Review` or `Is_Submitted_Subsequent_Review`,
  which includes EA; NOT triage, NOT admin). Distinct cases, per area. These are SMALLER than the historic
  July email (SW to-1-Jul ~17 vs email 208) — because that email's "reviews" were triage-inflated. Ours are
  the TRUE case-review counts, correctly separated from triage. Nationally robust (~1,661 in last 30d);
  per-area they undercount + lose high-unit reviewers to CPSD/Unmapped (accepted, known).
- **Green** = ODPCDReview submitted IsCPSD=true; **Red** = IsCPSD=false; **Admin** = Is_Admin_Finalise
  distinct cases. Reported at REGION level only (triage is CPS-Direct-concentrated; per-area is ~empty).
- **Top users**: national rank by visits (all users); **N** = distinct authed users active in window.
- **Region/area key**: TRADITIONAL `User_AreaOrCPSD` → `GloCo__AreaRegionMapping`. Do NOT use
  `Auth_Department` for the area breakdown (user's decision). Department is reserved ONLY for making
  sense of CPSD users → which region they belong to (the SEOCID mapping work), not this grid.

Key insight that resolved the long confusion: `GloCo_CaseReview_AreaCounts` is named "CaseReview" but
counts distinct cases with a review OR triage submission — it's ~triage in disguise for triage-heavy
areas (Devon 329 ≈ 98% OD triage). Real case reviews are separate: Jack Dray = 40 email reviews, 10
captured, ZERO triage. So "reviews" = case-review submissions only; use the WithTriage grid's review
rows (First/Subsequent/EA) as the clean national source.

## MAJOR: `Auth.Me.Department` = Entra region field (live since 2026-07-06)

A real region signal we weren't using. `Properties.Auth.Me.Department` (extracted as `Auth_Department`
in GloCo_PageViews) carries the user's **CPS region straight from Entra** — values ARE region names:
`SOUTH WEST`, `NORTH WEST`, `CYMRU WALES`, `LONDON SOUTH`, `CPS DIRECT`, `WESSEX`, … (14 regions +
CPS Direct + specialist divisions like `SCD AND CTD`, `SEOCID …`, `CPS PROCEEDS OF CRIME`).

Why it matters:
- **Does NOT collapse on unit count** (unlike `User_AreaOrCPSD`, which forces any ≥120-unit user to
  "CPSD"). A high-unit South West lawyer reads `SOUTH WEST`, not CPSD.
- **Coverage 97%** of last-30d active authed users (4660/4818); **rescues 93%** of blank-area users
  (955/1032) — largely dissolves the "Unmapped" bucket.
- Available only from **2026-07-06**, so all-time use requires a username→Department backfill (works
  for the 97% of users seen since; users who left before 6 Jul have no Department).
- REGION-level only — the AREA split (Avon vs Devon within South West) still needs `User.Area`;
  blank-area users get region but no area (→ an "(area unknown)" row within their region).

**Adopt `Auth_Department` as the REGION key** for reviews + active-user grouping (cleaner + better
coverage than `User_AreaOrCPSD` → `GloCo__AreaRegionMapping`). Needs a Department→canonical-region
normalisation (UPPERCASE + `CPS DIRECT`→CPSD, `CYMRU WALES`→our spelling, etc.).

Does NOT rescue per-region triage: green/red stays **CPS DIRECT 3459 / South West 17 / else ~0** even
under clean Department attribution — because ODPCDReview triage is genuinely a CPS Direct activity, not
an attribution artefact. Triage per geographic region will be ~empty however we slice it.

## Review-count undercount — MECHANISM (investigated via Jack Dray / John Penny / Lucy Coleman)

Per-user (and per-area) review counts are NOT reproducible from our analytics — the backend is
authoritative. Two stacked capture gaps, proven:

| User | Email (to 1 Jul) | Our "submitted" | Distinct LandingPage cases | Any review-app case |
| --- | --- | --- | --- | --- |
| Jack Dray | 40 | 10 | 18 | 18 |
| John Penny | 39 | 15 | 21 | 21 |
| Lucy Coleman | 23 | 14 | 18 | 18 |

1. **Submission classification drops param-less LandingPages.** `Is_Submitted_*` requires the
   LandingPage URL to carry `IsSubmitted` / `SubmittedIsFirstReview` params. Jack's LandingPage: 18
   distinct cases, but only ~10 carry params (42 rows across 18 cases have ALL params blank). So we
   count 10, not 18 — roughly a 2× undercount even on data we DID capture. Counting "distinct
   LandingPage cases" instead would ~double our number (and lands Lucy in range: 18 vs 23), but would
   also count saved/abandoned reviews. Candidate fix worth its own investigation.
2. **Whole review sessions are never captured.** Our numbers are all-time-to-today; the email's are
   to-1-Jul, so ours should be LARGER — yet Jack is 18 vs 40, John 21 vs 39. The only explanation:
   reviews for which our global-components script never reported a page view (load failure, cached
   nav, unseen entry path). For heavy users like Jack that's >half their reviews invisible to us.

Consequence beyond the email: our surfaced **"Case reviews submitted"** metric (in
`GloCo_Users_VisitsPerApp`, item 3, and the item-1 area totals) is a **low-side proxy**, not a true
review count. Item 1's Devon near-match (107 vs 110) held mainly because TRIAGE inflated the total
and masked the review undercount; at pure per-user review granularity the gap is stark.

## Established facts / decisions

- **"Reviews" ≈ our "cases submitted" metric** (case-review submissions UNION triage, distinct
  CaseId per area) — Devon 107 (ours) vs 110 (email) confirms this. NOT case-reviews-only.
- **Area attribution is by *reviewer* area** (`User_AreaOrCPSD`), not case area. The email is
  likely *case-area* based (backend `CMSArea`), which we do NOT hold — so we get close, not exact.
- **Residual gap causes:** pre-shim triage (only from 2026-06-01) is invisible in the early
  window; high-unit reviewers collapse into `CPSD`; blank-area reviewers land in `Unmapped`.
- **National rank** = rank by total visits (`GloCo_Users_VisitsPerApp.Rank`).
- **Job title** (`Auth_JobTitle`) / department: deployed but EMPTY until AD re-establishment —
  cannot yet filter "reviews = lawyers" by job title.
- **Resolver gotcha:** don't combine `GloCo__UserAreaMapping` + `GloCo__AreaRegionMapping` in one
  query. Source area from `GloCo_PageViews_CaseReview` instead. See memory
  `reference_kql_saved_search_resolver`.

## Checklist

- [x] **1. Total reviews per unit & area** (all time, all regions, sorted by region + region totals)
    - DONE (query proven): `GloCo_CaseReview_AreaCounts | project Region, Area, Total` gives the
      up-to-today figure — all regions, sorted, with `{Region}, Total` rows. Verified South West =
      Avon 109 / Devon 329 / Gloucester 10 / Total 448.
    - Saved as `GloCo_CaseReview_AreaTotals.kql` (thin projection wrapper). **NOT YET DEPLOYED** —
      awaiting go-ahead. Until deployed, run the inline projection above.
    - Up-to-today is the target (the base function has no end bound — good). The 1-July run was only
      a one-off validation that our logic ≈ the email's (Devon 107 vs 110); not needed going forward.
    - Known ceiling: reviewer-area attribution → CPSD/Unmapped buckets; won't equal backend exactly.

- [x] **2. Last 30 days — most active users, with national rank** (all regions, sorted by region)
    - DONE (query proven). Windowed rebuild (saved fn is all-time only). Validated: David Harrison =
      national #1, Pam Hughes #2 (matches email); all named users present. Exact rank numbers differ
      from the email because the email's 30d ended ~1 Jul and ours ends today — same people, re-ranked.
    - Query (run inline; `ago(30d)`):
      ```
      let PV = materialize(GloCo_PageViews | where TimeGenerated > ago(30d) | where Auth_IsAuthed);
      let Visits = PV | where App != "Casework app"
          | summarize v = count_distinct(CorrelationId_ScriptLoad) by Auth_Username, App
          | summarize Total_Visits = sum(v) by Auth_Username;
      let UserArea = PV | where isnotempty(Auth_Username) and isnotempty(User_CountNotSensitiveUnits)
          | summarize arg_max(TimeGenerated, User_AreaOrCPSD) by Auth_Username
          | project Auth_Username, Area = User_AreaOrCPSD;
      Visits
      | join kind=leftouter UserArea on Auth_Username | project-away Auth_Username1
      | order by Total_Visits desc
      | extend National_Rank = row_number()
      | join kind=leftouter (GloCo__AreaRegionMapping | distinct User_Area, Region) on $left.Area == $right.User_Area
      | extend Region = coalesce(Region, "Unmapped")
      | project National_Rank, Region, Area, Auth_Username, Total_Visits
      | order by Region asc, National_Rank asc
      ```
    - Built on a single materialized GloCo_PageViews base (+ AreaRegionMapping once) to avoid the resolver bug.

- [x] **3. All time — most active users, with national rank AND number of reviews** (all regions, by region)
    - DONE (query proven). Reuses `GloCo_Users_VisitsPerApp` by name (has Rank, area, both submission
      counts) + region join. Validated: Pam Hughes #1; all named users present.
    - Query (run inline):
      ```
      GloCo_Users_VisitsPerApp
      | extend Reviews = ['Case reviews submitted'] + ['Triage submissions']
      | join kind=leftouter (GloCo__AreaRegionMapping | distinct User_Area, Region) on $left.User_AreaOrCPSD == $right.User_Area
      | extend Region = coalesce(Region, 'Unmapped')
      | project National_Rank = Rank, Region, Area = User_AreaOrCPSD, Auth_Username, Total_Visits, Reviews
      | order by Region asc, National_Rank asc
      ```
    - CEILING: per-user `Reviews` UNDER-counts the backend (Jack Dray 10 vs email 40) — same page-view
      capture gap as item 1. Rank is ours and sound; review count is not backend-accurate.

- [ ] **OPEN for items 2 & 3: the email lists a curated SUBSET per region** (~12 South West users,
      ranks scattered 1–210), not all ~100 active users. Rule unknown (not top-N, not review-filtered).
      Decision needed: emit all users per region and let the human truncate, or find/define the filter.

- [~] **4. Triage activity + admin finalise totals** (green / red / admin finalise (PFRI))
    - COLOUR MAPPING SOLVED (validated to 1 Jul, distinct cases):
      - **Green = ODPCDReview submitted, IsCPSD = true** — ours 538 vs email 541 (3-case boundary wobble)
      - **Red = ODPCDReview submitted, IsCPSD = false** — ours 9 = email 9 (exact)
      - **Admin finalise (PFRI) = `Is_Admin_Finalise` distinct cases** — ours 61 = email 61 (exact)
      - i.e. red/green IS the IsCPSD split of ODPCDReview — we've always had it. NOTE: the separate
        *admin dashboard* uses green/red for OD vs ODPCDReview — different convention, don't conflate.
        OD (246) and DCP (56) are NOT in this email.
    - TODO: build the query (national + per-area). Per-area is feasible via submitter `User_AreaOrCPSD`
      (usual reviewer-area caveat). Watch the resolver bug if joining `GloCo__AreaRegionMapping`.
    - "Unknown" ODPCDReview (in the WithTriage grid) = started (triage page view) but NO captured
      submission carrying IsCPSD (2282 of 5736 started, 40%). NOT a date/pre-capture artefact — only
      25 of 2282 pre-shim; 2257 started post-shim. It's started-but-not-submitted OR a submission we
      didn't capture (ties to the triage-capture-gap / 500s investigation). IsCPSD only exists on a
      captured submission.

## Out of scope / needs backend

- Exact reviews-per-area match (needs backend `CMSArea`).
- "Reviews = lawyers only" filter (needs populated `Auth_JobTitle`).
