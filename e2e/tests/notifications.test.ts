import { act } from "../helpers/act";
import { arrange } from "../helpers/arrange";
import { locators as L } from "../helpers/constants";
import { HTTPRequest } from "puppeteer";

// Live = includes now; Expired = ended before now; Future = starts after now.
const notificationsFile = {
  notifications: [
    {
      id: "live-important",
      severity: "important",
      bodyHtml: "<p>Live important notification body.</p>",
    },
    {
      id: "expired-info",
      severity: "info",
      bodyHtml: "<p>This one has expired.</p>",
      to: "2000-01-01T00:00:00Z",
    },
    {
      id: "future-warning",
      severity: "warning",
      bodyHtml: "<p>This one is scheduled for the future.</p>",
      from: "2099-01-01T00:00:00Z",
    },
    {
      id: "preview-only",
      severity: "info",
      bodyHtml: "<p>Preview mode only.</p>",
      previewModeRequired: true,
    },
  ],
};

let interceptListener: ((req: HTTPRequest) => void) | null = null;
let capturedPuts: Array<{ url: string; body: unknown }> = [];

const setupInterception = async (initialDismissed: string[] = []) => {
  capturedPuts = [];
  await page.setRequestInterception(true);

  interceptListener = (request: HTTPRequest) => {
    const url = request.url();

    if (url.endsWith("/notification.json")) {
      request.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(notificationsFile),
      });
      return;
    }

    if (url.includes("/state/dismissed-notifications")) {
      if (request.method() === "PUT") {
        capturedPuts.push({ url, body: JSON.parse(request.postData() || "null") });
        request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
        return;
      }
      request.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(initialDismissed),
      });
      return;
    }

    if (url.includes("/state/preview")) {
      request.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(null),
      });
      return;
    }

    request.continue();
  };

  page.on("request", interceptListener);
};

const waitForNotifications = async () =>
  page.waitForFunction(
    (locators) => {
      const header = document.querySelector(locators.HEADER_CONTAINER);
      const notifications = header?.shadowRoot?.querySelector(locators.NOTIFICATIONS_CONTAINER);
      return !!notifications?.querySelector(locators.NOTIFICATION_BANNER);
    },
    { timeout: 5000, polling: 100 },
    L
  );

const readNotificationState = async () =>
  page.evaluate((locators) => {
    const header = document.querySelector(locators.HEADER_CONTAINER);
    const container = header?.shadowRoot?.querySelector(locators.NOTIFICATIONS_CONTAINER);
    const banners = Array.from(container?.querySelectorAll(locators.NOTIFICATION_BANNER) ?? []) as HTMLElement[];
    return banners.map(b => ({
      title: b.querySelector(locators.NOTIFICATION_TITLE)?.textContent?.trim() ?? null,
      body: b.querySelector(".govuk-notification-banner__content")?.textContent?.trim() ?? null,
      hasDismissButton: !!b.querySelector(locators.NOTIFICATION_DISMISS_BUTTON),
    }));
  }, L);

afterEach(async () => {
  if (interceptListener) {
    page.off("request", interceptListener);
    interceptListener = null;
  }
  await page.setRequestInterception(false);
  await page.goto("about:blank");
});

describe("Notifications", () => {
  it("renders only the notification that is in its date window and not preview-gated", async () => {
    await setupInterception();
    await arrange({ config: { SHOW_NOTIFICATIONS: true } });

    await act();
    await waitForNotifications();

    const banners = await readNotificationState();
    expect(banners).toHaveLength(1);
    expect(banners[0].title).toBe("Important");
    expect(banners[0].body).toContain("Live important notification body.");
    expect(banners[0].hasDismissButton).toBe(true);
  });

  it("hides dismissed notifications on initial load", async () => {
    await setupInterception(["live-important"]);
    await arrange({ config: { SHOW_NOTIFICATIONS: true } });

    await act();

    // Wait for header to be initialised, then confirm no banner rendered.
    await page.waitForFunction(
      (locators) => {
        const header = document.querySelector(locators.HEADER_CONTAINER);
        return !!header?.shadowRoot?.querySelector("div[data-initialisation-status='complete']");
      },
      { timeout: 5000, polling: 100 },
      L
    );
    await new Promise(r => setTimeout(r, 300));

    const banners = await readNotificationState();
    expect(banners).toEqual([]);
  });

  it("PUTs the new dismissed list and removes the banner when the user dismisses it", async () => {
    await setupInterception();
    await arrange({ config: { SHOW_NOTIFICATIONS: true } });

    await act();
    await waitForNotifications();

    // Click dismiss via the shadow-DOM-bridged light-DOM button.
    await page.evaluate((locators) => {
      const header = document.querySelector(locators.HEADER_CONTAINER);
      const button = header?.shadowRoot?.querySelector(
        `${locators.NOTIFICATIONS_CONTAINER} ${locators.NOTIFICATION_BANNER} ${locators.NOTIFICATION_DISMISS_BUTTON}`
      ) as HTMLButtonElement | null;
      button?.click();
    }, L);

    // Wait for the banner to disappear from the DOM.
    await page.waitForFunction(
      (locators) => {
        const header = document.querySelector(locators.HEADER_CONTAINER);
        const container = header?.shadowRoot?.querySelector(locators.NOTIFICATIONS_CONTAINER);
        return !container?.querySelector(locators.NOTIFICATION_BANNER);
      },
      { timeout: 5000, polling: 100 },
      L
    );

    expect(capturedPuts).toHaveLength(1);
    expect(capturedPuts[0].url).toContain("/state/dismissed-notifications");
    expect(capturedPuts[0].body).toEqual(["live-important"]);
  });
});
