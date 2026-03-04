# Global Components

## Running Tests

The main component package (`cps-global-components`) uses **Stencil's test runner**, not bare Jest. Always run from the repo root:

```bash
# Targeted spec tests (use --testPathPatterns, not --testPathPattern)
npx stencil test --spec -- --testPathPatterns="<pattern>" --no-coverage

# Examples
npx stencil test --spec -- --testPathPatterns="get-case-defendant-headline" --no-coverage
npx stencil test --spec -- --testPathPatterns="replace-tags|extract-tags" --no-coverage
```

**Do not** use `npx jest` directly — it will fail to parse TypeScript.

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

## Style

Prefer `export const foo = () => ...` function declarations.
Avoid `class` wherever possible.
Functional is good - functions that "pipe" to other functions etc etc are easy to rationalise.

## Builds

Code and unit test files must build and be free of IDE build-preventing errors before you report back that a given
change is complete.
