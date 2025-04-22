import { Config } from "@stencil/core";
import { sass } from "@stencil/sass";

export const config: Config = {
  namespace: "cps-global-nav",

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
    },
  ],
  testing: {
    browserHeadless: "new",
  },
  plugins: [sass()],
};
