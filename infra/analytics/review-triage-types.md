# Review & triage types

All-time, prod, 6 Mar 2026 – 16 Sep 2026. Exact distinct cases.

| Type                       | Colour    | Start | Submit               | Lawyer / Not         |  Cases |    % CPSD |
| -------------------------- | --------- | ----- | -------------------- | -------------------- | -----: | --------: |
| First review               | —         | yes   | yes                  | Lawyer 100%          |  6,664 |     51.1% |
| Subsequent review          | —         | yes   | yes                  | Lawyer 96.6%         |  1,628 |     17.8% |
| Early advice first         | —         | yes   | derived              | Lawyer 99.4%         |    361 |      0.3% |
| Early advice subsequent    | —         | yes   | derived              | Lawyer 100%          |     39 |      0.0% |
| Admin finalise             | —         | n/a   | yes                  | **Not Lawyer 79.7%** |     74 |      1.4% |
| Streamlined threshold test | —         | yes   | no                   | Lawyer 100%          |     30 |     73.3% |
| Triage OD                  | **Green** | yes   | yes, **gap 23 Jul – 25 Sep 2026** | **Not Lawyer 99.8%** |  2,094 |      2.4% |
| Triage ODPCDReview         | **Red**   | yes   | yes, **gap 23 Jul – 25 Sep 2026** | **Not Lawyer 100%**  | 11,268 | **99.2%** |
| Triage DCP                 | neither   | yes   | yes, **gap 23 Jul – 25 Sep 2026** | Lawyer 97.6%         |    207 |      0.0% |

- Start / submit = whether we have a signal, not a count.
- "derived" — no EA-specific submit flag; inferred from an EA start plus a submit on the same case.
- Triage submit comes from the request-observation shim. It captured nothing from 23 Jul to 25 Sep 2026 and was restored by FCT2-22147 — see [the capture gap](#the-capture-gap-23-jul--25-sep-2026). The triage counts above (a snapshot to 16 Sep) are therefore **started**.
- `IsCPSD` (per-case mode flag, ODPCDReview submissions only) is missing for the same gap, and flows again from 25 Sep 2026.
- Triage DCP page views also stop 13 Aug 2026.
- A case worked by both a CPSD and a non-CPSD person counts in both, so % CPSD is "share of cases with at least one CPSD participant".
- Lawyer status via `GloCo_LawyerStatus(Auth_JobTitle)`; job titles are current from Entra, not point-in-time.

## How we define CPSD people

Two independent signals, both per user.

- **IsCPSDViaEntra** — `Auth_Department == "CPS DIRECT"`.
  - Source: Microsoft Graph `/me?$select=department` → `Auth.Me.Department`. Not a token claim.
  - Authoritative. Only captured from **5 Jul 2026**; earlier activity is classified by projecting the person's current department backwards.
  - Refreshed only on genuine AD re-establishment (~daily), not per access-token refresh.
- **IsCPSDViaUserData** — `User_AreaOrCPSD == "CPSD"`, i.e. `User_CountNotSensitiveUnits >= 120` and AreaId not in the SEOCID areas (`GloCo_PageViews.kql:72`).
  - A proxy for all-areas access. Overwrites the person's real area.
  - Evaluated per page view, so take "ever CPSD" across rows, not the latest row.
  - Ignore rows where `CountNotSensitiveUnits = 0` — unpopulated user object, not a permission level. Counting them makes 20 people appear to flip.
  - Only captured from **13 Apr 2026**.
- Agreement, among users with case-review or triage activity:
  - 101 are CPSD by both. None are Entra-CPSD without also being units-CPSD.
  - 46 are units-CPSD but not Entra-CPSD — mostly HQ / specialist functions needing all-areas access. Only 5 ever did any work, and they did OD/DCP triage and no ODPCDReview, i.e. area behaviour.
  - Where the two disagree, Entra is the one to trust.
- Neither signal captures **mode**. CPS Direct staff working an area shift look identical. Only the per-case `IsCPSD` flag records that — on ODPCDReview submissions only, and absent for 23 Jul – 25 Sep 2026.

## Red / green — resolved (stakeholder, 17 Sep 2026)

Business definitions, confirmed by the stakeholder. Colour is the triage **type**.

- **ODPCDReview = red.** CPSD work. CPSD only do red.
- **OD = green.** Area work. Area triages are green.
- Area staff **may occasionally do a red case** to help out. The exception, not the rule.
- **DCP is a different flavour** altogether, neither colour, and little traffic expected from here on.
- Our data agrees: ODPCDReview is 99.2% CPSD, OD is 97.6% area, and DCP page views stop on 13 Aug 2026 (207 cases, 6 users, ever).
- The mirror case — CPSD doing green — is 51 OD cases, 2.4%. Same order as area-doing-red.

Supersedes the August mapping of colour onto the `IsCPSD` flag, which was an overfit to two coincidental number matches in a regional email.

Residual loose end, low priority: the regional email's green figure (541 for South West to 1 Jul) does not reconcile with South West's own OD triage (~160 in that period). Most likely the email counts the region's **cases**, including CPS Direct work done on them, while we only see who **did** the work. We never capture the case's area, so we cannot reproduce that column.

Reporting rule unchanged: emit type names, not colours. The mapping above lets the reader apply them.

**Red/green reporting is not lost.** Both types come from the `TriageType` URL param, need no shim, and reach back to launch on 9 Mar — earlier than the shim ever did.

## The capture gap: 23 Jul – 25 Sep 2026

`triage-submission` events stopped in prod at **2026-07-23T17:08Z** and resumed with the prod release of **FCT2-22147 on 25 Sep 2026**. Nothing was captured in between, and that period cannot be backfilled.

**Cause.** OutSystems replaced the three per-type submit actions `ActionComplete{ODReviewTask,ODTask,DCPTask}` with a single action for every type, `…/CaseMilestone_CW/Triage/CheckDetails/ActionCompleteTriageTask`. The shim's URL match no longer fired, so it installed fine and silently captured nothing. Found from a cps-tst HAR, not a release on our side.

**What the gap means for reporting.**

- We lost the whole `triage-submission` event for the gap, not just the boolean — it is the **only** submission signal for triage, for all three types. So for 23 Jul – 25 Sep there is no way to tell a triage was _submitted_ rather than merely opened, and no `IsCPSD`.
- Any window that spans the gap shows Submitted well below Started. Rolling 30-day figures stay depressed until the release date is more than 30 days old; all-time Submitted is permanently short by the gap.
- **Use started across the gap.** Triage _started_ comes from the `TriageType` URL param on the page view — all three types, from launch on 9 Mar, unaffected by the gap. Cost of started as a proxy, measured over the 1 Jun – 23 Jul overlap: ODPCDReview +1.3%, OD +7%, DCP +7%, and ~+29% for CPSD specifically on OD/DCP (CPS Direct staff open triage pages they do not complete more often than area staff).
- **Reviews were never affected.** Their submit signal is the `LandingPage` return carrying `IsSubmitted` / `SubmittedIsFirstReview` — page views.
- No KQL changes were needed to resume: every consumer reads the same fields (`name`, `environment`, `CaseId`, `TriageType`, `IsCPSD`, `auth.username`) with the same values as before.

### Capture from 25 Sep 2026

- The shim matches `ActionCompleteTriageTask` (legacy per-type names kept in case prod lags).
- `IsCPSD` was renamed, not lost. The body now carries `SelectedCPSDirectDecision`, bound to the "Is CPSD" radio (`CaseMilestone_CW.Triage.CPSDirect`, shown on ODPCDReview only). The shim derives the old flag from it, so existing KQL is unchanged:

  | `SelectedCPSDirectDecision` | Meaning                    | Emitted `IsCPSD` |
  | --------------------------- | -------------------------- | ---------------- |
  | 0                           | control not shown (OD/DCP) | omitted          |
  | 1                           | Yes                        | `true`           |
  | 2                           | No                         | `false`          |

  The raw code is emitted too, so a new option would show up in the data rather than be misread.

- Verified end to end in QA (environment `test`) on 25 Sep 2026: OD, DCP, ODPCDReview Yes and ODPCDReview No all captured and mapped as above.
- The new request body also carries CMS credentials (`CmsAuthValues`, `Username`, `CMSUserId`). The shim reads named fields through a narrow schema only, and a unit test asserts none of those ever reach the event.
- DCP `TaskId`s are GUIDs, not integers — any future KQL doing `tolong(TaskId)` would silently null DCP rows.

**How serious was losing `IsCPSD`? Not very — stakeholder view, 17 Sep 2026.**

- The flag is a legacy artefact. The originating system had no reliable way to identify CPSD staff, so it captured the answer directly at submission time. It is retained there in case it is useful.
- We have two independent ways to identify CPSD people (Entra department, unit-count proxy), so we do not need the flag to answer "was this CPSD work".
- `IsCPSD` is only ever on the **red** type — OD and DCP never carried it. So it was never a green/red discriminator; colour comes from the type.
- What it uniquely tells us: which individual red cases were done by an **area** person helping out rather than by CPSD. Before the gap: 18 cases against 3,459, 16 of them in Devon and Cornwall.
- **The more serious loss was the submission signal itself**, for all three types — that is what forces triage figures spanning the gap onto "started".

# How to do triages in QA

OD triage

- Tasks: select _Check New PCD_ task type; _All owners_; Select a _unit_
- Go to the last page of results
- Click _More_ -> _Start task_
- Click _Complete triage_
- (Don't select _Transfer case_ unless you want to fill out more stuff)

OD PCD Review

- Tasks: select _Priority charging tab_
- Click _More_ -> _Start triage_
