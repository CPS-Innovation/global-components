# Emergency Rollback Procedures

## Quick Reference

| Situation                                 | Action                                                              |
| ----------------------------------------- | ------------------------------------------------------------------- |
| Bad release, need to rollback NOW         | [Run Rollback Workflow](#1-rollback-bad-release)                    |
| Developer ready to re-merge fixed feature | [Run Revert-the-Revert Workflow](#2-re-enable-feature-for-re-merge) |

---

## 1. Rollback Bad Release

**When to use:** A bad commit has been merged and deployed. You need to immediately restore the previous version.

### Steps

1. Go to **Actions** → **"Rollback: deploy previous version and revert"**
2. Click **"Run workflow"**
3. Configure options:
   - **environments**: Which environments to rollback (default: all pre-prod)
   - **bad_commit_sha**: Leave empty to rollback the latest commit, or enter a specific SHA
   - **create_revert_commit**: Keep checked (recommended) to prevent future deploys of bad code
4. Click **"Run workflow"**

### What happens

1. The workflow deploys the **previous commit** to the selected environments
2. A **revert commit** is created on main (if enabled)
3. The CI/CD pipeline will **NOT** redeploy the bad code because the revert is now HEAD

### After rollback

Check the workflow **Summary** tab for:

- Confirmation of which commits were involved
- Instructions for the developer who needs to fix the issue

---

## 2. Re-enable Feature for Re-merge

**When to use:** After a rollback, when the developer has fixed the issue and is ready to create a new PR.

### Important: Why this step is needed

If the developer merges main (containing the revert) into their feature branch, git will **remove their feature code**. This workflow "reverts the revert" on main first, so the developer can safely merge their fix.

### Steps

1. **Confirm** the developer has fixed the issue on their feature branch
2. Go to **Actions** → **"Utility: revert the revert (prepare for re-merge)"**
3. Enter the **revert commit SHA** (found in the original rollback workflow summary)
4. Click **"Run workflow"**
5. **Tell the developer** they can now create a new PR

### What happens

1. The revert commit is itself reverted, re-enabling the original feature on main
2. This triggers CI/CD and deploys to pre-prod environments
3. The developer's new PR will now only contain their **fix**, not the whole feature

---

## Developer Instructions (After Rollback)

If your feature was rolled back:

1. **DO NOT** merge main into your feature branch
2. **Fix the issue** on your feature branch
3. **Tell a maintainer** when you're ready - they'll run "Revert the Revert"
4. **Create a new PR** from your fixed feature branch

---

## Workflow Locations

| Workflow          | File                                      | Purpose                                 |
| ----------------- | ----------------------------------------- | --------------------------------------- |
| Rollback          | `.github/workflows/rollback.yml`          | Deploy previous version + create revert |
| Revert the Revert | `.github/workflows/revert-the-revert.yml` | Prepare main for re-merge               |

---

## Example Scenario

```
Timeline:
1. Developer merges feature branch "add-widget" to main
2. CI/CD deploys to pre-prod environments
3. Bug discovered in production candidate

Rollback:
4. Maintainer runs "Rollback" workflow
5. Previous version deployed immediately
6. Revert commit created on main (abc123)

Fix:
7. Developer stays on "add-widget" branch, fixes the bug
8. Developer notifies maintainer they're ready

Re-merge:
9. Maintainer runs "Revert the Revert" with SHA abc123
10. Developer creates new PR from "add-widget"
11. PR merged, CI/CD deploys fixed version
```

---

## Troubleshooting

### "Commit not found" error

- Ensure you're using the full SHA or at least 7 characters
- The commit must exist in the repository history

### Rollback didn't deploy

- Check the workflow logs for build/test failures
- The previous commit must still pass all tests

### Developer's PR shows massive changes after revert-the-revert

- The developer may have merged main into their branch before the revert-the-revert
- Solution: Developer should reset their branch to before the merge, or cherry-pick only the fix commits
