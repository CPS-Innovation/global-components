# Analytics scripts

Helper scripts for the CPS global-components Log Analytics (LA) analytics: running queries,
deploying the `GloCo_*` saved functions/dashboards/workbooks, and rebuilding the one datatable that
isn't tracked in git — `GloCo_UserDimension`.

## Prerequisites

- **`.env`** (gitignored) in this folder, providing at least: `AWS_REMOTE` (the bastion SSH target
  that has an authenticated `az`), `SUBSCRIPTION`, `RESOURCE_GROUP`, `WORKSPACE_NAME`, `WORKSPACE_ID`.
- **Bastion SSH working** — every `az` call is run remotely over `ssh "$AWS_REMOTE"`; nothing needs a
  local Azure login.
- **`output/`** (gitignored) holds all generated artefacts, including PII ones. Nothing in `output/`
  is ever committed.

## Everyday use

```bash
./run-query.sh '<KQL>' [table|json|tsv]     # run an ad-hoc query, result saved to output/
./functions-export.sh                        # refresh output/deployed-functions.json (alias -> saved-search id)
./functions-deploy.sh ../kql/GloCo_Foo.kql   # deploy/update one saved function
```

## Rebuilding `GloCo_UserDimension`

`GloCo_UserDimension` is a per-user, all-history snapshot keyed on `Auth_ObjectId`:

```
Auth_ObjectId -> Email, UserArea, UserAreaOrCPSD, Department, Region, JobTitle
```

`GloCo_PageViews` `lookup`s it to **backfill** blank pre-2026-07-06 rows (job-title capture began
2026-07-06, only on a genuine AD re-establishment, so early/churned users have no title in our own
telemetry). It is a **datatable embedded in `GloCo_PageViews`**, is too big for `functions-deploy.sh`
(ARG_MAX), and contains PII — so it lives **only in Log Analytics, never in git**. Do not reference
it directly in a downstream function (embedded+direct saved-search resolver clash).

Regenerating is **two steps**:

### Step 1 — export authoritative job titles from Entra

```bash
./entra-jobtitles-export.sh        # -> output/entra_jobtitles.jsonl  ({id, jobTitle} per line)
```

Pages the whole tenant from Microsoft Graph (`/users?$select=id,jobTitle`) via the bastion. Needs
directory read of `jobTitle` (`User.Read.All` delegated, or a `Directory.Read.All` app role) on the
bastion identity. `id` is the same GUID as `Auth_ObjectId`, so it joins cleanly. Entra holds the
**current** title for every live account, which is what closes the ~1,300-user gap our telemetry
can't. (Skip this step to reuse the last extract — but then titles are as stale as that file.)

### Step 2 — rebuild + deploy the dimension

```bash
./rebuild-dimension.sh
```

1. Runs [`dimension-generator.kql`](dimension-generator.kql) in LA — the analytics-derived latest
   Email/area/department/region/job-title per user.
2. **Overlays** the Entra title: `JobTitle = Entra title if the directory has one, else the
   analytics-captured title`. (So the handful of accounts Entra has no title for keep whatever we saw.)
3. Assembles `output/GloCo_UserDimension.kql` and `PUT`s it to the saved search via
   `az rest … --body @file` (bypasses ARG_MAX).

It prints a coverage line, e.g. `users: 5401 | title from Entra: 5390 | title from telemetry only: 11
| no title anywhere: 0`. After it deploys, `GloCo_PageViews` immediately backfills from the refreshed
dimension.

**Refresh cadence:** it's a manual snapshot. Re-run both steps whenever you want current areas/titles
(e.g. before a reporting cycle). The build is idempotent.

## Lawyer classification (related)

Lawyer status is **not** stored in the dimension. Apply it on demand with the scalar function
[`../kql/GloCo_LawyerStatus.kql`](../kql/GloCo_LawyerStatus.kql):

```kql
GloCo_PageViews | extend LawyerStatus = GloCo_LawyerStatus(Auth_JobTitle)
```

It returns `Lawyer` / `NotLawyer` / `NoJobTitle` / `UnknownIfLawyer`. A title not in its two inline
lists returns **`UnknownIfLawyer`** — so a new title (which the Entra overlay will surface plenty of)
is flagged, not silently mis-filed. To reclassify, edit the two lists in `GloCo_LawyerStatus.kql` and
redeploy via the `az rest` PUT path (it's parameterised, so `functions-deploy.sh` can't set the
`jt:string` param — see the deploy snippet in that file's history / dependencies.md).

Find titles awaiting classification:

```kql
GloCo_PageViews
| where isnotempty(Auth_Username)
| summarize arg_max(TimeGenerated, Auth_JobTitle) by Auth_Username
| where GloCo_LawyerStatus(Auth_JobTitle) == "UnknownIfLawyer"
| summarize Users = dcount(Auth_Username) by Auth_JobTitle | order by Users desc
```

## PII

`output/entra_jobtitles.jsonl` (ObjectId↔title), `output/GloCo_UserDimension.kql` (ObjectId↔email),
and any per-user report CSVs contain PII. They stay in gitignored `output/`. Committable files here
(`*.sh`, `dimension-generator.kql`, this README) contain no PII.
