import typescript from "@rollup/plugin-typescript";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

export default [
  // ES and CJS builds with external dependencies
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
  // Browser build - bundle everything
  {
    input: "src/auth-handover.ts",
    output: {
      file: "dist/auth-handover.js",
      format: "iife",
      sourcemap: true,
      sourcemapExcludeSources: false,
    },
    plugins: [
      nodeResolve({
        browser: true,
      }),
      // commonjs plugin for transitive CJS deps brought in via @azure/msal-browser
      // (folded MSAL termination path — handleMsalTermination from cps-global-auth).
      commonjs(),
      typescript({
        tsconfig: "./tsconfig.json",
        declaration: false,
        declarationMap: false,
        module: "esnext",
        inlineSources: true,
        sourceMap: true,
      }),
    ],
  },
];
