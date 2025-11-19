export default {
  server: {
    command: "tsx helpers/server.ts",
    port: 3000,
  },
  launch: {
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    // executablePath:
    //   process.env.PUPPETEER_EXEC_PATH ||
    //   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  },
  browserContext: "default",
};
