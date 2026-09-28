# Analytics Function Dependencies

Every function here feeds the workbook (`workbook/case-review-totals.json`, "MaCD global nav all-time
analytics") or the dashboard (`dashboard/dashboard.json`, "MaCD global nav - last 30 days") — marked
**[WB]** / **[DB]** on the function the page calls — or is a building block of one that does. The only
exception is `GloCo_Users_CpsdReviewTriage`, kept deliberately and due to join the foot of the workbook.
Functions that fed no page were removed on 28 Sep 2026; they are in git history. Keep it that way:
`functions-deploy.sh --prune` lists (and, on confirmation, deletes) deployed functions with no `.kql` here.

```
AppPageViews
  |
  v
GloCo_PageViews  (also joins GloCo_ExcludedUsers; lookups GloCo_UserDimension for retrospective area/dept/job-title backfill). Lawyer classification is NOT baked in — apply it on demand with the scalar GloCo_LawyerStatus(Auth_JobTitle).
  |
  |---> GloCo_PageViews_CaseReview  [WB "user count first seen and last seen by day"]  (classifies each Case Review / WMA page view on its own: the Is_* flags plus Kind, Order, TriageType, TaskId, IsStart, IsSubmit, IsEarlyAdvice)
  |       |
  |       '---> GloCo_CaseReview_Activity  (THE definition of a piece of case work — one row per review / triage / admin finalise / STT occurrence, credited to one person, with Status, Taint and SubmittedObserved. Also reads GloCo_TriageSubmissions (AppEvents, below). Every case-work report counts rows of this; none re-derives reviews or triage)
  |               |
  |               |---> GloCo_CaseReview_WithTriageTotalStartedSubmitted  [WB "Case review totals since launch", DB "Case review totals"]  (per type: Started / Submitted — "captured (adjusted)" cells / Users)
  |               |---> GloCo_CaseReview_InvolvementByUser  [WB "user submitted count by review type"]  (per user per type; triage twice — captured and "(adjusted)")
  |               |---> GloCo_CaseReview_AreaCounts  [WB "Case submissions by area by week"]  (cells "captured (adjusted)"; joins GloCo__AreaRegionMapping)
  |               |---> GloCo_CaseReview_TriageAreaCounts  [WB "Triage submissions by area by week"]  (triage-only sibling of AreaCounts; joins GloCo__AreaRegionMapping)
  |               |---> GloCo_CaseReview_Duration
  |               |       |
  |               |       '---> GloCo_CaseReview_Duration_Chart  [DB "Review duration distribution"]
  |               |---> GloCo_CaseReview_PerDay  [DB "Reviews by day"]
  |               |---> GloCo_Users_VisitsPerApp  [WB + DB "Top users by visit"]  (case-work columns from here — reviews incl admin finalise, triage twice; ALSO reads GloCo_PageViews for visits per app and joins GloCo_UserAreas. Resolver: an INLINE copy in a test harness can fail SEM0100 on GloCo_PageViews depending on surrounding text — test the deployed function by name)
  |               '---> GloCo_Users_CpsdReviewTriage  [none yet — due at the foot of WB]  (per-user, CPS Direct by EITHER signal: ReviewCount, TriageSubmitted, TriageSubmittedAdjusted from here; ALSO reads GloCo_PageViews for email, job title, Entra department and unit counts (the two CPSD signals); GloCo_LawyerStatus scalar. Launch-date floor, but set the LA time picker to cover it too)
  |
  |---> GloCo_App_UsersPerDay  [DB "Cumulative users by app"]
  |       |
  |       '---> GloCo_App_UsersPerDay_Chart  [DB, untitled chart tile]
  |
  |---> GloCo_Users_UsageDistribution  [DB "Percentile users vs percentage visits" — the tile pivots it inline]
  |
  |---> GloCo_PageViews_ActiveUsers_Chart  [DB "Active users (last 10 minutes)"]
  |
  '---> GloCo_UserAreas  (latest area per user; joined by GloCo_Users_VisitsPerApp)
```

```
AppEvents
  |
  |---> GloCo__Users_EdgePolicyCorrupt  [DB "Users with broken Edge policy"]  (also joins GloCo_PageViews above)
  |
  '---> GloCo_TriageSubmissions  (THE only reader of the "triage-submission" event (request-observation shim): one row per captured submission, prod only; reads GloCo_ExcludedUsers directly. Capture windows 2026-06-01 13:57Z → 2026-07-23 17:08Z and from 2026-09-28 07:37Z — see review-triage-types.md. Feeds GloCo_CaseReview_Activity above)
```

The dashboard's "AD auth errors" tile queries the `AppExceptions` table directly, through no function.

Standalone (no source table):

- `GloCo_ExcludedUsers` — datatable of `Auth_ObjectId`s filtered out at the `GloCo_PageViews` source. Also
  referenced directly by `GloCo_TriageSubmissions` (AppEvents bypasses `GloCo_PageViews`).
- `GloCo__AreaRegionMapping` — datatable of `(User_AreaId, User_Area, Region)`; joinable to any function exposing those columns. Source: `configuration/Row Labels.md`.
- `GloCo_LawyerStatus(jt:string)` — SCALAR classifier: returns `"Lawyer"`/`"NotLawyer"`/`"NoJobTitle"`/
  `"UnknownIfLawyer"` for a job title. Link ON DEMAND: `GloCo_PageViews | extend LawyerStatus =
  GloCo_LawyerStatus(Auth_JobTitle)`. Deliberately SCALAR (inline `dynamic()` lists, NOT a datatable): a
  **datatable** mapping cannot be joined to any `GloCo_PageViews`-based query — `GloCo_PageViews` already
  embeds the `GloCo_UserDimension` datatable, and a second saved datatable-function in the same query trips
  the embedded+direct resolver clash (`SEM0100`, fails to resolve `GloCo_UserDimension`). A title in neither
  list → `UnknownIfLawyer` (never-seen titles are flagged, not silently `NotLawyer`); blank → `NoJobTitle`.
  Committable. To reclassify, edit the two lists in `GloCo_LawyerStatus.kql` and redeploy (needs the `az rest`
  PUT path — parameterised, so functions-deploy.sh can't set `functionParameters`).
- `GloCo_UserDimension` — DEPLOYED-ONLY, NOT in repo (contains emails/ObjectIds; the generated `.kql`
  lives in gitignored `scripts/output/`). One-off all-history snapshot: `Auth_ObjectId → Email, UserArea,
  UserAreaOrCPSD, Department, Region, JobTitle`. Lawyer status is NOT stored here — classify on demand with
  `GloCo_LawyerStatus(Auth_JobTitle)`. `GloCo_PageViews` `lookup`s it to backfill blank pre-July
  area/dept/job-title. **Never reference it directly in a downstream function** — it's embedded in
  `GloCo_PageViews`; a direct reference elsewhere recreates the embedded+direct resolver clash.
  `JobTitle` is authoritative from **Entra** where available (else the latest title we captured), so
  churned/early users get a title too. `Department` is filled from Entra only where our own capture has
  none (default), so the CPSD cohort cannot shift under existing reports; `--overwrite-departments` lets
  Entra's current value win everywhere instead. Regenerate with the committed recipe — see `scripts/README.md`:
  (1) `scripts/entra-jobtitles-export.sh` (bulk `id`+`jobTitle`+`department` from Graph →
  `output/entra_jobtitles.jsonl`), (2) `scripts/rebuild-dimension.sh` (runs `scripts/dimension-generator.kql`,
  overlays Entra title and department, assembles + deploys via `az rest … --body @file`, bypassing
  functions-deploy.sh / ARG_MAX). The generator reads department and job title from RAW `AppPageViews`, not
  from `GloCo_PageViews`: reading them back through the backfill would feed Entra values in as if we had
  captured them, so a wrong value could never be reverted.
