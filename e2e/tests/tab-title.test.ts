import { act } from "../helpers/act";
import { arrange, ArrangeProps } from "../helpers/arrange";
import { constants as C } from "../helpers/constants";
import { DeepPartial } from "../helpers/utils";
import { HTTPRequest } from "puppeteer";

const settings: DeepPartial<ArrangeProps> = {
  config: {
    SHOW_MENU: true,
    GATEWAY_URL: C.GATEWAY_URL,
    CONTEXTS: [
      {
        msalRedirectUrl: "not-used",
        contexts: [
          { contextIds: "case", path: "/cases/(?<caseId>\\d+)" },
          { contextIds: "not-case", path: ".*" },
        ],
      },
    ],
    LINKS: [],
    FEATURE_FLAG_MENU_USERS: { generallyAvailable: true },
  },
};

const simulateSpaNavigation = (path: string) =>
  page.evaluate((p) => {
    history.pushState({}, "", p);
    (window as any).navigation?.dispatchEvent(new Event("navigatesuccess"));
  }, path);

let interceptListener: ((req: HTTPRequest) => void) | null = null;

const setupPreviewInterception = async () => {
  await page.setRequestInterception(true);

  interceptListener = (request: HTTPRequest) => {
    const url = request.url();
    if (url.includes("/state/preview")) {
      request.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ tabTitleUrn: true }),
      });
      return;
    }
    request.continue();
  };

  page.on("request", interceptListener);
};

afterEach(async () => {
  if (interceptListener) {
    page.off("request", interceptListener);
    interceptListener = null;
  }
  await page.setRequestInterception(false);
  // Reset page state so titles and component state don't leak between tests
  await page.goto("about:blank");
});

describe("Tab title", () => {
  it("should prepend URN to the tab title when on a case context", async () => {
    await setupPreviewInterception();
    await arrange(settings);
    await act("/cases/321");

    await page.waitForFunction(
      (prefix: string) => document.title.startsWith(prefix),
      { timeout: 5000, polling: 100 },
      `${C.URN_PREFIX}321`
    );

    const title = await page.title();
    expect(title).toContain(`${C.URN_PREFIX}321`);
    // Empty base title: just the URN, no trailing separator
    expect(title).toBe(`${C.URN_PREFIX}321`);
  });

  it("should remove URN from the tab title when navigating to a non-case context", async () => {
    await setupPreviewInterception();
    await arrange(settings);
    await act("/cases/321");

    await page.waitForFunction(
      (prefix: string) => document.title.startsWith(prefix),
      { timeout: 5000, polling: 100 },
      `${C.URN_PREFIX}321`
    );

    await simulateSpaNavigation("/some-other-page");

    await page.waitForFunction(
      (prefix: string) => !document.title.startsWith(prefix),
      { timeout: 5000, polling: 100 },
      `${C.URN_PREFIX}`
    );

    expect(await page.title()).not.toContain(`${C.URN_PREFIX}321`);
  });

  it("should update the URN when navigating from one case to another", async () => {
    await setupPreviewInterception();
    await arrange(settings);
    await act("/cases/321");

    await page.waitForFunction(
      (prefix: string) => document.title.startsWith(prefix),
      { timeout: 5000, polling: 100 },
      `${C.URN_PREFIX}321`
    );

    await simulateSpaNavigation("/cases/456");

    await page.waitForFunction(
      (prefix: string) => document.title.startsWith(prefix),
      { timeout: 5000, polling: 100 },
      `${C.URN_PREFIX}456`
    );

    expect(await page.title()).toContain(`${C.URN_PREFIX}456`);
    expect(await page.title()).not.toContain(`${C.URN_PREFIX}321`);
  });

  it("should not prepend URN when preview flag is disabled", async () => {
    // No preview interception — preview will 404, flag is off
    await arrange(settings);
    await act("/cases/321");

    await page.waitForFunction(
      () => {
        const el = document.querySelector("cps-global-header");
        return el?.shadowRoot?.querySelector("div[data-initialisation-status='complete']");
      },
      { timeout: 5000, polling: 100 }
    );

    await new Promise((r) => setTimeout(r, 500));

    expect(await page.title()).not.toContain(`${C.URN_PREFIX}`);
  });
});
