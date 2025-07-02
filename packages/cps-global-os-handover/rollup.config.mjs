import typescript from "@rollup/plugin-typescript";
import { nodeResolve } from "@rollup/plugin-node-resolve";

export default [
  // ES and CJS builds with external dependencies
  {
    input: "src/index.ts",
    output: [
      {
        file: "dist/index.js",
        format: "es",
        sourcemap: true,
      },
    ],
    plugins: [
      nodeResolve(),
      typescript({
        tsconfig: "./tsconfig.json",
        declaration: true,
        declarationDir: "./dist",
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
    },
    plugins: [
      nodeResolve({
        browser: true,
      }),
      typescript({
        tsconfig: "./tsconfig.json",
        declaration: false,
        module: "esnext",
      }),
    ],
  },
];
