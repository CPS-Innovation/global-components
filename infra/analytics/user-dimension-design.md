# GloCo_UserDimension — optimal (summary-rule) design

Goal: an authoritative per-user dimension (ObjectId → email, area, department, region) that
every report joins to at per-user level, WITHOUT re-scanning raw `GloCo_PageViews`/`AppPageViews`
on each query. Key on `Auth_ObjectId` (stable GUID; 100% co-present with email since launch).

## Why summary rules (not materialized views)

Log Analytics does **not** support `.create materialized-view` (ADX-only). Its native
"pre-aggregate on a schedule into a table" mechanism is **Summary Rules**
(`microsoft.operationalinsights/workspaces` summary rules API). A summary rule runs a KQL
aggregation every bin (20–1440 min) and APPENDS the result to a custom `*_CL` table.

Summary rules append per-bin; they don't "full-recompute a dimension". So the pattern is
two-layer:
1. **Summary rule** reduces the firehose to ~one row per active user per day (cheap, scheduled).
2. **Reader function** `GloCo_UserDimension` does the latest-non-blank arg_max over that small
   table (not over raw pageviews). Cheap because the snapshot table is ~5k rows/day, not millions.

## Layer 1 — custom table + summary rule

Destination custom table `GloCo_UserSnapshot_CL` (DCR-based custom table), schema:
`TimeGenerated:datetime, ObjectId:string, Email:string, UserArea:string, UserAreaOrCPSD:string, Department:string`

Summary rule source query (bin = 1440 min / daily):
```kql
GloCo_PageViews
| where isnotempty(Auth_ObjectId)
| summarize arg_max(TimeGenerated, Auth_Username, User_Area, User_AreaOrCPSD, Auth_Department) by Auth_ObjectId
| project TimeGenerated, ObjectId = Auth_ObjectId, Email = Auth_Username,
          UserArea = User_Area, UserAreaOrCPSD = User_AreaOrCPSD, Department = Auth_Department
```
Emits ~1 row per active user per day (the day's latest values — may be blank for a field that
day; the reader handles that across days).

## Layer 2 — reader function `GloCo_UserDimension`

Reads the snapshot table, takes latest NON-BLANK per field independently, joins region:
```kql
let Snap = GloCo_UserSnapshot_CL;
let Area = Snap | where isnotempty(UserAreaOrCPSD) | summarize arg_max(TimeGenerated, UserArea, UserAreaOrCPSD) by ObjectId;
let Dept = Snap | where isnotempty(Department)      | summarize arg_max(TimeGenerated, Department) by ObjectId;
let Mail = Snap | where isnotempty(Email)           | summarize arg_max(TimeGenerated, Email) by ObjectId;
Mail
| join kind=leftouter Area on ObjectId | project-away ObjectId1
| join kind=leftouter Dept on ObjectId | project-away ObjectId1
| join kind=leftouter (GloCo__AreaRegionMapping | distinct User_Area, Region) on $left.UserAreaOrCPSD == $right.User_Area
| project ObjectId, Email, UserArea, UserAreaOrCPSD, Department, Region = coalesce(Region, "")
```
Reports then: `... | summarize by Auth_ObjectId | join GloCo_UserDimension on $left.Auth_ObjectId == $right.ObjectId | summarize by Region/Area`.

## Setup steps (need workspace admin — beyond functions-deploy.sh)

1. Create custom table `GloCo_UserSnapshot_CL` (DCR-based) with the schema above
   (`az monitor log-analytics workspace table create` / ARM).
2. Create the summary rule (ARM/REST on the workspace summary-rules resource; verify exact API
   version against this workspace) pointing source→destination, binSize 1440.
3. Deploy `GloCo_UserDimension` reader function (normal functions-deploy).
4. **Seed history**: the rule only captures from when it starts, so inactive users won't appear.
   One-time seed by ingesting the current generator output (see
   `output/user_dimension_generator.kql`) into `GloCo_UserSnapshot_CL`, or accept that the
   dimension warms up over a few days for active users.

## Honest caveats / open checks

- Summary-rule exact API/permissions must be verified against THIS workspace (I can't create
  custom tables / summary rules from the function-deploy tooling; needs an admin with ARM rights).
- The dimension carries CURRENT attribution (a user who moved region shows all history under the
  new region) — fine for monthly ops emails, state it.
- PII: `GloCo_UserSnapshot_CL` holds emails+ObjectIds — it lives in LA (same as the raw data),
  never committed. Only the generator/reader KQL (logic, no data) is committed.
- Cheaper-but-manual alternative remains the datatable snapshot (`GloCo_UserDimension` as a
  generated `datatable(...)` literal refreshed by a script) — no custom table / DCR / admin, but
  a bulky literal and a manual/scheduled refresh.
