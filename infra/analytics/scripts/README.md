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

### Step 1 — export authoritative job titles + departments from Entra

```bash
./entra-jobtitles-export.sh        # -> output/entra_jobtitles.jsonl  ({id, jobTitle, department} per line)
```

Pages the whole tenant from Microsoft Graph (`/users?$select=id,jobTitle,department`) via the bastion.
Needs directory read of `jobTitle` and `department` (`User.Read.All` delegated, or a
`Directory.Read.All` app role) on the bastion identity. `id` is the same GUID as `Auth_ObjectId`, so it
joins cleanly. Entra holds the **current** values for every live account, which is what closes the gaps
our telemetry can't: ~1,300 users with no job title, and ~1,300 with no department (before the
department overlay, dimension coverage was JobTitle 99.8% vs Department 76.0%). (Skip this step to
reuse the last extract — but then values are as stale as that file. An extract taken before the
department overlay has no `department` field; `rebuild-dimension.sh` detects that and refuses to run.)

⚠️ Entra values are **current, not point-in-time**. Anyone who has moved between CPS Direct and an
area is relabelled with today's department across their whole history — which matters because
`Auth_Department == "CPS DIRECT"` is how we identify CPSD users. Step 2 reports how many departments
the overlay **changes** as opposed to fills, so the impact is visible before you accept it.

### Step 2 — rebuild + deploy the dimension

```bash
./rebuild-dimension.sh                          # department: fill blanks only (default)
./rebuild-dimension.sh --overwrite-departments  # department: Entra wins everywhere
```

1. Runs [`dimension-generator.kql`](dimension-generator.kql) in LA — the analytics-derived latest
   Email/area/department/region/job-title per user.
2. **Overlays** the Entra values. `JobTitle = Entra title if the directory has one, else the
   analytics-captured title`. **Department has two modes**, because unlike a job title it decides who
   counts as a CPSD user:
   - **`fill`** (default) — only populate a **blank** department. Point-in-time capture wins wherever
     we have it, so the CPSD cohort cannot shift underneath existing reports. Pure gain.
   - **`--overwrite-departments`** — Entra wins everywhere, same precedence as job title. Use when you
     want today's org structure applied throughout history.

   Either mode reports how many users Entra **differs** from telemetry on, so one run tells you the
   impact of the other mode without applying it. (Accounts Entra has nothing for keep whatever we saw.)
3. Assembles `output/GloCo_UserDimension.kql` and `PUT`s it to the saved search via
   `az rest … --body @file` (bypasses ARG_MAX).

It prints two coverage lines, e.g. `users: 5401 | title from Entra: 5390 | title from telemetry only:
11 | no title anywhere: 0` and `department [fill]: filled from Entra: 1297 | kept from telemetry: 4104 |
overwritten: 0 | still blank: 0`, followed by a count of users where Entra **differs** from telemetry.
A non-zero differ count means those people have moved department since we captured them — decide
whether you want point-in-time (default) or current (`--overwrite-departments`). After it deploys,
`GloCo_PageViews` immediately backfills `Auth_JobTitle` and `Auth_Department` from the refreshed
dimension.

Note `Region` in the dimension is derived from `UserAreaOrCPSD` (the unit-count area), **not** from
`Department`, so the two can legitimately disagree for a user — that is the same two-signal split
documented in [`../review-triage-types.md`](../review-triage-types.md), not a bug.

#### Why the generator reads raw `AppPageViews` for department and job title

`GloCo_PageViews` backfills `Auth_Department` and `Auth_JobTitle` from `GloCo_UserDimension` — the
table this pipeline rebuilds. Reading those columns back through it would create a **ratchet**: an
Entra-sourced value lands on a user's blank rows, and the next rebuild reads it as though our own
telemetry had captured it. The Entra overlay then has nothing to disagree with, so a value can never
be reverted and a mistake is re-baked permanently.

That is not hypothetical — on 2026-09-17 two users whose most recent page view had a blank department
kept an Entra department that a `fill`-mode rebuild was supposed to revert. So
[`dimension-generator.kql`](dimension-generator.kql) takes **Department and JobTitle from raw
`AppPageViews`**, and only Email/Area/AreaOrCPSD from `GloCo_PageViews` (those have no external
overlay, so re-reading them is idempotent, and `AreaOrCPSD` needs the CPSD/SEOCID logic). Scope is
unchanged because the ObjectId set still comes from `GloCo_PageViews`, so `GloCo_ExcludedUsers` and
the environment/URL filters still apply.

**Expect the reported numbers to change once, downwards, and that is the fix working.** Telemetry
coverage in the generator is ~79.6% for department and job title; before the fix it read ~99.9%,
because it was counting our own backfill as captured data. The Entra overlay still takes the deployed
dimension to ~100%.

**Refresh cadence:** it's a manual snapshot. Re-run both steps whenever you want current areas/titles/departments
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
