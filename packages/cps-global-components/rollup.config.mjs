import dynamicImportVars from "@rollup/plugin-dynamic-import-vars";

export default {
  input: "./dist/cps-global-header/cps-global-header.esm.js",

  output: [
    {
      file: "dist/cps-global-components.js",
      format: "esm", // ES modules
      sourcemap: true,
      inlineDynamicImports: true,
    },
  ],
  plugins: [
    dynamicImportVars({
      errorWhenNoFilesFound: true,
      exclude: "**/*.entry.js.map",
    }),
  ],
};
