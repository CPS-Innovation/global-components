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

### Conflict Resolution
- **Simple conflicts** (package.json, lock files, version numbers): Resolve automatically by accepting the incoming (Renovate) changes
- **Complex conflicts** (source code changes): Skip the PR and note in summary
- Never prompt - either fix it or skip it

### What to Skip (automatically, without asking)
- PRs with conflicts in source code (not just config/lock files)
- PRs that fail the build/test validation
- PRs older than 60 days (likely stale)

## Workflow

### Step 1: Gather Renovate PRs
```bash
gh pr list --author "app/renovate" --json number,title,headRefName,createdAt,mergeable --jq 'sort_by(.createdAt)'
```
Store this list - you'll need PR numbers for closing later.

### Step 2: Create uber-branch
```bash
git fetch origin main
git checkout -b renovate/uber-$(date +%Y%m%d) origin/main
```

### Step 3: Merge each PR branch (chronologically)
For each PR, oldest first:
```bash
git fetch origin <branch>
git merge origin/<branch> --no-edit
```

If merge conflict:
- Check if conflict is only in `package.json`, `pnpm-lock.yaml`, or similar config files
- If yes: resolve by accepting theirs (`git checkout --theirs <file> && git add <file> && git commit --no-edit`)
- If no: abort merge (`git merge --abort`), skip this PR, add to skipped list

Track which PRs were successfully merged into the uber-branch.

### Step 4: Build and Test Validation

Run the full validation suite:
```bash
pnpm install
pnpm -w build
pnpm -w test
pnpm -w test:e2e
pnpm -w test:proxy
```

**If any step fails, perform bisect:**

1. Note which PRs are in the uber-branch (in merge order)
2. Binary search to find the culprit:
   - Reset to main, merge first half of PRs, test
   - If passes: culprit is in second half
   - If fails: culprit is in first half
   - Repeat until single PR identified
3. Remove the culprit PR from the uber-branch:
   ```bash
   git checkout -b renovate/uber-$(date +%Y%m%d)-v2 origin/main
   # Re-merge all PRs except the culprit
   ```
4. Re-run validation
5. Add culprit to skipped list with reason: "Failed: [build|test|test:e2e|test:proxy]"
6. If still failing, repeat bisect until passing or no PRs remain

### Step 5: Push and create PR
```bash
git push -u origin HEAD
```

Create PR with body listing included and skipped PRs:
```bash
gh pr create --title "chore(deps): consolidate Renovate updates $(date +%Y-%m-%d)" --body "$(cat <<EOF
## Consolidated Dependency Updates

This PR combines multiple Renovate PRs into a single update to reduce CI builds.

### Included PRs
- #XXX title
- #YYY title

### Skipped PRs
- #ZZZ title - Reason

---

**After merging this PR**, tell Claude: "the renovate uber-PR is merged" to auto-close the source PRs.
EOF
)"
```

### Step 6: Summary Report
Output a summary:
- PRs successfully included (with numbers)
- PRs skipped (with reason)
- Link to the new uber-PR
- Reminder: "After merging, say 'renovate uber-PR is merged' to close source PRs"

Store the list of included PR numbers for the cleanup phase.

---

## Phase 2: Cleanup (after uber-PR is merged)

When user says any of:
- "the renovate uber-PR is merged"
- "renovate cleanup"
- "close the renovate PRs"

Execute cleanup:
```bash
# For each PR that was included in the uber-branch:
gh pr close <number> --comment "Closed: included in consolidated update PR #<uber-pr-number>"
```

Report:
```
Closed X Renovate PRs:
- #640 react v19.2.9
- #639 rollup v4.55.3
...

Skipped PRs (still open - need manual review):
- #637 react v19 major - had source conflicts
```

---

## Important Behaviors

1. **No prompting** - Make decisions autonomously using the policies above
2. **Fail gracefully** - If something breaks, skip it and continue
3. **Bisect on failure** - Don't give up, find the culprit PR and exclude it
4. **Report at end** - Give one comprehensive summary when done
5. **Two-phase approach** - Create PR first, close source PRs only after user confirms merge

## Invocation

**Phase 1 - Create uber-PR:**
- `/renovate`
- "deal with renovate PRs"
- "handle renovate"
- "consolidate dependency updates"

**Phase 2 - Cleanup after merge:**
- "the renovate uber-PR is merged"
- "renovate cleanup"
- "close the renovate PRs"
