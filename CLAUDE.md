# Global Components

## Available Skills

### `/renovate` - Consolidate Renovate PRs

Combines all open Renovate dependency PRs into a single uber-branch for one build/merge cycle.

**Usage:**
- Say "deal with renovate PRs" or `/renovate` to create the uber-PR
- After merging, say "renovate uber-PR is merged" to auto-close source PRs

**Features:**
- Fully autonomous (no prompting)
- Merges PRs chronologically to minimize conflicts
- Auto-resolves simple conflicts (package.json, lock files)
- Runs full validation: `build`, `test`, `test:e2e`, `test:proxy`
- Bisects to find and exclude PRs that break the build
- Two-phase: create PR first, close source PRs after you confirm merge
