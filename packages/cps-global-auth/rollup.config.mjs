import typescript from "@rollup/plugin-typescript";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

// Browser IIFE bundle for global-components-msal-redirect.html. The workspace
// ES output (consumed by cps-global-components) is produced by tsc — see the
// `build` script in package.json. tsc also emits a per-file dist/msal-redirect.js
// from this same entry; rollup runs after tsc and overwrites it with the
// bundled IIFE output. Same pattern as cps-global-os-handover.
export default {
  input: "src/msal-redirect.ts",
  output: {
    file: "dist/msal-redirect.js",
    format: "iife",
    sourcemap: true,
    sourcemapExcludeSources: false,
  },
  plugins: [
    nodeResolve({ browser: true }),
    commonjs(),
    typescript({
      tsconfig: "./tsconfig.json",
      declaration: false,
      declarationMap: false,
      module: "esnext",
      sourceMap: true,
      inlineSources: true,
    }),
  ],
};
