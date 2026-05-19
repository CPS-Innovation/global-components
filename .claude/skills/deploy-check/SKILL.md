---
name: deploy-check
description: Pre-deploy safety analysis. Compares current main HEAD against the last production deploy, reporting changes, risks, tickets, dependency updates, and config changes by environment.
---

# Deploy Check

Analyse what would be deployed if `deploy-all.yml` were run right now.

## Invocation

- `/deploy-check`
- "what's pending deploy?"
- "deploy check"
- "what would we deploy?"

## Workflow

### Step 1: Get last deploy SHA

```bash
gh run list --workflow=deploy-all.yml --status=success --limit=1 --json headSha,createdAt
```

Extract `headSha` — this is the commit currently in production.

### Step 2: Validate branch

Ensure the local `main` branch is up to date:

```bash
git fetch origin main
```

The comparison is always `<last-deploy-sha>...origin/main`. If the user is not on `main`, that's fine — we compare against `origin/main` regardless.

### Step 3: Gather raw data

Run these in parallel:

```bash
# Commit log between last deploy and current main
git log --oneline <last-deploy-sha>..origin/main

# Diff stat summary
git diff --stat <last-deploy-sha>..origin/main

# Full diff (for analysis)
git diff <last-deploy-sha>..origin/main

# Dependency changes
git diff <last-deploy-sha>..origin/main -- '**/package.json'

# Config changes per environment
git diff <last-deploy-sha>..origin/main -- 'configuration/'
```

### Step 4: Analyse and report

Produce a single report with the sections below. Be concise but thorough. Use your judgement — flag things that a reviewer would want to know before hitting the deploy button.

If there are no changes (last deploy SHA equals origin/main HEAD), report "Nothing pending — production is up to date with main." and stop.

---

## Report Format

### Summary

One-line overview: how many commits, how many files changed, overall size of the diff.

### Tickets

Extract ticket IDs from commit messages. The pattern is `#FCT2-NNNNN` (but be flexible — look for any `#XXX-NNNNN` or similar patterns).

List each ticket once with the associated commit message(s):

```
- #FCT2-16605 — refactor global-script
- #FCT2-14290 — add SSO silent flow delay (3 commits)
```

Also list any commits that do NOT have a ticket ID (housekeeping, dependency updates, etc.) in a separate "Untracked changes" sub-section.

### Production Stability Analysis

The core question is: **can this blow up in production?** Focus on runtime failure modes that would
break the component for users — not on whether new features work correctly. A new feature that
silently doesn't activate is fine; a null reference that crashes initialisation is not.

Scan the diff for patterns that could cause production failures:

- **Runtime crashes**: null/undefined dereferences on paths that _previously worked_, removed guards
  or fallbacks, accessing properties on potentially-undefined values without checks
- **Initialisation failures**: changes to the startup/navigation flow that could prevent the
  component from loading at all — broken import paths, missing dependencies between init phases,
  exceptions that escape error boundaries
- **Auth breakage**: any modifications to MSAL/auth files — these are high-risk given guest component
  constraints. Could this change cause auth loops, silent failures, or blocked UI?
- **Regression in existing behaviour**: changed function signatures where callers may not have been
  updated, removed exports that other files depend on, renamed store keys that components read
- **Proxy / infra changes**: any changes under `infra/` that could affect routing or serving

Do NOT flag:
- New features that might not work perfectly (that's a feature bug, not a production incident)
- Code style, test quality, or refactoring choices
- Missing `.catch()` on fire-and-forget promise chains (this codebase uses generation flags for
  concurrency control — see memory)

When you find something concerning, **read the surrounding code** to understand whether it's actually
a problem. Don't flag surface patterns without checking the implementation. If a function receives
a new parameter, check the callers. If a null check was removed, check whether the value is now
guaranteed by an earlier phase.

Rate the overall change as one of:
- **Low risk** — unlikely to cause production issues
- **Medium risk** — touches sensitive areas but the changes look sound on inspection
- **High risk** — identified patterns that could realistically cause runtime failures in production

### Dependency Changes

If any `package.json` files changed, summarise:
- New dependencies added
- Dependencies removed
- Version bumps (group minor/patch vs major)

If no dependency changes, say "No dependency changes."

### Config Changes

If any files in `configuration/` changed, show **which environments** are affected and what changed. The config files follow the pattern `config.<environment>.json` where environments are: accessibility, dev, test, prod.

Highlight specifically:
- Changes that affect **prod** (these deserve extra attention)
- Changes that are in some environments but not others (possible intentional rollout, or possible omission)
- New config keys or removed config keys

If no config changes, say "No config changes."

---

## Important Behaviours

1. **Informational only** — this skill reports findings, it does not block or gate anything
2. **No prompting** — run the full analysis and present the report without asking questions
3. **Be specific** — when flagging risks, include file paths and brief context so the user can jump straight to the code
4. **Go deep, not wide** — don't mechanically list surface patterns. When something looks risky, read the implementation to confirm whether it's actually a problem. A removed null check is only a concern if the value can actually be null at that point.
5. **Keep it scannable** — use headers, bullet points, and short sentences. The user wants to glance at this and know if they're comfortable deploying
6. **Production focus** — the question is "will this break what's currently working?", not "will the new feature work perfectly?"
