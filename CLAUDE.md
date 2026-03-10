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

We use `pnpm` and not `npm`.

Code and unit test files must build and be free of IDE build-preventing errors before you report back that a given
change is complete. After making changes, **actually run** the relevant build/test command and verify it passes
before reporting done. Do not assume changes compile — confirm it.

## Workflow

When I share a plan, question, or context — discuss and confirm before implementing unless I explicitly say
"go ahead" or "implement this". Default to suggesting, not doing.

When I say "sanity check" — I've already made changes myself. Review what I've done for correctness, edge cases,
and consistency with the codebase. Don't rewrite — just flag issues.

## Proxy Layer (nginx / njs)

- Proxy config lives in `infra/proxy/config/`
- njs modules are TypeScript, compiled to JS for nginx
- Prefer `process.env["VAR"]` in njs over `js_var` nginx directives
- Integration tests: `pnpm -w test:proxy` (runs via Docker — can hang; don't retry indefinitely)
- When debugging proxy issues, ask for diagnostic output (HTTP responses, logs) rather than guessing

## Stencil Components

- Components use shadow DOM — be aware of styling and slot constraints
- State management via `@stencil/store`
- Config is validated with Zod schemas
- GDS (GOV.UK Design System) CSS classes are used for styling (e.g. `govuk-body`, `govuk-notification-banner`)
