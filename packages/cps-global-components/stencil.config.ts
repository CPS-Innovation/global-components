import { Config } from "@stencil/core";
import { sass } from "@stencil/sass";

export const config: Config = {
  namespace: "cps-global-header",
  outputTargets: [
    {
      type: "dist",
      esmLoaderPath: "../loader",
    },
    {
      type: "dist-custom-elements",
      customElementsExportBehavior: "bundle",
      externalRuntime: false,
      generateTypeDeclarations: true,
    },
    {
      type: "docs-readme",
    },
    {
      type: "www",
      serviceWorker: null, // disable service workers
      empty: false,
      copy: [{ src: "config.json", dest: "./build/config.json", warn: true }],
    },
  ],
  testing: {
    browserHeadless: "shell",
  },
  plugins: [sass()],
  devServer: {
    // 3333 is the default, but lets set it explicitly as we have references to this from the other apps
    port: 3333,
  },
  globalScript: "./src/config.ts",
};
