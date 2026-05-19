import typescript from "@rollup/plugin-typescript";
import replace from "@rollup/plugin-replace";

export default {
  input: "src/index.ts",
  output: {
    file: "dist/cps-global-components.js",
    format: "iife",
    name: "cpsScriptRedirect",
    sourcemap: false,
  },
  plugins: [
    replace({
      preventAssignment: true,
      values: {
        __SCRIPT_URL__: '"{{SCRIPT_URL}}"',
        __BEACON_URL__: '"{{BEACON_URL}}"',
      },
    }),
    typescript({
      tsconfig: "./tsconfig.json",
      declaration: true,
      declarationDir: "./dist",
    }),
  ],
};
