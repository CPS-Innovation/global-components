import dynamicImportVars from "@rollup/plugin-dynamic-import-vars";

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
  plugins: [
    dynamicImportVars({
      errorWhenNoFilesFound: true,
    }),
  ],
};
