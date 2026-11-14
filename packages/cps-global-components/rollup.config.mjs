import sourcemaps from "rollup-plugin-sourcemaps";
import MagicString from "magic-string";

// Plugin to auto-call defineCustomElements after the bundle loads
// Uses MagicString to preserve sourcemaps
function autoDefinePlugin() {
  return {
    name: "auto-define-custom-elements",
    renderChunk(code) {
      // Find the `<internalName> as defineCustomElements` export alias and append a call to it so the
      //  bundle self-registers its custom elements. The internal name is a minified JS identifier,
      //  which can contain `$`/`_` (terser uses these once it runs out of short names) — so match
      //  [\w$], not just \w. The identifier quantifier is bounded ({1,64}, far beyond any mangled
      //  name) so the match is linear, with no super-linear backtracking (ReDoS / sonar S5852).
      const exportMatch = code.match(/([\w$]{1,64})\s+as\s+defineCustomElements/);
      if (exportMatch) {
        const internalName = exportMatch[1];
        const s = new MagicString(code);
        s.append(`\n${internalName}();`);
        return {
          code: s.toString(),
          map: s.generateMap({ hires: true }),
        };
      }
      return null;
    },
  };
}

// The build stamp (window.cps_global_components_build) arrives as the BUILD_INFO env var, not as
//  `--intro` on the command line. The `rollup` package.json script chains another command after
//  rollup, and pnpm appends CLI args to the END of a script — so a `--intro` passed through
//  `pnpm run rollup` lands on that last command and rollup never sees it. That is how every bundle
//  shipped without a build stamp from 2026-09-02 until this was moved here.
export default {
  input: "./dist/custom-elements/index.js",
  output: [
    {
      file: "dist/global-components.js",
      format: "es",
      intro: process.env.BUILD_INFO ?? "",
      sourcemap: true,
      sourcemapExcludeSources: false,
    },
  ],
  onwarn(warning, warn) {
    if (warning.code === "SOURCEMAP_ERROR") return;
    warn(warning);
  },
  plugins: [sourcemaps(), autoDefinePlugin()],
};
