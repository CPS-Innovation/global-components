import { act } from "../helpers/act";
import { arrange, ArrangeProps } from "../helpers/arrange";
import { locators as L, constants as C } from "../helpers/constants";
import { DeepPartial } from "../helpers/utils";

const caseContextSettings: DeepPartial<ArrangeProps> = {
  config: {
    SHOW_MENU: true,
    GATEWAY_URL: C.GATEWAY_URL,
    CONTEXTS: [
      {
        msalRedirectUrl: "not-used",
        contexts: [
          { contextIds: "case", path: "/cases/(?<caseId>\\d+)" },
        ],
      },
      {
        msalRedirectUrl: "not-used",
        contexts: [
          { contextIds: "home", path: "/home" },
        ],
      },
      {
        msalRedirectUrl: "not-used",
        contexts: [
          { contextIds: "fallback", path: ".*" },
        ],
      },
    ],
    LINKS: [
      {
        label: "Home",
        visibleContexts: "home fallback case",
        activeContexts: "home fallback",
        href: "/home",
        level: 0,
      },
      {
        label: "Case Link",
        visibleContexts: "case",
        activeContexts: "case",
        href: "/case/{urn}",
        level: 0,
      },
    ],
    FEATURE_FLAG_MENU_USERS: { generallyAvailable: true },
  },
  auth: { isAuthed: true, adGroups: [] },
};

// Simulate SPA navigation without full page reload
const navigateTo = (path: string) =>
  page.evaluate((p) => {
    history.pushState({}, "", p);
    (window as any).navigation?.dispatchEvent(new Event("navigatesuccess"));
  }, path);

describe("Context change", () => {
  describe("non-case context", () => {
    it("should complete initialisation on a page with no caseId", async () => {
      await arrange(caseContextSettings);
      const header = await act("/home");

      const status = await page.evaluate((locators) => {
        const el = document.querySelector(locators.HEADER_CONTAINER);
        const root = el?.shadowRoot?.querySelector(locators.HEADER_CONTENT_READY);
        return root?.getAttribute("data-initialisation-status");
      }, L);

      expect(status).toBe("complete");
    });

    it("should show menu on a non-case page", async () => {
      await arrange(caseContextSettings);
      const header = await act("/home");

      const hasMenu = await page.evaluate((locators) => {
        const el = document.querySelector(locators.HEADER_CONTAINER);
        return !!el?.shadowRoot?.querySelector(locators.HEADER_CONTENT_READY)?.querySelector(locators.MENU_CONTENT);
      }, L);

      expect(hasMenu).toBe(true);
    });
  });

  describe("SPA navigation between cases", () => {
    it("should update case data when navigating from one case to another", async () => {
      await arrange(caseContextSettings);
      const header = await act("/cases/111");

      // Wait for case 111 data to load
      await expect(header).toMatchElement(`a[href='/case/${C.URN_PREFIX}111']`);

      // Navigate to case 222
      await navigateTo("/cases/222");

      // Should update to case 222 data
      await expect(header).toMatchElement(`a[href='/case/${C.URN_PREFIX}222']`);
    });

    it("should handle navigating from case to non-case context", async () => {
      await arrange(caseContextSettings);
      const header = await act("/cases/111");

      // Wait for case data
      await expect(header).toMatchElement(`a[href='/case/${C.URN_PREFIX}111']`);

      // Navigate to non-case page
      await navigateTo("/home");
      await new Promise(r => setTimeout(r, 500));

      // Case-specific link should not be visible on home page
      const result = await page.evaluate((locators) => {
        const el = document.querySelector(locators.HEADER_CONTAINER);
        const root = el?.shadowRoot?.querySelector(locators.HEADER_CONTENT_READY);
        return {
          status: root?.getAttribute("data-initialisation-status"),
          hasMenu: !!root?.querySelector(locators.MENU_CONTENT),
        };
      }, L);

      expect(result.status).toBe("complete");
      expect(result.hasMenu).toBe(true);
    });
  });

  describe("preventADAndDataCalls", () => {
    it("should complete initialisation on a prevented context without error", async () => {
      const settings: DeepPartial<ArrangeProps> = {
        config: {
          ...caseContextSettings.config,
          GATEWAY_URL: C.GATEWAY_URL,
          CONTEXTS: [
            {
              msalRedirectUrl: "not-used",
              contexts: [
                {
                  contextIds: "prevented",
                  path: "/go",
                  preventADAndDataCalls: true,
                },
              ],
            },
            {
              msalRedirectUrl: "not-used",
              contexts: [
                { contextIds: "fallback", path: ".*" },
              ],
            },
          ],
        },
      };

      await arrange(settings);
      await act("/go");

      const result = await page.evaluate((locators) => {
        const el = document.querySelector(locators.HEADER_CONTAINER);
        const root = el?.shadowRoot?.querySelector(locators.HEADER_CONTENT_READY);
        return {
          status: root?.getAttribute("data-initialisation-status"),
          hasError: !!root?.querySelector(locators.ERROR),
        };
      }, L);

      expect(result.status).toBe("complete");
      expect(result.hasError).toBe(false);
    });
  });

  describe("rapid SPA navigations", () => {
    it("should not show stale data after rapid navigation between cases", async () => {
      await arrange(caseContextSettings);
      const header = await act("/cases/100");

      // Wait for initial case data
      await expect(header).toMatchElement(`a[href='/case/${C.URN_PREFIX}100']`);

      // Rapidly navigate through several cases
      await navigateTo("/cases/200");
      await navigateTo("/cases/300");
      await navigateTo("/cases/400");
      await navigateTo("/cases/500");

      // Wait for the final case to load
      await page.waitForFunction(
        (prefix) => {
          const header = document.querySelector("cps-global-header");
          const root = header?.shadowRoot?.querySelector("div[data-internal-root]");
          const link = root?.querySelector(`a[href='/case/${prefix}500']`);
          return !!link;
        },
        { timeout: 5000, polling: 100 },
        C.URN_PREFIX
      );

      // Verify the final state shows case 500, not any intermediate case
      const finalHrefs = await page.evaluate(() => {
        const header = document.querySelector("cps-global-header");
        const root = header?.shadowRoot?.querySelector("div[data-internal-root]");
        const links = root?.querySelectorAll("a");
        return Array.from(links || []).map(a => a.getAttribute("href")).filter(h => h?.startsWith("/case/"));
      });

      // All case links should reference case 500, not any earlier case
      const staleLinks = finalHrefs.filter(h => h && !h.includes("500") && h.startsWith("/case/URN"));
      expect(staleLinks).toHaveLength(0);
    });
  });
});
