import sourcemaps from "rollup-plugin-sourcemaps";
import MagicString from "magic-string";

// Plugin to auto-call defineCustomElements after the bundle loads
// Uses MagicString to preserve sourcemaps
function autoDefinePlugin() {
  return {
    name: "auto-define-custom-elements",
    renderChunk(code) {
      // Find the defineCustomElements function and add a call to it
      const exportMatch = code.match(/export\s*\{[^}]*?(\w+)\s+as\s+defineCustomElements[^}]*\}/);
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

export default {
  input: "./dist/custom-elements/index.js",
  output: [
    {
      file: "dist/cps-global-components.js",
      format: "es",
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
