const { TestEnvironment } = require("jest-environment-puppeteer");

class CustomPuppeteerEnvironment extends TestEnvironment {
  async setup() {
    await super.setup();

    // Set TEST_MODE for every page created
    const page = this.global.page;
    if (page) {
      await page.evaluateOnNewDocument(() => {
        window.__E2E_TEST_MODE__ = true;
      });
    }
  }

  async teardown() {
    await super.teardown();
  }
}

module.exports = CustomPuppeteerEnvironment;
