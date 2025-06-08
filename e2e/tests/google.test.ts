import { Config } from "cps-global-configuration";
import { encode } from "../helpers/encoding";

const before = async (config: Config) => {
  await page.setExtraHTTPHeaders({
    "x-config": encode(JSON.stringify(config)),
  });
  await page.goto("http://localhost:3000");
};

describe("Global header", () => {
  it('should contain text "CPS" on the page', async () => {
    await before(config);
    const header = await page.waitForSelector("cps-global-header");
    await expect(header).toMatchElement("cps-global-banner");
  });
});

const config: Config = {
  ENVIRONMENT: "e2e",
  APP_INSIGHTS_KEY: "",
  SURVEY_LINK: "https://forms.office.com/e/Cxmsq5xTWx",
  SHOULD_SHOW_HEADER: true,
  SHOULD_SHOW_MENU: true,
  CONTEXTS: [
    {
      paths: ["http://localhost:3000"],
      contexts: "context-a",
    },
  ],
  LINKS: [
    {
      label: "Link A",
      level: 0,
      href: "/",
      activeContexts: "context-a",
    },
  ],
};
