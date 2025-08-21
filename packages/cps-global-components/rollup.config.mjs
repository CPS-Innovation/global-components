import dynamicImportVars from "@rollup/plugin-dynamic-import-vars";
import sourcemaps from "rollup-plugin-sourcemaps";

export default {
  input: "./dist/cps-global-components/cps-global-components.esm.js",
  output: [
    {
      file: "dist/cps-global-components.js",
      format: "es", // ES modules
      sourcemap: true,
      inlineDynamicImports: true,
    },
  ],
  // This tells Rollup to look for and use existing sourcemaps
  onwarn(warning, warn) {
    // Suppress sourcemap warnings if needed
    if (warning.code === "SOURCEMAP_ERROR") return;
    warn(warning);
  },
  plugins: [
    sourcemaps(),
    dynamicImportVars({
      errorWhenNoFilesFound: true,
    }),
  ],
};
