import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3334,
  },
  base: "/spa-app/",
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      external: "/cps-global-components.js",
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        includePaths: [
          path.resolve(__dirname, "node_modules"),
          path.resolve(__dirname, "src/styles"),
        ],
        api: "legacy",
        quietDeps: true,
        silenceDeprecations: [
          "mixed-decls",
          "slash-div",
          "import",
          "legacy-js-api",
        ],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "~govuk-frontend": path.resolve(
        __dirname,
        "./node_modules/govuk-frontend"
      ),
    },
  },
  publicDir: "public",
});
