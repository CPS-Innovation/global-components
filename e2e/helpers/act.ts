import { ElementHandle } from "puppeteer";
import { LOCATORS as L } from "./constants";

/** Ideally we would use
 * `page.waitForSelector("cps-global-header >>>> div[data-internal-root][data-initialisation-status]")`
 * syntax but at the time of writing that is being really flaky. This function
 * - is not flaky
 * - encapsulates our "wait for config to be ready" logic */
const waitForHeaderReady = async () =>
  (await page.waitForFunction(
    (C) =>
      document
        .querySelector(C.HEADER_CONTAINER)
        ?.shadowRoot?.querySelector(C.HEADER_CONTENT_READY),
    {
      timeout: 1000,
      polling: 100,
    },
    L
  )) as ElementHandle<HTMLDivElement>;

export const act = async () => {
  await page.goto(L.LAUNCH_PAGE_URL);
  return await waitForHeaderReady();
};
