import typescript from "@rollup/plugin-typescript";
import { nodeResolve } from "@rollup/plugin-node-resolve";

// Workspace ES module consumed by other packages (host bundle, cps-global-handover).
// The browser bundle that used to live alongside (auth-handover.js) has moved to
// the cps-global-handover package — see packages/cps-global-handover/rollup.config.mjs.
export default [
  {
    input: "src/index.ts",
    output: [
      {
        file: "dist/index.js",
        format: "es",
        sourcemap: true,
        sourcemapExcludeSources: false,
      },
    ],
    plugins: [
      nodeResolve(),
      typescript({
        tsconfig: "./tsconfig.json",
        declaration: true,
        declarationDir: "./dist",
        inlineSources: true,
        sourceMap: true,
      }),
    ],
    external: [],
  },
];
