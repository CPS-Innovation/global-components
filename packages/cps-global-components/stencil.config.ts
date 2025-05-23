import { Config } from "@stencil/core";
import { sass } from "@stencil/sass";

// Pick out ONLY the env values that we care about
// @ts-ignore
const { SURVEY_LINK, SHOULD_SHOW_HEADER, SHOULD_SHOW_MENU, APP_INSIGHTS_KEY, ENVIRONMENT } = process.env;

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
    },
  ],
  testing: {
    browserHeadless: "shell",
  },
  plugins: [sass()],

  env: { SURVEY_LINK, SHOULD_SHOW_HEADER, SHOULD_SHOW_MENU, APP_INSIGHTS_KEY, ENVIRONMENT },
  devServer: {
    // 3333 is the default, but lets set it explicitly as we have references to this from the other apps
    port: 3333,
  },
};
