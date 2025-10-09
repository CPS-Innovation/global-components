import { ElementHandle } from "puppeteer";
import { locators as L, constants as C } from "./constants";
export const waitForWithinHeader = async (locator: string) =>
  (await page.waitForFunction(
    (C) =>
      document
        .querySelector(C.HEADER_CONTAINER)
        ?.shadowRoot?.querySelector(locator),
    {
      timeout: 5000,
      polling: 100,
    },
    L
  )) as ElementHandle<HTMLDivElement>;
