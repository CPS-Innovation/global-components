---
name: renovate
description: Consolidate all open Renovate dependency PRs into a single uber-branch. Run autonomously without prompting - handles conflicts, runs tests, bisects failures.
---

# Renovate PR Consolidator

Consolidate all open Renovate dependency PRs into a single uber-branch for one build/merge.

## Autonomous Policy (No Prompting)

This skill runs **fully autonomously**. Do not prompt the user for decisions. Follow these rules:

### Merge Priority (Process in this order)

1. Patch updates (x.x.PATCH) - Always safe
2. Minor updates (x.MINOR.x) - Safe for well-maintained packages
3. Major updates (MAJOR.x.x) - Include but flag in summary

### Blocked Packages (Never Include)

- **nginx** - Pinned for production infrastructure coordination

### Conflict Resolution

- **package.json**: Accept theirs (incoming Renovate changes)
- **pnpm-lock.yaml**: Delete and regenerate with `pnpm install`
- **Source code conflicts**: Skip the PR and note in summary
- Never prompt - either fix it or skip it

### What to Skip (automatically, without asking)

- PRs for blocked packages (nginx)
- PRs with conflicts in source code (not just config/lock files)
- PRs that fail the build/test validation
- PRs older than 60 days (likely stale)

---

## Worktree Isolation

**All work happens in a temporary worktree** so the user's checkout is unaffected.

```bash
# Setup
REPO_PATH="/Users/stef/code/CPS/global-components"
WORKTREE_PATH="/tmp/claude/renovate-worktree-$(date +%Y%m%d-%H%M%S)"
git -C "$REPO_PATH" fetch origin main
git -C "$REPO_PATH" worktree add "$WORKTREE_PATH" origin/main
cd "$WORKTREE_PATH"
git checkout -b renovate/uber-$(date +%Y%m%d)

# Cleanup (after PR created)
git -C "$REPO_PATH" worktree remove "$WORKTREE_PATH" --force
```

---

## Workflow

### Step 1: Gather & Filter PRs

```bash
gh pr list --author "app/renovate" --json number,title,headRefName,createdAt,mergeable --jq 'sort_by(.createdAt)'
```

- Filter out blocked packages (nginx)
- Sort by: patch > minor > major, then chronologically
- Store this list - you'll need PR numbers for closing later

### Step 2: Setup Worktree

```bash
REPO_PATH="/Users/stef/code/CPS/global-components"
WORKTREE_PATH="/tmp/claude/renovate-worktree-$(date +%Y%m%d-%H%M%S)"
git -C "$REPO_PATH" fetch origin main
git -C "$REPO_PATH" worktree add "$WORKTREE_PATH" origin/main
cd "$WORKTREE_PATH"
git checkout -b renovate/uber-$(date +%Y%m%d)
```

### Step 3: Merge PRs (Chronologically)

For each PR, oldest first:

```bash
git fetch origin <branch>
git merge origin/<branch> --no-edit
```

**If merge conflict:**

1. Check which files conflict
2. If only `package.json`:
   ```bash
   git checkout --theirs package.json
   git add package.json
   git commit --no-edit
   ```
3. If `pnpm-lock.yaml`: just delete it (will regenerate later)
   ```bash
   git rm pnpm-lock.yaml
   git commit --no-edit
   ```
4. If source code: abort and skip
   ```bash
   git merge --abort
   # Add to skipped list with reason "source code conflict"
   ```

Track which PRs were successfully merged.

### Step 3.5: Regenerate Lockfile

After all merges complete:

```bash
pnpm install
git add pnpm-lock.yaml
git commit -m "chore: regenerate lockfile after dependency updates"
```

### Step 4: Pre-flight Docker

Ensure Docker is running for e2e/proxy tests:

```bash
if ! docker info &>/dev/null; then
  open -a Docker 2>/dev/null || true
  for i in {1..30}; do docker info &>/dev/null && break || sleep 2; done
fi
```

### Step 5: Local Validation

Run the full validation suite:

```bash
pnpm install
pnpm -w build
pnpm -w test
pnpm -w test:e2e
pnpm -w test:proxy
```

### Step 5.5: Bisect on Failure

**If any validation step fails:**

1. Note which PRs are in the uber-branch (in merge order)
2. Binary search to find the culprit:
   - Create fresh branch from main
   - Merge first half of PRs, test
   - If passes: culprit is in second half
   - If fails: culprit is in first half
   - Repeat until single PR identified
3. Rebuild uber-branch without the culprit:
   ```bash
   git checkout -b renovate/uber-$(date +%Y%m%d)-v2 origin/main
   # Re-merge all PRs except the culprit
   ```
4. Re-run validation
5. Add culprit to skipped list with reason: "Failed: [build|test|test:e2e|test:proxy]"
6. If still failing, repeat bisect until passing or no PRs remain

### Step 6: Push & Create PR

```bash
git push -u origin HEAD
gh pr create --title "chore(deps): consolidate Renovate updates $(date +%Y-%m-%d)" --body "$(cat <<'EOF'
## Consolidated Dependency Updates

This PR combines multiple Renovate PRs into a single update.

### Included PRs
- #XXX title
- #YYY title

### Skipped PRs
- #ZZZ title - Reason

---

**After merging this PR**, tell Claude: "renovate uber-PR is merged" to auto-close the source PRs.
EOF
)"
```

### Step 7: Wait for CI

Poll CI status every 30 seconds until complete:

```bash
gh pr checks <pr-number> --watch
```

- All pass: report success
- Any fail: investigate, fix lockfile if needed, or report

### Step 8: Cleanup Worktree

```bash
git -C "$REPO_PATH" worktree remove "$WORKTREE_PATH" --force
```

### Step 9: Summary Report

```
=== Renovate Consolidation Complete ===

Uber-PR: https://github.com/.../pull/XXX

Included (N PRs):
- #635 puppeteer v24
- ...

Skipped (M PRs):
- #607 nginx - BLOCKED (pinned)
- #614 uuid v13 - FAILED test
- ...

CI Status: PASSED

**You review and merge the PR manually.**
Then say: "renovate uber-PR is merged"
```

---

## Phase 2: Cleanup (after uber-PR is merged)

**The human reviews and merges the uber-PR manually.** The skill does NOT auto-merge.

When user says any of:

- "renovate uber-PR is merged"
- "renovate cleanup"
- "close the renovate PRs"

Execute cleanup:

```bash
# For each PR that was included in the uber-branch:
gh pr close <number> --comment "Closed: included in consolidated update PR #<uber-pr-number>"
```

**Report:**

```
Closed 7 Renovate PRs:
- #635 puppeteer v24
- #638 testing-library/react v16
- ...

Still open (were skipped):
- #607 nginx - pinned dependency
- #614 uuid v13 - failed tests
```

---

## Important Behaviors

1. **No prompting** - Make decisions autonomously using the policies above
2. **Worktree isolation** - Never modify the user's working directory
3. **Fail gracefully** - If something breaks, skip it and continue
4. **Bisect on failure** - Don't give up, find the culprit PR and exclude it
5. **Wait for CI** - Don't report success until CI passes
6. **Report at end** - Give one comprehensive summary when done
7. **Two-phase approach** - Create PR first, close source PRs only after user confirms merge

---

## Invocation

**Phase 1 - Create uber-PR:**

- `/renovate`
- "deal with renovate PRs"
- "handle renovate"
- "consolidate dependency updates"

**Phase 2 - Cleanup after merge:**

- "renovate uber-PR is merged"
- "renovate cleanup"
- "close the renovate PRs"
