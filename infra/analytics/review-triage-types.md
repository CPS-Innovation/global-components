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
| Triage OD                  | **Green** | yes   | **dead 23 Jul 2026** | **Not Lawyer 99.8%** |  2,094 |      2.4% |
| Triage ODPCDReview         | **Red**   | yes   | **dead 23 Jul 2026** | **Not Lawyer 100%**  | 11,268 | **99.2%** |
| Triage DCP                 | neither   | yes   | **dead 23 Jul 2026** | Lawyer 97.6%         |    207 |      0.0% |

- Start / submit = whether we have a signal, not a count.
- "derived" — no EA-specific submit flag; inferred from an EA start plus a submit on the same case.
- Triage submit came from the request-observation shim, which has captured nothing since 23 Jul 2026. Triage counts above are **started**.
- `IsCPSD` (per-case mode flag, ODPCDReview submissions only) died with the same shim.
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
- Neither signal captures **mode**. CPS Direct staff working an area shift look identical. Only the dead `IsCPSD` flag ever recorded that.

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

## What we lost on 23 Jul 2026

We lost the whole `triage-submission` event, not just the boolean.

- That event was the **only** submission signal for triage, and it covered **all three types**. Last events: OD 23 Jul, ODPCDReview 23 Jul, DCP 23 Jul. They stopped together.
- So we lost (a) any way to tell a triage was _submitted_ rather than merely opened, for OD, ODPCDReview and DCP alike, and (b) the `IsCPSD` boolean, which only ever rode on ODPCDReview submissions.
- **What survives:** triage _started_, from the `TriageType` URL param on the page view. All three types, from launch on 9 Mar — earlier than the shim, which only shipped 1 Jun.
- **Reviews are unaffected.** Their submit signal is the `LandingPage` return carrying `IsSubmitted` / `SubmittedIsFirstReview` — page views, still flowing.
- Cost of using started as a proxy, measured over the overlap: ODPCDReview +1.3%, OD +7%, DCP +7%. Worse for CPSD specifically (~+29% on OD/DCP) — CPS Direct staff open triage pages they do not complete more often than area staff.
- Not backfillable. `IsCPSD` existed only in the POST body: not in any URL, not in Entra, not derivable from unit counts.

**How serious is losing `IsCPSD`? Not very — stakeholder view, 17 Sep 2026.**

- The flag is a legacy artefact. The originating system had no reliable way to identify CPSD staff, so it captured the answer directly at submission time. It is retained there in case it is useful.
- We now have two independent ways to identify CPSD people (Entra department, unit-count proxy), so we do not need the flag to answer "was this CPSD work".
- `IsCPSD` was only ever on the **red** type. The shim listened on all three actions (`ActionComplete(ODReviewTask|ODTask|DCPTask)`) but only `ODReviewTask` bodies carried it — OD and DCP submissions never had it. So it was never a green/red discriminator; colour comes from the type.
- What it uniquely told us: which individual red cases were done by an **area** person helping out rather than by CPSD. Measured while it lived: 18 cases against 3,459, 16 of them in Devon and Cornwall.
- **The more serious loss is the submission signal itself**, for all three types — that is what forces every all-time triage figure onto "started".
