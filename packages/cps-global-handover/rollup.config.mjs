import typescript from "@rollup/plugin-typescript";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

// Browser IIFE bundle. The script-injection HTML at the redirect endpoint
// (auth-handover.html, deployed to both Polaris and OS) loads this file via
// document.write. Bundles MSAL transitive CJS deps (@azure/msal-browser).
export default [
  {
    input: "src/auth-handover.ts",
    output: {
      file: "dist/auth-handover.js",
      format: "iife",
      // Module-level named exports (dispatchHandover, getConfig, HandoverConfig)
      // are for test-time consumption; the browser bundle just runs the boot
      // IIFE side-effect. `name` is required by rollup when exports exist on
      // an IIFE bundle even though we don't reference the global at runtime.
      name: "cpsGlobalHandover",
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
        inlineSources: true,
        sourceMap: true,
      }),
    ],
  },
];
