import { ElementHandle } from "puppeteer";
import { locators as L, constants as C } from "./constants";

/** Ideally we would use
 * `page.waitForSelector("cps-global-header >>>> div[data-internal-root][data-initialisation-status]")`
 * syntax but at the time of writing that is being really flaky. This function
 * - is not flaky
 * - encapsulates our "wait for config to be ready" logic */
export const waitForHeaderReady = async () =>
  (await page.waitForFunction(
    (C) =>
      document
        .querySelector(C.HEADER_CONTAINER)
        ?.shadowRoot?.querySelector(C.HEADER_CONTENT_READY),
    {
      timeout: 5000,
      polling: 100,
    },
    L
  )) as ElementHandle<HTMLDivElement>;

export const act = async () => {
  await page.goto(C.LAUNCH_PAGE_URL);
  return await waitForHeaderReady();
};
