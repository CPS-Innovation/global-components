#!/usr/bin/env node
/* check-no-credentials.js — fail the build if a token literal reached the bundle.
 *
 * WHY THIS EXISTS
 * Until 2026-09-01 a hardcoded JWT sat in case-locking-presence.ts and shipped in
 * dist/global-components.js: a dev token for the presence API's BearerTest scheme,
 * long expired, carrying a real email address. Nobody noticed because nothing
 * looked. The legacy client build has failed on exactly this for months —
 *
 *     grep -q "eyJ0eXAiOiJKV1Qi" "$OUT" && { echo "ERROR: a credential leaked"; exit 1; }
 *
 * — and this is the same gate for the Stencil bundle, which is the one estate
 * where a credential actually got out.
 *
 * WHAT IT LOOKS FOR
 * The STRUCTURE of a JWT — three base64url segments separated by dots — rather
 * than a header prefix. That distinction matters: matching on the header alone
 * flagged 400 files, because MSAL ships bare header constants that are not
 * credentials. A deliberately narrow net: it will not catch every conceivable
 * secret, but it catches the exact class of thing that got out, and costs nothing.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
// dist/ only. www/build is dev-server output, not shipped, and accumulates stale
// hashed files from every previous build.
const SEARCH_DIRS = ["dist"];

// A JWT is three base64url segments separated by dots, the first being a JSON
// object so it begins `eyJ`. Matching the STRUCTURE rather than a header prefix
// is what keeps this honest: MSAL ships bare header constants like
// "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0" ({"alg":"dir","enc":"A256GCM"}),
// which are not credentials and have no payload or signature after them. An
// earlier version of this file matched on the header alone and flagged 400 files.
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{8,}/g;

const files = [];
const walk = dir => {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // not built yet, or not present in this configuration
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (/\.(js|mjs|cjs|json|html|css)$/.test(entry.name)) {
      files.push(full);
    }
  }
};
SEARCH_DIRS.forEach(d => walk(path.join(ROOT, d)));

const hits = [];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  let match;
  JWT.lastIndex = 0;
  while ((match = JWT.exec(text)) !== null) {
    hits.push({
      file: path.relative(ROOT, file),
      line: text.slice(0, match.index).split("\n").length,
      preview: match[0].slice(0, 40) + "…",
    });
  }
}

if (hits.length) {
  console.error("\nERROR: a credential-shaped literal reached the build\n");
  for (const hit of hits) {
    console.error("  " + hit.file + ":" + hit.line + "  " + hit.preview);
  }
  console.error(
    "\nTokens must be acquired at runtime, never written into source. If this is a\n" +
      "test fixture, keep it in a .spec file — those are not bundled.\n"
  );
  process.exit(1);
}

console.log("ok   no credential literals in " + files.length + " built file(s)");
