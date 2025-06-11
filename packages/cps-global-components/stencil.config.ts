import { Config } from "@stencil/core";
import { sass } from "@stencil/sass";

export const config: Config = {
  namespace: "cps-global-components",
  outputTargets: [
    {
      type: "dist",
      esmLoaderPath: "../loader",
    },
    {
      type: "dist-custom-elements",
      externalRuntime: false,
      generateTypeDeclarations: true,
      includeGlobalScripts: true,
    },
    {
      type: "docs-readme",
    },
    {
      type: "www",
      serviceWorker: null, // disable service workers
      empty: false,
      copy: [
        { src: "config.json", dest: "./build/config.json", warn: false },
        { src: "config.js", dest: "./build/config.js", warn: false },
      ],
    },
  ],
  testing: {
    browserHeadless: "shell",
  },
  plugins: [
    sass({
      // Silence the annoying deprecation warnings from the govuk-frontend scss.
      //  However the deprecations are there for a reason, so if we or they upgrade
      //  then we may have to rework some of our code.
      //  In particular, I couldn't get @use working (instead of deprecated @import)
      //  although I don't know enough in this area to know if it is possible.
      quietDeps: true,
      silenceDeprecations: ["mixed-decls", "slash-div", "import"],
    }),
  ],
  devServer: {
    // 3333 is the default, but lets set it explicitly as we have references to this from the other apps
    port: 3333,
  },
  globalScript: "src/global-script.js",
};
