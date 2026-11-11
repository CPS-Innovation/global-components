/**
 * Loads an njs module into node for unit tests.
 *
 * The njs modules are plain ESM (`export default {...}`) in folders whose
 * package.json does not say "type": "module", so node would read a .js file as
 * CommonJS and reject the export. A copy with an .mjs extension is ESM to node,
 * with no bundler and nothing to install.
 *
 * `transform` edits the source before loading, e.g. to bake @@dropzone@@ tokens
 * the way the deploy does. Every load is a fresh copy, so module-level state
 * (and anything read from process.env at load time) never leaks between loads.
 */
const fs = require("fs")
const path = require("path")
const { pathToFileURL } = require("url")

const STAGE_DIR = path.join(__dirname, ".dist", "njs")
let loads = 0

const loadNjs = async (file, transform = (code) => code) => {
  fs.mkdirSync(STAGE_DIR, { recursive: true })
  const code = transform(fs.readFileSync(file, "utf8"))
  const copy = path.join(STAGE_DIR, `${path.basename(file, ".js")}.${process.pid}.${loads++}.mjs`)
  fs.writeFileSync(copy, code)
  return (await import(pathToFileURL(copy).href)).default
}

module.exports = { loadNjs }
