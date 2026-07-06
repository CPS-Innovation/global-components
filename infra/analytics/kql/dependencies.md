# Analytics Function Dependencies

```
AppPageViews
  |
  v
GloCo_PageViews  (also joins GloCo_ExcludedUsers)
  |
  |---> GloCo_PageViews_CaseReview
  |       |
  |       |---> GloCo_CaseReview_TotalStartedSubmitted
  |       |---> GloCo_CaseReview_WithTriageTotalStartedSubmitted  (also joins AppEvents — triage-submission)
  |       |---> GloCo_CaseReview_InvolvementByUser                (also joins AppEvents — triage-submission)
  |       |---> GloCo_CaseReview_AreaCounts  (also joins GloCo__UserAreaMapping and GloCo__AreaRegionMapping; also unions AppEvents triage-submission)
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

Temporary (delete once signed off):

- `GloCo__CaseReview_AreaCounts_Comparison` — side-by-side "<started>/<submitted>" cells for the AreaCounts started→submitted shift. Sources both legs from `GloCo_PageViews_CaseReview` and `AppEvents` (triage-submission), same as `GloCo_CaseReview_AreaCounts`.
