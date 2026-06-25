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

  it("renders the accessibility statement link when ACCESSIBILITY_STATEMENT_URL is configured", async () => {
    const accessibilityUrl = "https://example.test/accessibility";
    await arrange({ config: { ACCESSIBILITY_STATEMENT_URL: accessibilityUrl } });

    await act();
    await waitForFooterReady();

    const link = await page.evaluate(
      (locators) => {
        const footer = document.querySelector(locators.FOOTER_CONTAINER);
        const anchor = footer?.shadowRoot?.querySelector<HTMLAnchorElement>("a.govuk-footer__link");
        return anchor && { href: anchor.href, text: anchor.textContent?.trim(), target: anchor.getAttribute("target") };
      },
      L
    );

    expect(link).not.toBeNull();
    expect(link?.href).toBe(accessibilityUrl);
    expect(link?.text).toContain("Accessibility statement");
    expect(link?.target).toBe("_blank");
  });

  it("omits the accessibility statement link when ACCESSIBILITY_STATEMENT_URL is not configured", async () => {
    await arrange({});

    await act();
    await waitForFooterReady();

    const hasLink = await page.evaluate((locators) => {
      const footer = document.querySelector(locators.FOOTER_CONTAINER);
      return !!footer?.shadowRoot?.querySelector("a.govuk-footer__link");
    }, L);

    expect(hasLink).toBe(false);
  });
});
