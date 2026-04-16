# Silent Flow Auth Failure Investigation

**Status:** Active. Build 18 deployed 2026-04-15 06:41 UTC.
**Last updated:** 2026-04-15.

**Why this document exists:** The investigation surface area is broad enough that
we've repeatedly forgotten load-bearing facts from earlier threads. This is the
shared source of truth — scan the top sections for current state, drill into
the detailed sections when something needs refreshing.

---

## TL;DR — Three hypotheses and where we stand

We see two populations of failure:

- **Chronic users** (≥10 distinct accounts, multi-day / multi-session 0% auth rate)
- **Transient failures** (one-off timeouts, often recovering within 30s)

The three hypotheses about root cause:

| #   | Hypothesis                                                                                                                                                             | Shorthand                      | Verdict so far                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| H1  | Polaris's multi-hop redirect chain abandons our silent flows mid-iframe; repeated abandonments can lead to AAD rate-limit bans                                         | **Redirect abandonment → ban** | **Partly.** Orphan-producing is real (60% polaris orphan rate). **Ban is ruled out:** 32/32 AAD sign-ins for the affected users were `Success` — no throttle codes anywhere.                     |
| H2  | Shared-tenant browser state (localStorage, cookies, session data) gets mutated by another app's AAD activity between our flow's start and finish, corrupting our flow  | **Cross-app interference**     | **Largely falsified at the storage layer** (2026-04-15). Polaris uses sessionStorage, we use localStorage — no localStorage sharing. MSAL 2.39 has zero direct `window.localStorage` writes. See Finding 8. Residual surface: shared AAD cookies on `login.microsoftonline.com`. |
| H3  | Per-user / per-machine client-side block (extension, service worker, enterprise policy, CSP) prevents the iframe's successful response from reaching the parent window | **Machine × origin block**     | **Strongest candidate for the chronic cohort.** Best direct evidence: MruR (carrie.winter) completes on OutSystems and fails on Polaris with the _same browser, same account, same AAD success_. |

**Current best synthesis (updated 2026-04-15 after MSAL source archaeology):**

> _**H3 (per-user / per-machine × origin client-side block) is the leading
> candidate for the chronic cohort.** The crown-jewel evidence stands: MruR
> (carrie.winter) completes silent flows on OutSystems and never on Polaris,
> same browser, same account, same AAD successes. The failure is in the
> iframe-response-to-parent delivery path and is parent-origin keyed._
>
> _**H2 (cross-app storage interference) is largely falsified** at the storage
> layer. Polaris uses sessionStorage by default; we use localStorage. MSAL
> 2.39's source (verified) has no `window.localStorage` references — it
> strictly honours its configured storage. So our localStorage cannot be
> corrupted by Polaris. The H2-refined "migration drift" story I proposed
> earlier assumed shared localStorage, which doesn't exist. Kept in the doc
> below as a learning trail; marked falsified._
>
> _Residual H2-adjacent surface that's still live: shared AAD cookies on
> `login.microsoftonline.com` (cross-app by browser design); our temp cache
> (PKCE verifiers, nonces) defaults to sessionStorage and therefore lives in
> the same sessionStorage as Polaris's full MSAL state — but collision on
> random UUID key fragments is astronomically unlikely._
>
> _H1 (redirect abandonment) still explains the background orphan rate but
> does **not** escalate to bans and does **not** drive the chronic pattern._

---

## Hypotheses in detail

### H1 — Redirect abandonment (→ potentially ban)

**What it says:** Polaris performs up to 4 redirects per case load:

1. Polaris → AD for its own auth flow
2. AD → polaris's registered redirect URI (which is part of the app)
3. MSAL's internal redirect from the AD landing page back to the original URL
4. If the URL has a case ID / URN, an API data call; on failure it redirects again

Each hop can abandon our silent flow mid-iframe. Enough abandonments in a window
could historically trigger AAD rate-limit bans, which manifest as `monitor_window_timeout`
because the iframe sits on an AAD error page rather than redirecting back with a
token hash our code can read.

**Evidence FOR:**

- Build 18 overall orphan rate: polaris 60% vs outsystems 43%.
- Non-chronic users' orphan→next-flow gap clusters on **10s**, matching the
  MSAL iframe timeout — classic "abandon, retry after timeout" pattern.

**Evidence AGAINST:**

- **No AAD throttle codes in 32 sign-ins** across carrie, alex, darcie, debbie,
  alisonm, gurvinder (2026-04-14 / 04-15). If ban were driving failures, we'd
  see AADSTS5005x / 900432 / Smart Lockout entries. We don't.
- **78% of polaris orphans have a matching AppPageView by OperationId** — the
  page stayed, meaning the iframe wasn't torn down by navigation. H1's
  pure-abandonment story needs the page to leave; in most cases it didn't.
- **Zero users showed a clean 5–7 min ban-then-recovery signature.**
  Recoveries when observed were 17–28 seconds (too fast for a ban).

**Verdict:** H1 is **real for the background orphan rate** but the ban escalation
step does not happen in practice. The `monitor_window_timeout` completions are
**not** caused by bans.

### H2 — Cross-app / shared-storage interference

**What it says:** Other tenant apps in the same browser (polaris's own MSAL
instance, OutSystems, Office365, etc.) mutate shared browser storage (localStorage,
cookies, sessionStorage) between our silent flow's start and its completion.
MSAL cache state or session cookies could be rotated, rendering the response
unconsumable by our code even though AAD issued a valid token.

**Evidence FOR:**

- The big gap we need to explain: **AAD issued tokens, we never got them.** On
  2026-04-14 carrie.winter had 15 AAD successes (latencies 105–205ms) that all
  corresponded to our-side failures. Same on 04-15 across alex, debbie,
  alisonm. Something discards the response after AAD issues it. Shared-storage
  corruption is a candidate.
- **MSAL 4.30 does NOT support a `namePrefix` option** (I initially thought we
  had one — we don't; our `namePrefix: "cps_global_components"` is on App
  Insights, not MSAL). The MSAL key prefix is hardcoded `"msal"` in
  `@azure/msal-browser/src/cache/CacheKeys.ts`. Polaris on MSAL 2.39 uses the
  same prefix. In the polaris page context, our localStorage is Polaris's
  localStorage — full collision surface on shared keys.
- Several MSAL keys are **not client-ID qualified** and therefore shared
  between our MSAL 4.x and Polaris's MSAL 2.x in the same origin:
  `msal.version`, `msal.interaction.status`, `msal.browser.platform.auth.dom`,
  `msal.browser.log.level`, `msal.browser.log.pii`, `msal.browser.performance.enabled`.
- `msal.2.account.keys` is schema-qualified (v2) and so is distinct from MSAL
  2.x's `msal.account.keys` (v0) — but our `migrateExistingCache` reads the v0
  list on every init. See **H2-refined** below.

**Evidence AGAINST:**

- No direct positive signal. We infer it from "what else could explain 78%
  page-lived orphans?"
- If it were generalised cross-app interference, the cohort would be broader.
  It isn't — it's ~10 specific people.

**Verdict:** **Plausible and strengthened by code archaeology** (see H2-refined below). Still needs a localStorage dump from a chronic user to move to confirmed.

### H2-refined — MSAL cross-version cache migration drift ⚠️ FALSIFIED 2026-04-15

> **Status: FALSIFIED.** This hypothesis was proposed after reading MSAL 4.30
> source and observing that `migrateExistingCache` reads v0-schema entries
> written by older MSAL versions. The assumption was that Polaris (on MSAL
> 2.39) wrote entries to our shared localStorage which we then migrated into
> malformed v2 state.
>
> **Why it's wrong:** Polaris's MSAL config (verified — see below) uses the
> default `cacheLocation` which is **sessionStorage**, not localStorage. MSAL
> 2.39's source has **zero direct `window.localStorage` references** — all
> access goes through the configured `browserStorage`. So Polaris's MSAL
> never writes to localStorage, and our `migrateExistingCache` has nothing
> cross-app to migrate. See Finding 8.
>
> **Kept in this document** as a learning trail: this hypothesis looked
> strong given the source patterns, but was falsified by checking the actual
> storage configuration of the host app. Future-us: always check the other
> app's runtime config, not just the code paths that could be activated.

The falsified claim below is preserved for reference.

Added 2026-04-15 after reading the MSAL 4.30 source.

**The mechanism in detail:**

1. We run **MSAL 4.30.0** with `cacheLocation: "localStorage"` and no
   `namePrefix` (MSAL 4 doesn't expose one).
2. Polaris runs **MSAL 2.39.0** in the same browsing context on the same
   origin (`polaris.cps.gov.uk`). Same `window.localStorage` object.
3. Our `PublicClientApplication.initialize()` calls
   `BrowserCacheManager.migrateExistingCache` every time. That function
   (see `@azure/msal-browser/src/cache/BrowserCacheManager.ts:154`) loops
   through schema versions `0..ACCOUNT_SCHEMA_VERSION` and reads entries
   written by older MSAL versions — i.e. **it reads keys that Polaris's MSAL
   2.x has written**.
4. It migrates those entries into our v2 cache structure under `msal.2.*`.
5. If the 2.x entry shape diverges from what 4.x's migration expects (e.g.
   different `homeAccountId` format, missing `tenantProfiles`, different
   `idTokenClaims` shape), the migrated result can be malformed but still
   "valid enough" to be returned by `getAllAccounts()`.
6. Downstream of the iframe's `#code=` redirect, `silentTokenHelper` does a
   /token POST using a PKCE verifier pulled from localStorage. If shared keys
   have been trampled between /authorize and /token — or if the cached
   account state used for response reconciliation is malformed — the
   response is silently discarded.
7. **localStorage is persistent**: once in a bad migrated-state, it survives
   tab close, browser restart, and re-login. This matches the chronic-user
   signature exactly (carrie: 14-day / 45-session / 5-build streak).

**Why this fits the evidence:**

- **AAD logs Success every time** (32/32 across chronic users). The
  /authorize request is well-formed (we fixed sid→UPN in Build 16); AAD
  happily mints a token. But the **response** hitting our MSAL can't be
  reconciled against our mutated cache.
- **Polaris-only failure for MruR.** On OutSystems origin
  (`cps.outsystemsenterprise.com`), our localStorage is a different storage
  namespace. No Polaris-2.x entries to migrate. Clean state. Silent flow
  completes (observed 2026-04-15 08:54:49 OpId `88df99a9...`).
- **Same-browser-same-account distinction.** Carrie on OutSystems works
  because the localStorage origin is different. Switch to polaris and she
  fails — because the polaris-origin localStorage has cross-version debris.
- **`migrateExistingCache` runs on every init.** Any attempted "cure" by
  closing the tab re-enters the same migration and re-produces the same
  malformed entry. Hence 45 sessions of failure.

**What would falsify this:**

- A chronic user's `localStorage` on `polaris.cps.gov.uk` having **no** v0
  MSAL entries. If only clean v2 entries exist, migration drift isn't the
  mechanism.
- A chronic user succeeding after a full `localStorage.clear()` on
  `polaris.cps.gov.uk` — positive confirmation.

**What we should look for in a localStorage dump from a chronic user:**

- `msal.account.keys` (v0, written by Polaris 2.x) — present alongside
  `msal.2.account.keys` (v2, written by us)
- Entries with `homeAccountId` whose format differs between the v0 and v2
  versions of the same account
- Tokens whose schema fields (`secret`, `clientInfo`, `realm`, etc.) are
  missing or formatted differently from fresh 4.x entries
- `msal.version` set to a value that mismatches what 4.30 expects (triggers
  further migration behavior)
- Orphaned credentials belonging to clientIds other than ours (`8d6133af-...`)
  and Polaris's clientId

### H3 — Per-user / per-machine × origin

**What it says:** Some browsers have persistent state — extensions, service
workers, CSP settings, content-security policies applied by a corporate agent —
that prevents the iframe's response from being read by our parent window.
Because AAD issues the token, but the iframe's `location.hash` read (or
postMessage delivery) is silently blocked before reaching MSAL's monitor loop.

**Evidence FOR:**

- **Strongest single result in the entire investigation:** carrie.winter on
  2026-04-15 had 1 `outcome: "complete"` for OutSystems at 08:54:49, and 2
  orphans (no completion) for Polaris at 08:56 and 09:18. **Same browser, same
  account, same AAD successes — different parent origin, different outcome.**
- Carrie has zero polaris successes across 14 days / 45 sessions / 78 pageviews
  / 5 builds. That's way beyond any transient effect.
- Alex (alex.ridgley) shows the same chronic pattern: 7 pageviews across 2
  sessions (morning + afternoon, 4.5h gap), 0 successes either session, all AAD
  sign-ins successful.
- Debbie (debbie.davies) same pattern: 4 timeouts in a 19-min window on
  2026-04-15 08:45–09:04, all corresponding to AAD successes, no recovery.

**Evidence AGAINST:**

- If H3 were pure "her machine is broken", carrie would also fail on OutSystems.
  She doesn't. So H3 needs to be "machine **×** parent origin" — something about
  polaris specifically triggers the block.
- Cohort size (~10 users) is small for a generalised enterprise agent, but
  plausible for a specific browser profile / extension combination.

**Verdict:** **Strongest candidate for the chronic cohort.** The mechanism is
"something about being hosted inside a polaris page, combined with specific
client-side state, silences the iframe response".

---

## Rejected theories (with reasons)

| Theory                                                      | Why rejected                                                                                                                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AAD throttling / anti-abuse ban                             | Zero AADSTS throttle codes across 32 sign-ins. No user shows the 5–7 min ban-then-recover signature.                                                                  |
| Persistent AAD session issue (`AADSTS160021` sid rejection) | Fixed by sid→UPN change in Build 16 (commit `5e75ffba`, 2026-04-13). Carrie is still broken on Build 17 and 18.                                                       |
| Rapid (< 2s) host-app redirects racing our silent flow      | 2s SSO_SILENT_DELAY_MS in place since Build 15. Flow entries consistently show `SsoSilentDelayActualWaitMs ≈ 1998ms`, and no evidence of sub-2s redirect in the data. |
| Purely machine-specific (carrie's laptop is broken)         | Same machine works on OutSystems. Must be machine × origin.                                                                                                           |
| Browser cookie policy change universal to the tenant        | Would affect most users, not ~10. Most of prod auths fine.                                                                                                            |
| MSAL cross-version cache migration drift (H2-refined)       | Falsified 2026-04-15. Polaris writes only to sessionStorage; MSAL 2.39 has zero direct `window.localStorage` references. Our localStorage cannot be corrupted by Polaris. See Finding 8. |

---

## Moving parts

### Authentication flow architecture

We are a **guest web component** embedded in two host apps with different
origins:

- `polaris.cps.gov.uk` (polaris-ui, a React SPA)
- `cps.outsystemsenterprise.com` (OutSystems Casework Blocks)

Both host apps are in the same tenant (`00dd0d1d-d7e6-4338-ac51-565339c7088c`,
"CPSGOVUK") but use **different client IDs** for their own MSAL. Our component
uses **its own client ID `8d6133af-9593-47c6-94d0-5c65e9e310f1`** (shown in Azure
Portal as "FCT Global Components (dev)" — the "(dev)" is historical naming,
this IS the prod client ID per `configuration/config.prod.json`).

Our auth flow (`src/services/auth/get-ad-user-account.ts`):

1. `tryAcquireTokenSilently` — uses cached RT. Fast path if account in MSAL cache.
2. `tryLoginAccountSilently` — `ssoSilent` via hidden iframe with `loginHint` = user's UPN.
3. `tryLoginAccountViaPopup` — interactive popup as last resort.

Each silent flow records via `addSilentFlowDiagnostics` (Build 17+) with a
start entry, and (Build 18+) a completion entry that merges by `operationId`.

### Relevant builds and what changed

| Build | SHA       | Deployed             | Change                                                                                                                                                                                                                                              |
| ----- | --------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13    | `6e2b748` | ~2026-03-30          | Baseline                                                                                                                                                                                                                                            |
| 14    | `f581029` | 2026-04-02           | —                                                                                                                                                                                                                                                   |
| 15    | `339e17e` | 2026-04-07           | Introduced `SSO_SILENT_DELAY_MS=2000` (commit `339e17ea`). Introduced `acquireTokenSilent` path (commit `4fe5bd20`).                                                                                                                                |
| 16    | `5e75ffb` | 2026-04-13           | **sid → UPN for loginHint** (commit `5e75ffba`). Resolved `AADSTS160021` — acquireTokenSilent failures dropped 168/1018 (16.5%) → 5/191 (2.6%).                                                                                                     |
| 17    | `b0809db` | 2026-04-14           | Added `SilentFlowDiagnostics.SilentFlows[]` recording `{time, url}` per attempt; cap 5 entries; persisted across page loads.                                                                                                                        |
| 18    | _current_ | 2026-04-15 06:41 UTC | Added `operationId`, `completedTime`, `outcome ∈ {complete, failure}`, `errorCode` (raw MSAL code) to each flow entry. Added `onError` (→ `trackException`) in `tryAcquireTokenSilently`, `tryLoginAccountSilently`, and `tryLoginAccountViaPopup`. |

### Data sources

- **`GloCo_AppExceptions`** (KQL function) — our trackException records. Carries
  `AuthDiagnostics` and (from Build 17) `SilentFlowDiagnostics.SilentFlows[]`
  trail.
- **`GloCo_PageViews`** — our pageviews with `Auth_IsAuthed`, `Auth_Username`,
  `Auth_KnownErrorType`, `SessionId`, `Build_RunId`.
- **`AppExceptions` / `AppPageViews`** — raw App Insights tables. `OperationId`
  is the join key introduced in Build 18.
- **AAD sign-in logs** (CSV export from Entra Portal) — the authoritative record
  of what AAD saw and responded. All 2026-04-14 / 04-15 logs for affected users
  archived under `not-tracked/ad-logs-2/`.

### MSAL storage architecture

Config: `cacheLocation: "localStorage"`, no `namePrefix` (MSAL 4 has none to set).
Our MSAL key prefix is hardcoded `"msal"` — same as Polaris's MSAL 2.39.

Key classes:

| Key pattern | Schema-qualified? | Client-ID qualified? | Shared with Polaris 2.x? |
|---|---|---|---|
| `msal.2.account.keys` | ✓ (v2) | ✗ | No (different schema) |
| `msal.2.token.keys.<clientId>` | ✓ | ✓ | No |
| Individual account entries (`<homeAccountId>-<env>-<realm>`) | — | via homeAccountId | Partially — schema drift possible |
| Individual token entries (`<homeAccountId>-<env>-<credType>-<clientId>-...`) | — | ✓ | No |
| `msal.interaction.status` | — | value only | **Yes** (key collision; silent flows don't touch it) |
| `msal.browser.platform.auth.dom` | — | ✗ | **Yes** |
| `msal.version` | — | ✗ | **Yes** |
| `msal.browser.log.level`, `.log.pii`, `.performance.enabled` | — | ✗ | **Yes** |

On every `PublicClientApplication.initialize()` our `BrowserCacheManager.migrateExistingCache`
reads legacy (v0) keys written by any older MSAL in the origin — including Polaris's 2.39 —
and writes migrated copies into our v2 structure. This is the intended migration behavior for
upgrading a single app's own cache; it is **not** designed for cross-app coexistence at the
same origin. See H2-refined.

### SilentFlowDiagnostics schema evolution

```ts
// Build 17
{ time: number; url: string }

// Build 18
{
  time: number;            // ms epoch
  url: string;             // window.location.href at flow start
  operationId?: string;    // App Insights traceID — join key to AppPageViews.OperationId
  completedTime?: number;  // ms epoch when flow resolved/threw
  outcome?: "complete" | "failure";
  errorCode?: string;      // raw MSAL error code on failure (e.g. monitor_window_timeout)
}
```

Merge logic in `initialise-diagnostics.ts`: if incoming entry's `operationId`
matches an existing entry, merge fields in place. Otherwise, unshift (prepend,
most recent first; cap at `SILENT_FLOW_DIAGNOSTICS_LENGTH=5`).

**Orphan** = an entry with `operationId` but no `outcome` / `completedTime` —
means we recorded the start but never recorded a completion. Happens when the
page tears down mid-flow OR our completion handler never fires for any reason.

---

## User cohorts

### Chronic — persistent 0% auth rate

These users fail near-universally across sessions and builds. Example counts
from 2026-04-15:

| User                                                                                                        | UserId                   | AAD sign-ins (success) | Our auth success rate                                | Pattern                                                 |
| ----------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| **carrie.winter@cps.gov.uk**                                                                                | `MruR68bbHKGFOjwJ9fRK3Z` | 15 / 15                | 0% over 14 days, 45 sessions, 78 pageviews, 5 builds | Polaris fails, OutSystems works                         |
| **alex.ridgley@cps.gov.uk**                                                                                 | `I4gOpyzPHK7RTXQuZpj3hm` | 7 / 7                  | 0% over 7 pageviews, 2 sessions                      | All polaris case-details pages                          |
| **debbie.davies@cps.gov.uk**                                                                                | `vPiFJtzQV3JbSGGffQdUcZ` | 4 / 4                  | 0% over 4 pageviews / 19 min                         | Rapid-retry on polaris, never recovers                  |
| sairan.hussain, richard.leonard, lauren.gosney, rosalind.collingwood, lloyd.morgan, harry.friend, anna.rees | various                  | (not pulled)           | 0% across 24h                                        | Noted 2026-04-14 as part of the 9-user 0%-authed cohort |

### Transient / intermittent

| User                            | UserId                   | Event                                                               | Outcome                                                                                                                                              |
| ------------------------------- | ------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **darcie.coke@cps.gov.uk**      | `B+PS0F2jCYaads+tfZm7wU` | Timeout 11:08:12 2026-04-15                                         | Recovery 11:08:40 (28s). AAD log missing for the timeout → request never reached AAD. Recovery latency 935ms (~6× normal). Client-side network blip. |
| **alisonm.saunders@cps.gov.uk** | `sAhW9aA7CLhiz1crlQYNha` | Timeout 08:27:46 → complete 08:28:03                                | 17s recovery. Later timeout 10:02 at different session.                                                                                              |
| **gurvinder.bhakar@cps.gov.uk** | `ncTc8Ma4piz7tpmzasdRjP` | Monitor_window_timeout 11:08:18, then interaction_required 11:08:31 | **Zero AAD log entries for our app.** Requests never reached AAD. Pre-egress client block.                                                           |

### Healthy (baseline)

~1 300 distinct users / 8 458 pageviews on Build 18 in 6h. Top healthy users
(shamima.begum, caroline.christie, catherine.jones, abbie.lannigan, emily.rogers)
show 46–82 pageviews / 1 session / 100% authed — single morning login, then
smooth all day.

---

## Key findings with evidence

### Finding 1 — Zero AAD failures across affected users

**Source:** `not-tracked/ad-logs-2/` pulled 2026-04-15.

Across 6 users and 32 sign-ins to our client ID (`8d6133af-...`):

- **32 × `Status: Success`**, 0 × Failure
- **0 × Sign-in error codes**
- **0 × non-"Other" Failure reasons**
- **32 × `Conditional Access: Success`**
- Typical latencies 105–213 ms; one outlier at 935 ms (darcie's slow recovery)

**Implication:** AAD is not the cause of chronic failures. The response leaves
AAD with a valid token. The problem is strictly downstream, on the browser side.

### Finding 2 — Carrie's polaris-vs-OutSystems split (the crown jewel)

**Source:** GloCo_AppExceptions, Build 18 flow trail for
`UserId = MruR68bbHKGFOjwJ9fRK3Z`, 2026-04-15.

| Time (UTC) | Host                         | Outcome      | OpId          |
| ---------- | ---------------------------- | ------------ | ------------- |
| 08:54:49   | cps.outsystemsenterprise.com | **complete** | `88df99a9...` |
| 08:56:38   | polaris.cps.gov.uk           | orphan       | `decfd513...` |
| 09:18:19   | polaris.cps.gov.uk           | orphan       | `237685f6...` |

All three AAD sign-ins succeeded (105–151 ms latency). Only the OutSystems one
made it back to our code.

**Implication:** Parent origin is the diagnostic variable. Same browser, same
person, same account, same AAD behaviour.

### Finding 3 — 78% of polaris orphans have matching pageviews

**Source:** OperationId left-join between `GloCo_AppExceptions` SilentFlows
entries and `AppPageViews`, 2026-04-15.

Of 79 polaris orphans with `OperationId`:

- 62 (78%) have a matching `AppPageView.OperationId` → page lived, iframe never delivered
- 17 (22%) no matching pageview → page vanished before pageview flushed

**Implication:** The dominant failure mode is "page stayed, iframe silent",
NOT "page leaving too fast". H2/H3 territory, not H1.

### Finding 4 — acquireTokenSilent failures dropped dramatically with sid→UPN

**Source:** GloCo_AppExceptions across builds, 2026-04-01 → 2026-04-15 prod.

| Build | Total exceptions | AcquireTokenSilent started | AcquireTokenSilent failed | Fail rate           |
| ----- | ---------------- | -------------------------- | ------------------------- | ------------------- |
| 13    | 3 059            | 0                          | 0                         | —                   |
| 14    | 759              | 0                          | 0                         | —                   |
| 15    | 1 018            | 168                        | 168                       | 16.5%               |
| 16    | 191              | 5                          | 5                         | 2.6%                |
| 17    | 16               | 1                          | 1                         | 6.3% (small sample) |

Builds 13/14 had no `AcquireTokenSilentStartMs` field. Build 15 introduced the
acquireTokenSilent path. Build 16's sid→UPN change crushed the failure rate.

**Implication:** `AADSTS160021` sid-rejection was a real prior cause. That's
resolved. Remaining failures in Build 16+ are different mechanisms.

**Secondary implication (the "read from cache, send to AAD, get stuck" class):**
This fix is archetypal. MSAL was reading a stale value from our cache and
sending it, and AAD was rejecting it. By passing an explicit `loginHint`, we
forced MSAL down a different code path that skipped the stale-cache lookup.
Other paths inside MSAL have similar "read and attach" behaviour (e.g. the
cache migration path, the token-response reconciliation path) and are
candidates for similar stuck-forever cycles. See H2-refined.

### Finding 5 — No ban-then-recovery signature observable

**Source:** Build 18 per-user timeline of monitor_window_timeout → complete.

Across 7 users with a `monitor_window_timeout` in the dataset:

- 4 users (7 timeouts) — timeout-only, **no complete ever recorded**
- 3 users (4 timeouts, 5 completes) — mixed; observed recoveries: **17s, 28s**,
  nothing in the 5–7 min ban-clear window.

**Implication:** AAD bans are not driving observable timeouts. The recoveries
we see are too fast to be ban-driven (consistent with Finding 1's zero-throttle
AAD evidence). Long-duration timeouts that never recover are not ban, either.

### Finding 6 — Two distinct non-ban failure modes

From the AAD log × our-telemetry cross-correlation:

- **"AAD-succeeded-we-lost-it"** — majority of chronic failures. AAD mints a
  token in ~150ms, our iframe never delivers. Carrie, alex, debbie all match.
- **"Request-never-reached-AAD"** — rarer. Darcie's timeout at 11:08:12 had NO
  corresponding AAD log entry. Gurvinder has ZERO AAD entries for our app
  across his 2 failed attempts. Pre-egress client-side block (network, extension,
  CSP-blocking-the-iframe).

### Finding 7 — MSAL migrates v0 cache entries on every init (code archaeology)

**Source:** `@azure/msal-browser@4.30.0`, read 2026-04-15.

Key locations:

- `src/cache/CacheKeys.ts` — prefix is hardcoded `"msal"`. No `namePrefix`
  option is exposed in MSAL 4's `CacheOptions`.
- `src/cache/BrowserCacheManager.ts:154` `migrateExistingCache` — on every
  `initialize()`, iterates schema versions 0..v2 and reads/migrates entries.
- `src/cache/CacheKeys.ts:20` `getAccountKeysCacheKey` — v0 returns
  `msal.account.keys`; v2 returns `msal.2.account.keys`.
- `src/interaction_client/StandardInteractionClient.ts:360` — our `loginHint`
  bypass confirmed: if `loginHint || sid` is set, MSAL skips the active
  account lookup. Good. But the _migration_ still runs.
- `src/controllers/StandardController.ts:1166` — `ssoSilent` can route
  through a platform broker if `platformAuthProvider` is set. We don't set
  `allowPlatformBroker`, so this path is inactive for us. Not a factor.

**Implication:** We run in the same browsing context as Polaris's MSAL 2.39.
Our init migrates Polaris's v0 cache entries into our v2 structure. Migration
drift between 2.x and 4.x entry shapes is a plausible mechanism for the
chronic "stuck forever" pattern.

**⚠️ Superseded by Finding 8** — the precondition (Polaris writing v0 entries
to our localStorage) does not hold. Polaris writes only to sessionStorage.

### Finding 8 — MSAL 2.39 + 4.30 storage isolation verified (falsifies H2-refined)

**Source:** `@azure/msal-browser@2.39.0` source pulled via `npm pack`,
examined 2026-04-15. Polaris's runtime config shared by user.

**Polaris's MSAL config (verbatim):**

```ts
export const msalInstance = new PublicClientApplication({
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    redirectUri: process.env.PUBLIC_URL,
    postLogoutRedirectUri: "/",
  },
});
```

No `cache` block → inherits `DEFAULT_CACHE_OPTIONS.cacheLocation`, which in MSAL 2.39 (and 4.30) is `BrowserCacheLocation.SessionStorage`. So **Polaris's MSAL writes exclusively to sessionStorage** (plus cookies if `storeAuthStateInCookie` were true — it isn't).

**MSAL 2.39 source scan for direct localStorage access:**

```
$ grep -rn 'window.localStorage' @azure/msal-browser@2.39.0/dist/
(no matches)
```

All references to the string `"localStorage"` in 2.39's source are either:
- Enum values (`BrowserCacheLocation.LocalStorage = "localStorage"`)
- Doc comments / error messages

→ **MSAL 2.39 has no hardcoded localStorage writes.** It strictly honours its configured `browserStorage`. With Polaris's default config, that's sessionStorage.

**Consequence:** Our localStorage on `polaris.cps.gov.uk` contains ONLY entries written by our MSAL 4.30 (for our clientId `8d6133af-...`). Cross-app cache-migration drift from Polaris into our storage cannot happen.

**Residual shared surfaces that were NOT falsified by this finding:**

1. **AAD session cookies on `login.microsoftonline.com`.** Both MSAL instances send these on silent-flow iframe requests. If Polaris's activity triggers AAD session rotation mid-flow, our response could land with an unexpected session state. This is a browser-level shared surface that cannot be isolated via MSAL config.
2. **`sessionStorage` on `polaris.cps.gov.uk`.** Our temp cache (PKCE verifiers, nonces, state — default `temporaryCacheLocation` is sessionStorage) lives here alongside Polaris's full MSAL state. But:
   - MSAL 2.39's broad cleanup path `BrowserCacheManager.clear()` (line 875) only runs on explicit logout, not in silent flow paths.
   - Narrower paths (`cleanRequestByInteractionType` line 1134, `resetRequestCache(state)` line 1089) match by state-UUID substring. Our state UUIDs are random; collision with Polaris's random UUIDs is astronomically unlikely.
3. **`msal.interaction.status` key** in sessionStorage — non-client-id-qualified, same shape in 2.39 (line 1219) and 4.30 (line 2205). But MSAL 4.30's `SilentIframeClient` doesn't call `setInteractionInProgress` — our silent flow doesn't touch this key. Only interactive flows would collide, and we rarely do those.

**Bottom line:** The chronic-user failure mechanism cannot be "Polaris corrupts our localStorage". It must be either:
- Shared AAD cookie state affecting our iframe response (hard to instrument from our side)
- Or purely client-side origin-specific (H3): extension, service worker, CSP, enterprise agent.

H3 remains the leading candidate.

---

## Investigation timeline

| Date       | What we did                                                                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-07 | Build 15: added `SSO_SILENT_DELAY_MS=2000` and `acquireTokenSilent` path (commit `4fe5bd20`, `339e17ea`)                                                                                                                        |
| 2026-04-13 | Build 16: sid → UPN change (commit `5e75ffba`). Resolved `AADSTS160021` cluster.                                                                                                                                                |
| 2026-04-14 | Build 17: SilentFlowDiagnostics `{time, url}` introduced (commit `b0809db6`). Started seeing redirect-chain evidence for MruR's 14:42–14:43 cluster. Pulled carrie's AAD logs — all Success, debunking "MruR is banned" theory. |
| 2026-04-15 | Build 18: added `operationId`, `completedTime`, `outcome`, `errorCode`. Probes run: orphan→next-flow gap; OperationId join to AppPageViews; MruR polaris-vs-OutSystems; AAD-log correlation for 6 users. AAD confirmed 32/32 Success — ban ruled out. |
| 2026-04-15 | Code archaeology of `@azure/msal-browser@4.30.0`. Discovered MSAL has hardcoded `msal` prefix, no `namePrefix` option, runs `migrateExistingCache` on every init reading v0 entries written by Polaris's MSAL 2.39. H2 upgraded to **H2-refined: MSAL cross-version cache migration drift.** |
| 2026-04-15 | Pulled Polaris's MSAL config + fetched `@azure/msal-browser@2.39.0` source via `npm pack`. Polaris uses default `cacheLocation` → **sessionStorage**. 2.39 source has zero direct `window.localStorage` references. **H2-refined falsified** — Polaris never writes to our localStorage. Synthesis revised: H3 is now clear leading candidate. See Finding 8. |

---

## Open questions / next probes

### Probes we could run from existing data

- Full per-user breakdown of orphan rate by host for the whole chronic cohort
  (beyond carrie, alex, debbie). If they all show polaris-dominant orphans,
  H3 parent-origin hypothesis strengthens.
- Recovery-timing probe across the chronic cohort: does anyone EVER complete a
  polaris flow on Build 18?
- Cross-reference pageviews vs flow trails: do chronic users still _emit_
  pageviews while stuck (pageview sendBeacon working) while the iframe is not?
  If yes, postMessage / iframe-specific issue (not network-global).

### Probes that need new instrumentation

- **Storage snapshot around flow start/complete.** Log `localStorage.length`
  and the set of `cps_global_components.*` keys at both timestamps. Direct H2
  test.
- **`storage` event listener during iframe window.** Catch cross-tab writes
  made by a co-app during our silent flow. H2 evidence.
- **Cookie inventory** at start + complete. Rotation detection.
- **Service-worker registration snapshot** on flow start. Catch polaris-level
  SW interception.
- **Aborted-during-delay event.** Log `trackEvent("SsoSilentSkipped", {
reason: "beforeUnload" | "pageHidden" })` if the 2s delay bails. Confirms
  whether the delay is catching anything today (we suspect it isn't, given no
  evidence of sub-2s redirects).

### Things that need a human

- **Highest priority — localStorage dump from a chronic user on
  `polaris.cps.gov.uk`.** Instructions: DevTools → Application → Local Storage
  → `https://polaris.cps.gov.uk` → export/screenshot all keys starting with
  `msal`. Looking for:
  - v0 entries (`msal.account.keys`, individual `msal.*` credential/account
    entries without a schema prefix) — proves Polaris 2.39 writes are present
  - v2 entries (`msal.2.account.keys`, `msal.2.token.keys.<clientId>`) — our
    migration output
  - Schema drift between the two versions of the same account
  - Orphaned entries for other clientIds
  - `msal.version` value
  This directly falsifies or confirms H2-refined.
- **Follow-up test: clear polaris's MSAL localStorage entries and retry.**
  Ask the user to run in DevTools Console (on the polaris page):
  ```js
  Object.keys(localStorage).filter(k => k.startsWith('msal')).forEach(k => localStorage.removeItem(k));
  ```
  Then reload and attempt a case. If this unblocks them, H2-refined confirmed.
  **Caveat:** this also nukes Polaris's own MSAL state — they may need to
  re-login to Polaris itself. Acceptable cost for the diagnostic value.
- Ask carrie (or another chronic user) to:
  - Try a different browser (Chrome, Firefox) on the same polaris case
  - Try the same polaris case in Edge InPrivate with extensions disabled
  - Screenshot polaris Application tab: ServiceWorkers, Extensions, Cookies
- Ask IT / tenant admin: any Conditional Access / MFA / Defender / Zscaler /
  CASB / SmartScreen / tracking-protection policy that rolled out ~2026-04-01
  (when carrie's 0% streak begins) and could be origin-keyed on polaris?

---

## Glossary

- **Orphan flow** — `SilentFlows[]` entry with `time` + `url` + `operationId`
  but no `completedTime` / `outcome`. Silent flow started, we never observed
  its end.
- **Complete flow** — `outcome: "complete"`, flow returned without throwing.
- **Failure flow** — `outcome: "failure"`, flow threw. `errorCode` carries the
  raw MSAL code.
- **Chronic user** — user with a multi-session, multi-day 0% auth rate.
- **`monitor_window_timeout`** — MSAL's error when its iframe monitor loop
  doesn't see a redirect back to our origin within 10s. Fires from the
  MSAL.js `BrowserAuthError`.
- **`interaction_required`** — MSAL's error when AAD replies to the silent
  request saying "can't complete silently, go interactive".
- **`AADSTS160021`** — AAD error: session / sid mismatch. Was the driver of
  Build 15's acquireTokenSilent failures; fixed in Build 16.
- **H1 / H2 / H3** — abbreviations for the three hypotheses above. Use them
  in conversation to keep threads aligned.
