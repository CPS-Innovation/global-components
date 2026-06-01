/**
 * Puppeteer workspace configuration.
 *
 * `skipDownload` disables Puppeteer's *automatic* browser download that would
 * otherwise run during every `pnpm install`. We have two `puppeteer` instances
 * in the workspace (it's peer-resolved against both TypeScript 5.9 and 6.0), so
 * their postinstall `install.mjs` scripts run concurrently and download the same
 * Chrome build into the same shared `~/.cache/puppeteer` directory at the same
 * time — the parallel writes corrupt it (browser folder present, executable
 * missing) and fail `pnpm install` in every job that runs it (build-and-test,
 * repo-security-scan, proxy-tests, …).
 *
 * cosmiconfig resolves this file globally (upward from the cwd), so it applies
 * to every Puppeteer instance in the workspace.
 *
 * The browser is still installed where it's needed:
 *  - CI (build-and-test): a dedicated workflow step runs
 *    `puppeteer browsers install chrome` with a step-level
 *    `PUPPETEER_SKIP_DOWNLOAD=false`, which overrides the skip here and downloads
 *    Chrome as a single serial step (no race). A GitHub Actions step env is
 *    reliably exported to the shell — an inline `VAR=val` prefix in a pnpm
 *    postinstall script is NOT, which is why the install lives in the workflow.
 *  - Local dev: the `e2e` package's `postinstall` runs an explicit
 *    `puppeteer browsers install chrome`; an explicit browser arg installs even
 *    with `skipDownload` set, so developers still get Chrome on install.
 *
 * e2e launches headless full Chrome (Puppeteer's default), so Chrome is the only
 * browser we need.
 */
module.exports = {
  skipDownload: true,
};
