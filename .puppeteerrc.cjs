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
 * The browser is still installed — the `e2e` package's `postinstall` runs
 * `PUPPETEER_SKIP_DOWNLOAD=false npx puppeteer browsers install chrome`. That env
 * var, set only for that one process, overrides the `skipDownload` here so the
 * install actually downloads; the two package postinstalls (separate processes
 * without the env) still read this file and skip, so there is only ever one
 * writer — no race. e2e launches headless full Chrome (Puppeteer's default), so
 * Chrome is the only browser we need.
 */
module.exports = {
  skipDownload: true,
};
