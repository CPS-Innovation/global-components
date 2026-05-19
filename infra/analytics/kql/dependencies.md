# Analytics Function Dependencies

```
AppPageViews
  |
  v
GloCo_PageViews
  |
  |---> GloCo_PageViews_CaseReview
  |       |
  |       |---> GloCo_CaseReview_TotalStartedSubmitted
  |       |---> GloCo_CaseReview_WithTriageTotalStartedSubmitted
  |       |---> GloCo_CaseReview_PerDay
  |       |---> GloCo_CaseReview_AreaCounts  (also joins GloCo__UserAreaMapping)
  |       |---> GloCo_CaseReview_Duration
  |               |
  |               '---> GloCo_CaseReview_Duration_Chart
  |
  |---> GloCo_App_UsersPerDay
  |       |
  |       '---> GloCo_App_UsersPerDay_Chart
  |
  |---> GloCo_Users_UsageDistribution  (also joins GloCo_UserAreas)
  |       |
  |       '---> GloCo_Users_UsageDistribution_Chart
  |
  |---> GloCo_Users_VisitsPerApp
  |
  |---> GloCo_PageViews_ActiveUsers_Chart
  |
  |---> GloCo__NotAuthedRates
  |
  |---> GloCo__UserAreaMapping
  |
  |---> GloCo_UserAreas
  |
  '---> GloCo__UserAuthStatus  (also joins GloCo__IframeProbeEvents)
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
  |---> GloCo__IframeProbeEvents  (also feeds GloCo__UserAuthStatus above)
  |
  '---> GloCo__Users_EdgePolicyCorrupt  (also joins GloCo_PageViews above)
```

```
StorageBlobLogs
  |
  v
GloCo_BlobLogs
```
