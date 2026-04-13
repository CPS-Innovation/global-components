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

## E2E Tests

E2E tests live in `e2e/tests/` and use **Jest + Puppeteer** (not Stencil). They run a real browser
against a local server (`e2e/helpers/server.ts`) serving the built component bundle.

```bash
# Run all e2e tests (builds all packages first, then runs tests)
pnpm -w test:e2e

# Run with logging to e2e.log
pnpm -w test:e2e:log
```

**Important notes for running e2e tests:**

- `test:e2e` calls `pnpm -w build` (full workspace build) before running tests. This takes a while
  but does not hang — be patient and use a sufficient timeout (300000ms).
- Do NOT use `run_in_background` for e2e tests. The full build + test pipeline produces output
  continuously; background mode makes it look like it's hanging when it's just building.
- Tests use `arrange()` to set up config/auth via HTTP headers, and `act()` to navigate the
  Puppeteer page. Config is passed as an encoded JSON header; auth is injected via
  `page.evaluateOnNewDocument`.

**Running a specific e2e test:**

The e2e package uses plain Jest (not Stencil), so you can target tests with `--testPathPattern`.
However, e2e tests run against a **built bundle copied into `e2e/harness/`**. The `test:e2e` script
handles this automatically, but when running tests individually you must prepare the harness first:

```bash
# Step 1: Full workspace build (skip if already done)
pnpm -w build

# Step 2: Rollup the bundle with build metadata and copy to harness
#   (this is what run-tests.sh does between build and test — without it, the harness serves a stale bundle)
pnpm --filter cps-global-components rollup --intro 'window.cps_global_components_build = window.cps_global_components_build || {Sha: "local", RunId: 0, Timestamp: "2000-01-01T00:00:00Z" };'
cp -r ./packages/cps-global-components/dist/cps-global-components.js ./e2e/harness

# Step 3: Run a specific test file
pnpm --filter e2e test -- --testPathPattern="menu"
```

If you have already run `pnpm -w test:e2e` (or steps 1-2) recently and haven't changed source code,
you can skip straight to step 3. The e2e tests themselves are fast (~20s); it's the build that takes time.

**Diagnosing e2e failures:**

- Test files are in `e2e/tests/*.test.ts` — read the failing test to understand the `arrange` setup
  (config, auth, contextIds) and what assertions it makes.
- The test server is in `e2e/helpers/server.ts` — it serves config from the `x-config` header and
  has mock endpoints for cms-session-hint, case data, etc.
- `e2e/helpers/arrange.ts` shows the base config that all tests merge into.
- `e2e/helpers/constants.ts` has the DOM locators used in assertions.
- If a test fails because the menu shows/hides unexpectedly, check whether the `contextIds` in the
  test's `arrange` call match what `feature-flags.ts` expects.

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

**Always brace your `if` statements.** Never write `if (cond) doThing();` or `if (cond) return x;`
on a single line — always use a block:
```ts
if (cond) {
  return x;
}
```
This applies to `else`, `else if`, `for`, and `while` too. The braces stay even when the body is
a single statement — diff noise and footguns when adding a second statement aren't worth saving
the line.

## Builds

We use `pnpm` and not `npm`.

Code and unit test files must build and be free of IDE build-preventing errors before you report back that a given
change is complete. After making changes, **actually run** the relevant build/test command and verify it passes
before reporting done. Do not assume changes compile — confirm it.

**Before handing back to the user, always run the full unit test suite:**
```bash
cd packages/cps-global-components && pnpm exec stencil test --spec -- --no-coverage
```
Do not rely on only running targeted tests for the files you changed — your changes may break other tests.

**`pnpm -w build` and `pnpm -r --filter` WILL HANG.** Never use them. Always use targeted builds by
`cd`-ing into the package directory and using `pnpm exec` directly:
```bash
cd packages/cps-global-os-handover && pnpm exec rollup -c rollup.config.mjs
cd packages/cps-global-components && pnpm exec stencil build
cd packages/cps-global-components && pnpm exec stencil test --spec -- --testPathPatterns="foo" --no-coverage
```

Do NOT use `run_in_background` for builds — run them in the foreground with a sufficient timeout
(120000ms for single package, 300000ms for full build) so that build errors are immediately visible.

For e2e tests, ask the user to run `pnpm -w test:e2e` themselves (it requires a full workspace build
which hangs when run from Claude). You can run individual e2e test files if the harness is already
prepared — see the E2E Tests section above.

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

## TypeScript Versions

There are three TypeScript versions in play — be aware of all three:

1. **Stencil's bundled TS** (check via `node -e "..." stencil.js`) — used for the actual
   `stencil build`. This is what matters for CI. You cannot use tsconfig options newer than
   this version (e.g. `ignoreDeprecations: "6.0"` will fail if Stencil bundles TS 5.x).
2. **Workspace TS** (`typescript` devDependency in root `package.json`) — pinned to match
   what the project supports. VS Code uses this when "Use Workspace Version" is selected.
3. **VS Code's bundled TS** — ships with VS Code updates and can jump major versions without
   warning. If IDE errors suddenly appear across the codebase, check whether VS Code is using
   its bundled version instead of the workspace version (bottom-right status bar).

When Stencil upgrades, check what TS version it bundles and consider aligning the workspace
root `typescript` dependency accordingly. The per-package `typescript` versions in `package.json`
files should also be kept in sync.

## Stencil Components

- Components use shadow DOM — be aware of styling and slot constraints
- State management via `@stencil/store`
- Config is validated with Zod schemas
- GDS (GOV.UK Design System) CSS classes are used for styling (e.g. `govuk-body`, `govuk-notification-banner`)

## MSAL / Auth — Guest Component Constraints

This project is a **guest web component** that lives on host app pages we do not control. The host
apps have their own MSAL instances (same Azure AD tenant, different client IDs) and their own
redirect flows. This means standard MSAL guidance that assumes you own the page does not apply here.

**Do NOT call `handleRedirectPromise()`.**  It picks up redirect state from the host app's MSAL
flows (shared via sessionStorage), tries to process it with our client ID, and causes AADSTS50196
redirect loops. This was deployed to test on 2026-04-02 and immediately broke auth for all users.
See the commented-out code and explanation in `create-msal-instance.ts`.

More broadly: any MSAL best-practice advice that assumes single-app-per-page ownership needs
scrutiny before applying here. Shared browser state (localStorage, sessionStorage, cookies) is
contested territory between our component and the host apps.
