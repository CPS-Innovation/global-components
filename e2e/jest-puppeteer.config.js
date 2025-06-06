module.exports = {
  launch: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: process.env.PUPPETEER_EXEC_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  },
  browserContext: 'default',
};