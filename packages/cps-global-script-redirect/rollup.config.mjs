import typescript from "@rollup/plugin-typescript";
import replace from "@rollup/plugin-replace";

export default {
  input: "src/index.ts",
  output: {
    file: "dist/script-redirect.js",
    format: "iife",
    name: "cpsScriptRedirect",
    sourcemap: true,
  },
  plugins: [
    replace({
      preventAssignment: true,
      values: {
        __SCRIPT_URL__: '"{{SCRIPT_URL}}"',
      },
    }),
    typescript({
      tsconfig: "./tsconfig.json",
      declaration: true,
      declarationDir: "./dist",
    }),
  ],
};
