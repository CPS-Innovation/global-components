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
  |       |---> GloCo_CaseReview_PerDay
  |       |---> GloCo_CaseReview_Duration
  |               |
  |               '---> GloCo_CaseReview_Duration_Chart
  |
  |---> GloCo_App_UsersPerDay
  |       |
  |       '---> GloCo_App_UsersPerDay_Chart
  |
  |---> GloCo_Users_UsageDistribution
  |       |
  |       '---> GloCo_Users_UsageDistribution_Chart
  |
  |---> GloCo_Users_VisitsPerApp
  |
  '---> GloCo_PageViews_ActiveUsers_Chart
```
