#!/usr/bin/env node
/**
 * Our feature confs load side by side: the deployed new-generation config does
 * `include features/*\/*.conf;` in one server block, next to Polaris's own
 * locations. Two confs defining the same location is not a precedence question —
 * nginx refuses to START ("duplicate location"), and the whole proxy is down.
 *
 * This is the static half of that guard: every conf in this repo, plus our copy of
 * Polaris's main confs, must between them define each location once. (The deploy
 * half — an old module name still on the box beside its successor — is
 * deploy.local.sh's job, because only the box knows what is deployed.)
 *
 * An exact-match location of ours over a REGEX of Polaris's is fine and
 * deliberate (state/preview, the CMS frameset shell): different modifiers, not a
 * duplicate. What is caught is the same modifier with the same pattern.
 */

const path = require("path")
const fs = require("fs")

const CONFIG_DIR = path.join(__dirname, "..")

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    passed++
    console.log(`  \x1b[32m✓\x1b[0m ${name}`)
  } catch (err) {
    failed++
    console.log(`  \x1b[31m✗\x1b[0m ${name}`)
    console.log(`    ${err.message}`)
  }
}

// `location [=|~|~*|^~|@]pattern {` — the pattern may be quoted (a regex with braces).
const LOCATION = /^\s*location\s+(=|~\*|~|\^~)?\s*("[^"]+"|@?\S+)\s*\{/gm

function locationsOf(file) {
  const text = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n")
  const found = []
  let m
  LOCATION.lastIndex = 0
  while ((m = LOCATION.exec(text)) !== null) {
    found.push(`${m[1] || ""} ${m[2].replace(/^"|"$/g, "")}`.trim())
  }
  return found
}

const ourConfs = fs
  .readdirSync(CONFIG_DIR)
  .filter((d) => d.startsWith("global-components.") && fs.statSync(path.join(CONFIG_DIR, d)).isDirectory())
  .map((d) => path.join(CONFIG_DIR, d, `${d}.conf`))
  .filter((f) => fs.existsSync(f))

const polarisConfs = [path.join(CONFIG_DIR, "main", "global-components.conf")]

console.log("=".repeat(60))
console.log("feature confs — load side by side")
console.log("=".repeat(60))

test("every feature folder has its conf (the layout deploy.local.sh assumes)", () => {
  if (ourConfs.length < 4) {
    throw new Error(`found only: ${ourConfs.map((f) => path.basename(f)).join(", ")}`)
  }
})

test("no location is defined twice across our confs and Polaris's", () => {
  const seen = new Map()
  const dupes = []
  for (const file of [...polarisConfs, ...ourConfs]) {
    for (const loc of locationsOf(file)) {
      const prior = seen.get(loc)
      if (prior) {
        dupes.push(`${loc}  (${prior} and ${path.basename(file)})`)
      } else {
        seen.set(loc, path.basename(file))
      }
    }
  }
  if (dupes.length) {
    throw new Error("duplicate locations:\n      " + dupes.join("\n      "))
  }
})

test("each module imports its own .js from its own features/ folder, under a unique name", () => {
  const names = new Map()
  for (const file of ourConfs) {
    const stem = path.basename(file, ".conf")
    const text = fs.readFileSync(file, "utf8")
    const imports = Array.from(text.matchAll(/^\s*js_import\s+(\w+)\s+from\s+(\S+);/gm))
    for (const [, name, from] of imports) {
      if (from !== `templates/features/${stem}/${stem}.js`) {
        throw new Error(`${stem} imports ${from}`)
      }
      if (names.has(name)) {
        throw new Error(`js_import name ${name} used by ${names.get(name)} and ${stem}`)
      }
      names.set(name, stem)
    }
  }
})

// nginx keeps variable names in a hash whose buckets are variables_hash_bucket_size
// (64 by default) bytes. A name of roughly 47+ characters cannot fit one, and nginx
// refuses to START ("could not build variables_hash") — the whole proxy down. Seen
// 2026-11-10 with $gloco_os_london_dublin_oapps_switch_config_blob. Polaris owns
// the http block, so we keep our names well inside the default rather than raise it.
const MAX_VARIABLE_NAME = 32

test(`every variable our confs define is at most ${MAX_VARIABLE_NAME} characters`, () => {
  const tooLong = []
  for (const file of ourConfs) {
    const text = fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => !/^\s*#/.test(l))
      .join("\n")
    const defined = [
      ...Array.from(text.matchAll(/\b(?:set|js_set|js_var)\s+\$(\w+)/g), (m) => m[1]),
      ...Array.from(text.matchAll(/\bmap\s+\S+\s+\$(\w+)/g), (m) => m[1]),
      ...Array.from(text.matchAll(/\(\?P?<(\w+)>/g), (m) => m[1]),
    ]
    for (const name of defined) {
      if (name.length > MAX_VARIABLE_NAME) {
        tooLong.push(`$${name} (${name.length}) in ${path.basename(file)}`)
      }
    }
  }
  if (tooLong.length) {
    throw new Error("variable names too long:\n      " + tooLong.join("\n      "))
  }
})

// The unit tests run the njs in node, which accepts syntax njs does not. njs 0.8.5
// rejects an optional catch binding (`catch {`) when it loads the module, so nginx
// does not start. tsc used to rewrite it; nothing does now (plain JS since 2026-11-10).
// The docker layers are the real njs check; this catches the one we have tripped on.
test("no njs module uses syntax njs rejects", () => {
  const modules = [...ourConfs.map((f) => f.replace(/\.conf$/, ".js")), path.join(CONFIG_DIR, "main", "global-components.js")]
  const found = []
  for (const file of modules.filter((f) => fs.existsSync(f))) {
    fs.readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (/\bcatch\s*\{/.test(line) && !/^\s*(\/\/|\*)/.test(line)) {
          found.push(`${path.basename(file)}:${i + 1} optional catch binding`)
        }
      })
  }
  if (found.length) {
    throw new Error("\n      " + found.join("\n      "))
  }
})

// The modules this repo used to deploy under other names. Their folders must not
// come back: deployed beside their successors, they duplicate every location.
test("no folder carries a retired module name", () => {
  for (const retired of ["cms-auth-presence", "cms-auth-v2", "case-locking", "polaris-non-ddei", "multi-os-domain-testing"]) {
    if (fs.existsSync(path.join(CONFIG_DIR, `global-components.${retired}`))) {
      throw new Error(`global-components.${retired} is back`)
    }
  }
})

console.log("\n" + "=".repeat(60))
console.log(`Results: ${passed} passed, ${failed} failed`)
console.log("=".repeat(60))
process.exit(failed > 0 ? 1 : 0)
