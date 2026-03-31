import { act } from "../helpers/act";
import { arrange, ArrangeProps } from "../helpers/arrange";
import { locators as L } from "../helpers/constants";
import { DeepPartial } from "../helpers/utils";

const settings: DeepPartial<ArrangeProps> = {
  config: {
    SHOW_MENU: true,
    CONTEXTS: [
      {
        msalRedirectUrl: "foo",
        domTagDefinitions: [
          { cssSelector: ".e2e-tag-source", regex: "data-tag=\"(?<e2eTag>[^\"]+)\"" },
        ],
        contexts: [
          { contextIds: "e2e", path: ".*" },
        ],
      },
    ],
    LINKS: [
      {
        label: "foo",
        visibleContexts: "e2e",
        activeContexts: "e2e",
        href: "http://example.org",
        level: 0,
      },
    ],
    FEATURE_FLAG_MENU_USERS: { generallyAvailable: true },
  },
  auth: { isAuthed: true, adGroups: [] },
};

// Simulate SPA navigation without a full page reload by pushing state
// and dispatching the navigatesuccess event that the component listens for.
const simulateSpaNavigation = (queryParam: string) =>
  page.evaluate((param) => {
    const url = new URL(window.location.href);
    url.searchParams.set("nav", param);
    history.pushState({}, "", url.toString());
    (window as any).navigation?.dispatchEvent(new Event("navigatesuccess"));
  }, queryParam);

describe("SPA navigation", () => {
  it("should not accumulate DOM observation listeners across navigations", async () => {
    await arrange(settings);

    // Instrument document.arrive before the page loads so we can count
    // how many listeners are bound vs unbound.
    await page.evaluateOnNewDocument(() => {
      (window as any).__arriveBindCount = 0;
      (window as any).__arriveUnbindCount = 0;

      const waitForArrive = setInterval(() => {
        if (typeof (document as any).arrive === "function") {
          clearInterval(waitForArrive);

          const origArrive = (document as any).arrive.bind(document);
          const origUnbind = (document as any).unbindArrive.bind(document);

          (document as any).arrive = function (...args: any[]) {
            (window as any).__arriveBindCount++;
            return origArrive(...args);
          };
          (document as any).unbindArrive = function (...args: any[]) {
            (window as any).__arriveUnbindCount++;
            return origUnbind(...args);
          };
        }
      }, 10);
    });

    await act();

    const result = await page.evaluate(async (locators) => {
      const header = document.querySelector(locators.HEADER_CONTAINER);
      if (!header?.shadowRoot?.querySelector(locators.HEADER_CONTENT_READY)) {
        throw new Error("header not ready");
      }

      // Record counts after initial load
      return {
        bindsAfterInit: (window as any).__arriveBindCount,
        unbindsAfterInit: (window as any).__arriveUnbindCount,
      };
    }, L);

    // Simulate 3 SPA navigations. Each triggers contextChangePhase ->
    // initialiseDomForContext. With the fix, each call unbinds previous
    // listeners before binding new ones, so the active count stays constant.
    for (let i = 0; i < 3; i++) {
      await simulateSpaNavigation(String(i));
      await new Promise(r => setTimeout(r, 300));
    }

    const afterNav = await page.evaluate(() => ({
      bindsAfterNav: (window as any).__arriveBindCount,
      unbindsAfterNav: (window as any).__arriveUnbindCount,
    }));

    // After init: some binds happened
    expect(result.bindsAfterInit).toBeGreaterThan(0);

    // After 3 navigations: more unbinds should have happened than during init.
    // Without the fix, unbinds would NOT increase because activeSubscriptions
    // was scoped inside initialiseDomForContext and lost on each call —
    // the old listeners were orphaned and could never be unbound.
    expect(afterNav.unbindsAfterNav).toBeGreaterThan(result.unbindsAfterInit);

    // The number of new binds per navigation should roughly equal unbinds per navigation
    // (each navigation cleans up then re-binds). This means listeners aren't accumulating.
    const newBinds = afterNav.bindsAfterNav - result.bindsAfterInit;
    const newUnbinds = afterNav.unbindsAfterNav - result.unbindsAfterInit;
    expect(newBinds).toBeGreaterThan(0);
    expect(newUnbinds).toBeGreaterThanOrEqual(newBinds);
  });

  it("should continue to show the menu correctly after SPA navigation", async () => {
    await arrange(settings);
    await act();

    await simulateSpaNavigation("1");
    await new Promise(r => setTimeout(r, 500));

    const headerAfter = await page.evaluate((locators) => {
      const el = document.querySelector(locators.HEADER_CONTAINER);
      const root = el?.shadowRoot?.querySelector(locators.HEADER_CONTENT_READY);
      return {
        hasMenu: !!root?.querySelector(locators.MENU_CONTENT),
        hasError: !!root?.querySelector(locators.ERROR),
        status: root?.getAttribute("data-initialisation-status"),
      };
    }, L);

    expect(headerAfter.hasMenu).toBe(true);
    expect(headerAfter.hasError).toBe(false);
    expect(headerAfter.status).toBe("complete");
  });
});
