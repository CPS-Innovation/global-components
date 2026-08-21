# Analytics Function Dependencies

```
AppPageViews
  |
  v
GloCo_PageViews  (also joins GloCo_ExcludedUsers; lookups GloCo_UserDimension for retrospective area/dept/job-title backfill). Lawyer classification is NOT baked in — apply it on demand with the scalar GloCo_LawyerStatus(Auth_JobTitle).
  |
  |---> GloCo_PageViews_CaseReview
  |       |
  |       |---> GloCo_CaseReview_TotalStartedSubmitted
  |       |---> GloCo_CaseReview_WithTriageTotalStartedSubmitted  (also joins AppEvents — triage-submission)
  |       |---> GloCo_CaseReview_InvolvementByUser                (also joins AppEvents — triage-submission)
  |       |---> GloCo_CaseReview_AreaCounts  (also joins GloCo__UserAreaMapping and GloCo__AreaRegionMapping; also unions AppEvents triage-submission)
  |       |---> GloCo_CaseReview_AreaByType(SinceDays, EndDate)  (regional-email grid: per-area review/triage TYPE breakdown, Green excluded; joins GloCo__AreaRegionMapping + AppEvents triage-submission. PARAMETERISED — deploy via `az rest` PUT with functionParameters, not functions-deploy.sh)
  |       |
  |       '---> GloCo_CaseReview_PerCase
  |               |
  |               |---> GloCo_CaseReview_Duration
  |               |       |
  |               |       '---> GloCo_CaseReview_Duration_Chart
  |               |---> GloCo_CaseReview_PerDay
  |               '---> GloCo_CaseReview_Submissions
  |
  |---> GloCo_App_UsersPerDay
  |       |
  |       '---> GloCo_App_UsersPerDay_Chart
  |
  |---> GloCo_Users_UsageDistribution  (also joins GloCo_UserAreas)
  |       |
  |       '---> GloCo_Users_UsageDistribution_Chart
  |
  |---> GloCo_Users_VisitsPerApp  (also joins GloCo_UserAreas)
  |
  |---> GloCo_Users_TopByRegion(SinceDays)  (regional-email: top-10 users/region + national rank + N; joins GloCo__AreaRegionMapping. PARAMETERISED — deploy via `az rest` PUT with functionParameters, not functions-deploy.sh)
  |
  |---> GloCo_Users_VisitsAndReviews  (per-user: casework vs non-casework page visits + reviews submitted. NO time floor — scoped by the LA time picker)
  |---> GloCo_Users_EverActivityByLawyerStatus  (headcount of users who EVER did each activity — casework / non-casework visit, review submitted — split by GloCo_LawyerStatus of their latest job title. NO time floor — scoped by the LA time picker)
  |
  |---> GloCo_PageViews_ActiveUsers_Chart
  |
  |---> GloCo__NotAuthedRates
  |
  |---> GloCo__UserAreaMapping
  |
  |---> GloCo_UserAreas
  |
  '---> GloCo__UserAuthStatus  (also joins GloCo__NavigatorPermissionsEvents)
```

```
AppExceptions
  |
  v
GloCo_AppExceptions
  |
  '---> GloCo__Exceptions_Prod
```

```
AppEvents
  |
  |---> GloCo__NavigatorPermissionsEvents  (also feeds GloCo__UserAuthStatus above)
  |
  |---> GloCo__Users_EdgePolicyCorrupt  (also joins GloCo_PageViews above)
  |
  |---> GloCo_CaseReview_WithTriageTotalStartedSubmitted  (also reads GloCo_PageViews_CaseReview above)
  |
  '---> GloCo_CaseReview_InvolvementByUser  (also reads GloCo_PageViews_CaseReview above)
```

```
StorageBlobLogs
  |
  v
GloCo_BlobLogs
```

Standalone (no source table):

- `GloCo_ExcludedUsers` — datatable of `Auth_ObjectId`s filtered out at the `GloCo_PageViews` source.
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
  churned/early users get a title too. Regenerate with the committed recipe — see `scripts/README.md`:
  (1) `scripts/entra-jobtitles-export.sh` (bulk `id`+`jobTitle` from Graph → `output/entra_jobtitles.jsonl`),
  (2) `scripts/rebuild-dimension.sh` (runs `scripts/dimension-generator.kql`, overlays the Entra title,
  assembles + deploys via `az rest … --body @file`, bypassing functions-deploy.sh / ARG_MAX).

Temporary (delete once signed off):

- `GloCo__CaseReview_AreaCounts_Comparison` — side-by-side "<started>/<submitted>" cells for the AreaCounts started→submitted shift. Sources both legs from `GloCo_PageViews_CaseReview` and `AppEvents` (triage-submission), same as `GloCo_CaseReview_AreaCounts`.
