import { HTTPRequest } from "puppeteer";
import { act } from "../helpers/act";
import { arrange, ArrangeProps } from "../helpers/arrange";
import { locators as L } from "../helpers/constants";
import { DeepPartial } from "../helpers/utils";

// ─── Mock data ───────────────────────────────────────────────────────────────

const MOCK_CASES = [
  { caseId: 123, urn: "12AB3456789", description: "Smith, John" },
  { caseId: 456, urn: "34CD5678901", description: "Jones, Jane" },
  { caseId: 789, urn: "56EF7890123", description: "Brown, Bob" },
];

const NAVIGATE_URL = "/cases/{caseId}?urn={urn}";

const recentCasesSettings: DeepPartial<ArrangeProps> = {
  config: {
    RECENT_CASES_NAVIGATE_URL: NAVIGATE_URL,
    RECENT_CASES_LIST_LENGTH: 10,
    SHOW_RECENT_CASES: true,
  },
};

// ─── Interception helpers ────────────────────────────────────────────────────

type InterceptionConfig = {
  previewResponse?: object;
  recentCasesResponse?: object | null;
  recentCasesStatus?: number;
  holdRecentCases?: boolean;
};

let interceptListener: ((req: HTTPRequest) => void) | null = null;
let heldRequest: HTTPRequest | null = null;

const setupInterception = async ({
  previewResponse = { myRecentCases: true },
  recentCasesResponse = MOCK_CASES,
  recentCasesStatus = 200,
  holdRecentCases = false,
}: InterceptionConfig = {}) => {
  await page.setRequestInterception(true);

  interceptListener = (request: HTTPRequest) => {
    const url = request.url();

    if (url.includes("/state/preview")) {
      request.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(previewResponse),
      });
      return;
    }

    if (url.includes("/state/recent-cases") && request.method() === "GET") {
      if (holdRecentCases) {
        heldRequest = request;
        return; // don't respond — hold it
      }
      request.respond({
        status: recentCasesStatus,
        contentType: "application/json",
        body:
          recentCasesStatus >= 400
            ? "Internal Server Error"
            : JSON.stringify(recentCasesResponse),
      });
      return;
    }

    request.continue();
  };

  page.on("request", interceptListener);
};

const teardownInterception = async () => {
  if (heldRequest) {
    try {
      await heldRequest.abort();
    } catch {
      // already handled
    }
    heldRequest = null;
  }
  if (interceptListener) {
    page.off("request", interceptListener);
    interceptListener = null;
  }
  await page.setRequestInterception(false);
};

// ─── Shadow DOM helpers ──────────────────────────────────────────────────────

const queryRecentCasesShadow = (selector: string) =>
  page.evaluate(
    (container, sel) => {
      const el = document.querySelector(container);
      return !!el?.shadowRoot?.querySelector(sel);
    },
    L.RECENT_CASES_CONTAINER,
    selector
  );

const waitForRecentCasesContent = (selector: string, timeout = 5000) =>
  page.waitForFunction(
    (container: string, sel: string) => {
      const el = document.querySelector(container);
      return !!el?.shadowRoot?.querySelector(sel);
    },
    { timeout, polling: 100 },
    L.RECENT_CASES_CONTAINER,
    selector
  );

const getRecentCasesLinks = () =>
  page.evaluate(
    (container, linkSel) => {
      const el = document.querySelector(container);
      if (!el?.shadowRoot) return [];
      const links = el.shadowRoot.querySelectorAll(linkSel);
      return Array.from(links).map((a) => ({
        href: (a as HTMLAnchorElement).getAttribute("href"),
        text: (a as HTMLAnchorElement).textContent?.trim(),
      }));
    },
    L.RECENT_CASES_CONTAINER,
    L.RECENT_CASES_LINK
  );

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Recent cases", () => {
  afterEach(async () => {
    await teardownInterception();
  });

  it("renders nothing when SHOW_RECENT_CASES is false", async () => {
    await setupInterception({ recentCasesResponse: MOCK_CASES });
    await arrange({
      config: {
        RECENT_CASES_NAVIGATE_URL: NAVIGATE_URL,
        RECENT_CASES_LIST_LENGTH: 10,
        SHOW_RECENT_CASES: false,
      },
    });

    await act();

    await new Promise((r) => setTimeout(r, 500));

    const hasWrapper = await queryRecentCasesShadow(L.RECENT_CASES_WRAPPER);
    expect(hasWrapper).toBe(false);
  });

  it("renders nothing when recent cases config is not set", async () => {
    // No interception needed — preview/recent-cases will 404
    // and config has no RECENT_CASES_NAVIGATE_URL or RECENT_CASES_LIST_LENGTH
    await arrange({});

    await act();

    const hasWrapper = await queryRecentCasesShadow(L.RECENT_CASES_WRAPPER);
    expect(hasWrapper).toBe(false);
  });

  it("renders a list of cases when data is returned", async () => {
    await setupInterception({ recentCasesResponse: MOCK_CASES });
    await arrange(recentCasesSettings);

    await act();
    await waitForRecentCasesContent(L.RECENT_CASES_LIST);

    const hasList = await queryRecentCasesShadow(L.RECENT_CASES_LIST);
    expect(hasList).toBe(true);

    const links = await getRecentCasesLinks();
    expect(links).toHaveLength(MOCK_CASES.length);
    expect(links[0]).toEqual({
      href: "/cases/123?urn=12AB3456789",
      text: "12AB3456789 - Smith, John",
    });
    expect(links[1]).toEqual({
      href: "/cases/456?urn=34CD5678901",
      text: "34CD5678901 - Jones, Jane",
    });
    expect(links[2]).toEqual({
      href: "/cases/789?urn=56EF7890123",
      text: "56EF7890123 - Brown, Bob",
    });
  });

  it("renders link text without hyphen when description is empty", async () => {
    const casesWithEmptyDescription = [
      { caseId: 123, urn: "12AB3456789", description: "" },
      { caseId: 456, urn: "34CD5678901", description: "Jones, Jane" },
    ];
    await setupInterception({ recentCasesResponse: casesWithEmptyDescription });
    await arrange(recentCasesSettings);

    await act();
    await waitForRecentCasesContent(L.RECENT_CASES_LIST);

    const links = await getRecentCasesLinks();
    expect(links[0]).toEqual({
      href: "/cases/123?urn=12AB3456789",
      text: "12AB3456789",
    });
    expect(links[1]).toEqual({
      href: "/cases/456?urn=34CD5678901",
      text: "34CD5678901 - Jones, Jane",
    });
  });

  it("renders nothing when API returns empty array and no no-cases slot is provided", async () => {
    await setupInterception({ recentCasesResponse: [] });
    await arrange(recentCasesSettings);

    await act();

    // Wait for store to settle (recentCases registered after config)
    await new Promise((r) => setTimeout(r, 500));

    const hasWrapper = await queryRecentCasesShadow(L.RECENT_CASES_WRAPPER);
    expect(hasWrapper).toBe(false);
  });

  it("renders an error message when API returns an error", async () => {
    await setupInterception({ recentCasesStatus: 500 });
    await arrange(recentCasesSettings);

    await act();
    await waitForRecentCasesContent(L.RECENT_CASES_ERROR_MSG);

    const hasWrapper = await queryRecentCasesShadow(L.RECENT_CASES_WRAPPER);
    expect(hasWrapper).toBe(true);

    const hasErrorMsg = await queryRecentCasesShadow(L.RECENT_CASES_ERROR_MSG);
    expect(hasErrorMsg).toBe(true);

    const hasList = await queryRecentCasesShadow(L.RECENT_CASES_LIST);
    expect(hasList).toBe(false);
  });

  it("shows the waiting slot then re-renders with data after a delayed response (WeakRef regression)", async () => {
    await setupInterception({ holdRecentCases: true });
    await arrange(recentCasesSettings);

    await act();

    // The component should be in api-still-waiting state, showing the waiting slot
    await waitForRecentCasesContent(L.RECENT_CASES_WAITING_SLOT);

    const hasWaitingSlot = await queryRecentCasesShadow(
      L.RECENT_CASES_WAITING_SLOT
    );
    expect(hasWaitingSlot).toBe(true);

    // Verify the projected light DOM content is visible
    const waitingText = await page.evaluate((container) => {
      const el = document.querySelector(container);
      const slotChild = el?.querySelector('[slot="waiting"]');
      return slotChild?.textContent?.trim();
    }, L.RECENT_CASES_CONTAINER);
    expect(waitingText).toBe("Loading recent cases...");

    // Force V8 garbage collection to collect any WeakRefs that lack strong refs
    const cdp = await page.createCDPSession();
    await cdp.send("HeapProfiler.collectGarbage");
    await cdp.detach();

    // Now respond with case data
    if (heldRequest) {
      await heldRequest.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_CASES),
      });
      heldRequest = null;
    }

    // The component should re-render with the case list — this is the critical
    // assertion. Without the store.ts strong-ref workaround, the stencil store's
    // WeakRef subscription would have been GC'd by the forced collection above,
    // and the component would silently fail to re-render.
    await waitForRecentCasesContent(L.RECENT_CASES_LIST);

    const links = await getRecentCasesLinks();
    expect(links).toHaveLength(MOCK_CASES.length);
    expect(links[0]).toEqual({
      href: "/cases/123?urn=12AB3456789",
      text: "12AB3456789 - Smith, John",
    });
  });
});
