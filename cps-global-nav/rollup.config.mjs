import dynamicImportVars from "@rollup/plugin-dynamic-import-vars";

export default {
  input: "./dist/cps-global-nav/cps-global-nav.esm.js",

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
    }),
  ],
};
