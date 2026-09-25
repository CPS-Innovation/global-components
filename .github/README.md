# Emergency Rollback Procedures

## Quick Reference

| Situation                                 | Action                                                              |
| ----------------------------------------- | ------------------------------------------------------------------- |
| Bad release, need to rollback NOW         | [Run Rollback Workflow](#1-rollback-bad-release)                    |
| Developer ready to re-merge fixed feature | [Run Revert-the-Revert Workflow](#2-re-enable-feature-for-re-merge) |
| Emergency exit: put an enrolled environment back on its previous release, in seconds | [Restore the previous release](#3-restore-the-previous-release) |

---

## 1. Rollback Bad Release

**When to use:** A bad commit has been merged and deployed. You need to immediately restore the previous version.

### Steps

1. Go to **Actions** → **"Rollback: pre-prod environments to previous commit"**
2. Click **"Run workflow"**
3. Select **main** branch
4. Click **"Run workflow"**

### What happens

1. The workflow deploys the **previous commit** (HEAD^) to all pre-prod environments
2. A **revert commit** is created on main to prevent future deploys of the bad code
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
3. Select **main** branch
4. Click **"Run workflow"**
5. **Tell the developer** they can now create a new PR

### What happens

1. The workflow finds the most recent revert commit automatically
2. The revert commit is itself reverted, re-enabling the original feature on main
3. This triggers CI/CD and deploys to pre-prod environments
4. The developer's new PR will now only contain their **fix**, not the whole feature

---

## 3. Restore the Previous Release

**When to use:** the emergency exit. A deploy has broken an environment and you want it back on the release it served before — same bytes, same config — in seconds, without a rebuild and without touching git.

**Enrolled environments:** `test` (QA) only, while this is proven. Enrolling another environment takes two things: its name in `ROLLBACK_ENROLLED_ENVIRONMENTS` in `sub-workflow-deploy-script.yml` (so its deploys take the snapshot), and its own copy of `rollback-previous-release-test.yml` with the environment changed (so there is a button to press).

### How it works

- Before every deploy to an enrolled environment, whatever it is serving is copied server-side into the **private** container `release-snapshots`, under `<environment>/<buildsha>/`. The buildsha is the one the deploy stamps on every blob, so a snapshot is named for the commit it really is.
- A snapshot is only usable once complete — marked by `<environment>/<buildsha>/_snapshot.json`, written last.
- For an enrolled environment, **no snapshot means no deploy**: if the snapshot step fails, the upload does not run.
- After each deploy, snapshots are **pruned to just the previous release** — the one this restores. Pruning never fails a deploy.
- Restore copies the snapshot back over the live files in place, then removes files the restored build never had. The environment keeps serving throughout. Nothing is rebuilt, so it takes seconds rather than the ~5 minutes of a redeploy.
- Restore snapshots what was live first and does not prune, so the release you rolled away from is held until the next deploy.

### Steps

1. Go to **Actions** → **"Rollback: test (QA) to its previous release"**
2. Click **"Run workflow"**, select **main**, click **"Run workflow"**

There are no inputs — it always restores the previous release. (Org policy, Checkov `CKV_GHA_7`, requires manually run workflows to take no inputs.) The run **Summary** shows what was live before and what is live now.

### After a restore

- **To undo it, run the same workflow again** — it puts back the release you rolled away from. That works until the next deploy.
- The environment is now **behind main**. The next deploy of main — including the automatic pre-prod deploy on every push — **re-ships what you rolled back from.** Fix forward, or revert on main, before anything else merges.
- It goes back **one release only**. To go further back, revert on main and redeploy.

### Locally

`.github/scripts/release-snapshots.sh` does the work (`snapshot`, `list`, `live`, `restore`, `prune`) given `AZURE_STORAGE_CONNECTION_STRING`. `.github/scripts/release-snapshots.test.sh` exercises it end to end against the Azurite emulator — see its header.

---

## Developer Instructions (After Rollback)

If your feature was rolled back:

1. **DO NOT** merge main into your feature branch
2. **Fix the issue** on your feature branch
3. **Tell a maintainer** when you're ready - they'll run "Revert the Revert"
4. **Create a new PR** from your fixed feature branch

---

## Workflow Locations

| Workflow          | File                                      | Purpose                                  |
| ----------------- | ----------------------------------------- | ---------------------------------------- |
| Rollback          | `.github/workflows/rollback.yml`          | Deploy previous version + create revert  |
| Revert the Revert | `.github/workflows/revert-the-revert.yml` | Prepare main for re-merge                |
| Restore previous release (QA) | `.github/workflows/rollback-previous-release-test.yml` | Emergency exit for `test`; no inputs |
| Restore previous release (shared) | `.github/workflows/sub-workflow-restore-previous-release.yml` | The restore job every environment's rollback calls |
| Snapshot mechanics | `.github/scripts/release-snapshots.sh` | Snapshot / list / restore, used by the deploy and the restore workflow |

---

## Example Scenario

```
Timeline:
1. Developer merges feature branch "add-widget" to main
2. CI/CD deploys to pre-prod environments
3. Bug discovered in test

Rollback:
4. Maintainer runs "Rollback" workflow
5. Previous version deployed immediately to all pre-prod
6. Revert commit created on main

Fix:
7. Developer stays on "add-widget" branch, fixes the bug
8. Developer notifies maintainer they're ready

Re-merge:
9. Maintainer runs "Revert the Revert" workflow
10. Developer creates new PR from "add-widget"
11. PR merged, CI/CD deploys fixed version
```

---

## Troubleshooting

### Rollback didn't deploy

- Check the workflow logs for build/test failures
- The previous commit must still pass all tests

### "No revert commit found" error in Revert-the-Revert

- The workflow looks for commits starting with "Revert" in the last 20 commits
- If the revert is older, you'll need to do this manually:
  ```bash
  git revert <revert-commit-sha>
  git push origin main
  ```

### Developer's PR shows massive changes after revert-the-revert

- The developer may have merged main into their branch before the revert-the-revert
- Solution: Developer should reset their branch to before the merge, or cherry-pick only the fix commits

### Need to rollback production specifically

- The git-revert rollback workflow only affects pre-prod environments.
- `deploy-all.yml` only runs from `main`, so it cannot deploy an older commit or tag.
- Production is not yet enrolled for [restoring the previous release](#3-restore-the-previous-release). Until it is, revert on main and run `deploy-all.yml`, or contact the platform team.
