# Renovate Skill - Learnings & Proposed Improvements

From session: 2026-01-26

## Issues Encountered

### 1. Checkout interference
**Problem:** Agent checking out branches interferes with user's working directory.
**Solution:** Use git worktree to work in a separate directory (`/tmp/renovate-worktree-YYYYMMDD`).

### 2. Lockfile conflicts
**Problem:** Accepting "theirs" for pnpm-lock.yaml conflicts doesn't work - the lockfile becomes inconsistent with merged package.json files.
**Solution:** After all merges complete, regenerate the lockfile with `pnpm install` and commit it.

### 3. Docker not running
**Problem:** `test:proxy` requires Docker, which may not be running.
**Solution:** Start Docker Desktop before running proxy tests:
```bash
open -a Docker 2>/dev/null || true
for i in {1..30}; do docker info &>/dev/null && break || sleep 2; done
```

### 4. CI failures after PR creation
**Problem:** PR created but CI fails - skill reported success prematurely.
**Solution:** Wait for CI to pass before finishing. If CI fails, diagnose and fix (regenerate lockfile, exclude problematic PRs, etc.).

### 5. ESM compatibility (uuid v13)
**Problem:** uuid v13 uses ES modules which Jest can't parse without config changes.
**Learning:** Major version updates may require config changes - bisect and exclude if they break tests.

### 6. Nginx pinning
**Problem:** User needs nginx pinned to production version, doesn't want Renovate updates.
**TODO:** Configure renovate.json to ignore nginx updates, or add to skill's auto-skip list.

## Proposed Skill Changes

### Add to top of skill (after frontmatter):
```markdown
## IMPORTANT: Run as Background Agent in Worktree

When this skill is invoked, you MUST:

1. **Spawn a background agent** using the Task tool with `run_in_background: true`
2. **Use a git worktree** so the user's main checkout is unaffected

After spawning, tell the user: "Renovate consolidation running in background (in separate worktree). You can continue working."

The background agent prompt MUST include these worktree setup instructions:
\`\`\`bash
REPO_PATH="/Users/stef/code/CPS/global-components"
WORKTREE_PATH="/tmp/renovate-worktree-$(date +%Y%m%d)"
git -C "$REPO_PATH" fetch origin main
git -C "$REPO_PATH" worktree add "$WORKTREE_PATH" origin/main
cd "$WORKTREE_PATH"
git checkout -b renovate/uber-$(date +%Y%m%d)
# ... do all work in $WORKTREE_PATH ...
# Cleanup when done:
git -C "$REPO_PATH" worktree remove "$WORKTREE_PATH" --force
\`\`\`
```

### Update Conflict Resolution section:
```markdown
### Conflict Resolution
- **package.json conflicts**: Accept theirs (`git checkout --theirs package.json && git add package.json`)
- **pnpm-lock.yaml conflicts**: Accept theirs for now, will regenerate later (Step 3.5)
- **Complex conflicts** (source code changes): Skip the PR and note in summary
- Never prompt - either fix it or skip it
```

### Add Step 3.5 after merges:
```markdown
### Step 3.5: Regenerate lockfile

**CRITICAL**: After all merges are complete, regenerate the lockfile:
\`\`\`bash
pnpm install
git add pnpm-lock.yaml
git commit -m "chore: regenerate pnpm-lock.yaml after merging dependency updates"
\`\`\`
```

### Update Step 4 to start Docker:
```markdown
### Step 4: Build and Test Validation

Ensure Docker is running (required for test:proxy):
\`\`\`bash
open -a Docker 2>/dev/null || true
for i in {1..30}; do docker info &>/dev/null && break || sleep 2; done
\`\`\`

Run the full validation suite:
...
```

### Add Step 6 for CI verification:
```markdown
### Step 6: Wait for CI and fix failures

**CRITICAL**: Do not finish until CI passes. Monitor the PR checks:
\`\`\`bash
for i in {1..30}; do
  STATUS=$(gh pr checks <PR_NUMBER> --json state --jq '.[].state' 2>/dev/null | sort -u)
  if echo "$STATUS" | grep -q "PENDING"; then
    sleep 30
  elif echo "$STATUS" | grep -q "FAILURE"; then
    echo "CI failed"
    break
  else
    echo "CI passed"
    break
  fi
done
\`\`\`

**If CI fails:**
1. Check the failed job logs: `gh run view <RUN_ID> --log-failed`
2. Common fixes:
   - **Lockfile out of sync**: Run `pnpm install`, commit and push
   - **Test failures**: Bisect to find culprit PR and exclude it
3. After fixing, push and repeat CI check
```

## Permissions Required

These were added to `.claude/settings.local.json` during the session:
```json
"Bash(git fetch *)",
"Bash(git checkout *)",
"Bash(git merge *)",
"Bash(git push *)",
"Bash(git add *)",
"Bash(git commit *)",
"Bash(git branch *)",
"Bash(gh pr create *)",
"Bash(gh pr close *)",
"Bash(pnpm install)",
"Bash(pnpm -w build)",
"Bash(pnpm -w test)",
"Bash(pnpm -w test:proxy)",
"Bash(date *)"
```

## To Apply These Changes

Run: "apply the renovate skill improvements" and I'll update the skill.md file with all the above changes.
