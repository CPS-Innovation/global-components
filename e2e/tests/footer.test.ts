import { act } from "../helpers/act";
import { arrange } from "../helpers/arrange";
import { locators as L } from "../helpers/constants";

// Helper to wait for footer content to render in shadow DOM
const waitForFooterReady = async () => {
  await page.waitForFunction(
    (locators) => {
      const footer = document.querySelector(locators.FOOTER_CONTAINER);
      return !!footer?.shadowRoot?.querySelector(locators.FOOTER_CONTENT);
    },
    { timeout: 5000, polling: 100 },
    L
  );
};

describe("Footer", () => {
  it("custom element is registered and creates shadow DOM", async () => {
    await arrange({});

    await act();

    const footerInfo = await page.evaluate((locators) => {
      const footer = document.querySelector(locators.FOOTER_CONTAINER);
      return {
        exists: !!footer,
        isCustomElement: !!customElements.get("cps-global-footer"),
        hasShadowRoot: !!footer?.shadowRoot,
      };
    }, L);

    expect(footerInfo.exists).toBe(true);
    expect(footerInfo.isCustomElement).toBe(true);
    expect(footerInfo.hasShadowRoot).toBe(true);
  });

  it("renders footer content with govuk-footer class", async () => {
    await arrange({});

    await act();
    await waitForFooterReady();

    const footerRendered = await page.evaluate((locators) => {
      const footer = document.querySelector(locators.FOOTER_CONTAINER);
      if (!footer?.shadowRoot) return false;
      return !!footer.shadowRoot.querySelector(locators.FOOTER_CONTENT);
    }, L);

    expect(footerRendered).toBe(true);
  });

  it("displays the crown copyright link", async () => {
    await arrange({});

    await act();
    await waitForFooterReady();

    const hasCopyrightLink = await page.evaluate((locators) => {
      const footer = document.querySelector(locators.FOOTER_CONTAINER);
      if (!footer?.shadowRoot) return false;
      const link = footer.shadowRoot.querySelector(
        "a.govuk-footer__copyright-logo"
      );
      return link?.textContent?.includes("Crown copyright") ?? false;
    }, L);

    expect(hasCopyrightLink).toBe(true);
  });

  it("displays the Open Government Licence link", async () => {
    await arrange({});

    await act();
    await waitForFooterReady();

    const hasLicenceLink = await page.evaluate((locators) => {
      const footer = document.querySelector(locators.FOOTER_CONTAINER);
      if (!footer?.shadowRoot) return false;
      const link = footer.shadowRoot.querySelector(
        'a[href*="open-government-licence"]'
      );
      return !!link;
    }, L);

    expect(hasLicenceLink).toBe(true);
  });
});
