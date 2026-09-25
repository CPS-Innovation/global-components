# Rollback Procedures

## Quick Reference

| Situation                                        | Action                                                          |
| ------------------------------------------------ | --------------------------------------------------------------- |
| Bad release in pre-prod (dev, test, uat)         | [Revert the PR](#1-roll-back-a-bad-release) — pre-prod redeploys itself |
| Bad release in production                        | [Revert the PR](#1-roll-back-a-bad-release), then run **"Deploy: all environments including prod"** |
| Developer ready to re-land a reverted feature    | [Re-land it through a PR](#2-re-land-a-reverted-feature)        |

> [!WARNING]
> **Do not use the "Rollback" or "Revert the Revert" workflows.** They have never been run, and as written they
> fail part way through — see [Why not the rollback workflows](#why-not-the-rollback-workflows).

---

## 1. Roll Back a Bad Release

**When to use:** a merged PR has broken something and needs to come out.

Every change to `main` goes through a pull request — the branch rules allow no direct pushes, for anyone — so a
rollback is a revert PR like any other.

### Steps

1. Open the **merged PR** that caused the problem on GitHub and click **"Revert"**. GitHub opens a new PR that
   undoes exactly that PR, even if other PRs have merged since.
2. Get it approved if the rules require it (e.g. changes under `.github/**`, other than workflows, need
   `@CPS-Innovation/rcms-platform-team`), and merge it.
3. **Pre-prod:** nothing more to do. The merge triggers **"Internal: ci-cd deploy all pre-prod environments"**,
   which rebuilds and deploys `main` to accessibility, dev, test and uat in about 5 minutes.
4. **Production:** run **Actions → "Deploy: all environments including prod"** from `main`.

### Before rolling back production

`deploy-all` deploys **everything on `main`**, not just the revert. If other PRs have merged since the last
production release, they go out too. Check what is pending first (the `deploy-check` skill, or compare `main`
against the last successful `deploy-all` run) and decide whether that is acceptable.

There is no way to deploy an older commit to production: `deploy-all` only runs from `main`, and refuses tags and
other branches.

---

## 2. Re-land a Reverted Feature

**When to use:** the reverted feature has been fixed and is ready to go back in.

### Why this needs care

`main` now contains the revert. If the developer merges `main` into their old feature branch, git applies the
revert too and **silently removes their feature**.

### Steps

1. Open the **merged revert PR** and click **"Revert"**. GitHub opens a PR that re-applies the original feature.
2. Check out that PR's branch and add the fix on top (commit it there, or cherry-pick the fix commits).
3. Get it reviewed and merge. Pre-prod redeploys itself; production goes out with the next `deploy-all`.

The result is one PR containing the feature plus its fix, reviewed as a whole.

---

## Why Not the Rollback Workflows

`.github/workflows/rollback.yml` ("Rollback: pre-prod environments to previous commit") and
`.github/workflows/revert-the-revert.yml` ("Utility: revert the revert (prepare for re-merge)") are still in the repository but have
**never been run**. Read against the current setup, they would not do what they appear to:

- **Their final step fails.** Both push a commit straight to `main` (`git push origin main`). The branch rules on
  `main` require a pull request and allow no bypass, so the push is rejected.
- **The rollback reports success anyway.** Its summary step runs as long as the deploy succeeded, so it says
  "Rollback Complete" and tells the developer to wait for "Revert the Revert" — although no revert was made. `main`
  still has the bad commit, and the next merge redeploys it.
- **It rolls back code but not config.** It rebuilds the previous commit's code, but the deploy steps take
  `config.<env>.json`, the notification file, `csp.json`, the `buildsha` stamp and the harnesses from the commit
  the workflow was run from — the bad one. A bad **config** change is therefore not rolled back at all.
- **It only goes back one commit** (`HEAD^`). If anything merged after the bad PR, it reverts the wrong one.
- **It never touches production.**

Until they are fixed or removed, use the [revert-PR procedure](#1-roll-back-a-bad-release) above.

---

## Workflow Locations

| Workflow                                  | File                                           | Status                                    |
| ----------------------------------------- | ---------------------------------------------- | ----------------------------------------- |
| Deploy: all environments including prod   | `.github/workflows/deploy-all.yml`             | In use — manual, `main` only              |
| Internal: ci-cd deploy all pre-prod environments | `.github/workflows/deploy-ci-cd-pre-prod.yml`  | In use — runs on every push to `main`     |
| Rollback: pre-prod environments to previous commit | `.github/workflows/rollback.yml`               | **Do not use** — see above                |
| Utility: revert the revert (prepare for re-merge) | `.github/workflows/revert-the-revert.yml`      | **Do not use** — see above                |

---

## Example Scenario

```
1. PR "add-widget" is merged to main
2. Pre-prod deploys automatically; a bug is found in test

Roll back:
3. On the merged "add-widget" PR, click Revert → revert PR is opened
4. Revert PR is merged → pre-prod redeploys without the widget
5. (If add-widget had reached production: run "Deploy: all environments including prod")

Re-land:
6. On the merged revert PR, click Revert → a PR re-applying add-widget is opened
7. The developer adds the fix to that PR's branch
8. PR reviewed and merged → pre-prod redeploys with the fixed widget
```

---

## Troubleshooting

### The Revert button is missing or fails

- GitHub cannot create the revert automatically if later changes conflict with it. Revert locally instead,
  on a new branch, and open a PR:
  ```bash
  git checkout -b revert-add-widget origin/main
  git revert -m 1 <merge-commit-sha>   # for a merge commit; omit -m 1 for a squash-merged PR
  git push -u origin revert-add-widget
  ```

### A developer's PR shows massive changes after re-landing

- They probably merged `main` (containing the revert) into their feature branch, which removed the feature.
  Start again from the "re-apply" PR in [step 2](#2-re-land-a-reverted-feature) and cherry-pick only the fix
  commits.
