// Compiles src/govuk.scss to public/govuk/govuk-frontend.min.css and copies the
// referenced GOV.UK Frontend font/image assets alongside it.
//
// Output goes to public/ (Vite's publicDir) so it is served at /govuk/... by the
// dev server AND copied verbatim into dist/govuk/ on build — no Vite processing,
// so the stable filename and the relative asset paths survive untouched. Run
// before `vite`/`vite build` (see package.json). pnpm does not run pre/post
// lifecycle hooks by default, so this is chained explicitly rather than as
// `prebuild`.
import * as sass from "sass";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync, writeFileSync, cpSync, rmSync } from "node:fs";

const require = createRequire(import.meta.url);
const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(pkgRoot, "../..");

// Resolve the installed govuk-frontend so we copy assets from the exact version
// the Sass compile pulled in (its package.json exposes "./package.json").
const govukRoot = dirname(require.resolve("govuk-frontend/package.json"));
const govukAssets = resolve(govukRoot, "dist/govuk/assets");

const entry = resolve(pkgRoot, "src/govuk.scss");
const outDir = resolve(pkgRoot, "public/govuk");

const { css } = sass.compile(entry, {
  style: "compressed",
  loadPaths: [resolve(pkgRoot, "node_modules"), resolve(workspaceRoot, "node_modules")],
  // quietDeps silences deprecation warnings originating inside govuk-frontend.
  // Our own govuk.scss uses the legacy `@import` (govuk still ships @import-based
  // entry files), so silence just that one here.
  quietDeps: true,
  silenceDeprecations: ["import"],
});

rmSync(outDir, { recursive: true, force: true });
mkdirSync(resolve(outDir, "assets"), { recursive: true });
writeFileSync(resolve(outDir, "govuk-frontend.min.css"), css);

// Only fonts/ and images/ are referenced by the compiled CSS.
for (const dir of ["fonts", "images"]) {
  cpSync(resolve(govukAssets, dir), resolve(outDir, "assets", dir), { recursive: true });
}

console.log(`Built ${resolve(outDir, "govuk-frontend.min.css")} and copied fonts/images assets`);
