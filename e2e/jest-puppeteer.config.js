export default {
  server: {
    command: "tsx helpers/server.ts",
    port: 3000,
  },
  launch: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    // In CI we point Puppeteer at the runner's system Chrome (PUPPETEER_EXECUTABLE_PATH
    // is set by the workflow) rather than relying on Puppeteer's own download, which
    // is unreliable on the runner. Locally the var is unset, so Puppeteer falls back
    // to its downloaded browser.
    ...(process.env.PUPPETEER_EXECUTABLE_PATH
      ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
      : {}),
  },
  browserContext: "default",
};
