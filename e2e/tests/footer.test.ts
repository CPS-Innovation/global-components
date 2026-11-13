import { act } from "../helpers/act";
import { arrange } from "../helpers/arrange";
import { locators as L } from "../helpers/constants";

// cps-global-footer is a light-DOM wrapper that owns the skip-target id +
// landmark role. The visible markup + styles live inside its inner partner
// cps-global-footer-content, which has shadow:true. Queries that used to hit
// the wrapper's own shadowRoot now drill into the inner partner's.
const INNER_HOST = "cps-global-footer-content";

const waitForFooterReady = async () => {
  await page.waitForFunction(
    (locators, innerHost) => {
      const inner = document.querySelector(`${locators.FOOTER_CONTAINER} ${innerHost}`);
      return !!inner?.shadowRoot?.querySelector(locators.FOOTER_CONTENT);
    },
    { timeout: 5000, polling: 100 },
    L,
    INNER_HOST,
  );
};

describe("Footer", () => {
  it("custom element is registered and its inner partner has a shadow DOM", async () => {
    await arrange({});

    await act();

    const footerInfo = await page.evaluate(
      (locators, innerHost) => {
        const footer = document.querySelector(locators.FOOTER_CONTAINER);
        const inner = footer?.querySelector(innerHost);
        return {
          exists: !!footer,
          isCustomElement: !!customElements.get("cps-global-footer"),
          wrapperIsLightDom: footer ? !footer.shadowRoot : false,
          innerExists: !!inner,
          innerHasShadowRoot: !!inner?.shadowRoot,
        };
      },
      L,
      INNER_HOST,
    );

    expect(footerInfo.exists).toBe(true);
    expect(footerInfo.isCustomElement).toBe(true);
    expect(footerInfo.wrapperIsLightDom).toBe(true);
    expect(footerInfo.innerExists).toBe(true);
    expect(footerInfo.innerHasShadowRoot).toBe(true);
  });

  it("renders footer content with govuk-footer class", async () => {
    await arrange({});

    await act();
    await waitForFooterReady();

    const footerRendered = await page.evaluate(
      (locators, innerHost) => {
        const inner = document.querySelector(`${locators.FOOTER_CONTAINER} ${innerHost}`);
        if (!inner?.shadowRoot) {
          return false;
        }
        return !!inner.shadowRoot.querySelector(locators.FOOTER_CONTENT);
      },
      L,
      INNER_HOST,
    );

    expect(footerRendered).toBe(true);
  });

  it("renders the accessibility statement link when ACCESSIBILITY_STATEMENT_URL is configured", async () => {
    const accessibilityUrl = "https://example.test/accessibility";
    await arrange({ config: { ACCESSIBILITY_STATEMENT_URL: accessibilityUrl } });

    await act();
    await waitForFooterReady();

    const link = await page.evaluate(
      (locators, innerHost) => {
        const inner = document.querySelector(`${locators.FOOTER_CONTAINER} ${innerHost}`);
        // The accessibility settings link also uses a.govuk-footer__link (no target);
        // the statement link is the one that opens in a new tab, so target it specifically.
        const anchor = inner?.shadowRoot?.querySelector<HTMLAnchorElement>('a.govuk-footer__link[target="_blank"]');
        return anchor && { href: anchor.href, text: anchor.textContent?.trim(), target: anchor.getAttribute("target") };
      },
      L,
      INNER_HOST,
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

    const hasLink = await page.evaluate(
      (locators, innerHost) => {
        const inner = document.querySelector(`${locators.FOOTER_CONTAINER} ${innerHost}`);
        return !!inner?.shadowRoot?.querySelector('a.govuk-footer__link[target="_blank"]');
      },
      L,
      INNER_HOST,
    );

    expect(hasLink).toBe(false);
  });

  it("leaves footers marked .cps-component-footer alone and anchors to the page footer", async () => {
    await arrange({});
    await act();

    // A host app using <footer> inside a modal alongside the real page footer.
    // The modal footer carries the opt-out class, so the shim must neither hide
    // it nor anchor cps-global-footer next to it.
    await page.evaluate(() => {
      const modal = document.createElement("div");
      modal.id = "host-modal";
      const modalFooter = document.createElement("footer");
      modalFooter.id = "host-modal-footer";
      modalFooter.className = "cps-component-footer";
      modalFooter.textContent = "modal footer";
      modal.appendChild(modalFooter);
      document.body.appendChild(modal);

      const pageFooter = document.createElement("footer");
      pageFooter.id = "host-page-footer";
      pageFooter.textContent = "page footer";
      document.body.appendChild(pageFooter);
    });

    // The page footer being hidden is our signal that the subscriber has run.
    await page.waitForFunction(() => document.getElementById("host-page-footer")?.style.display === "none", { timeout: 5000, polling: 100 });

    const result = await page.evaluate(() => {
      const modalFooter = document.getElementById("host-modal-footer")!;
      return {
        modalFooterDisplay: window.getComputedStyle(modalFooter).display,
        modalFooterObserved: !!modalFooter.dataset.cpsFooterEmailObserved,
        globalFooterPrevSiblingId: document.querySelector("cps-global-footer")?.previousElementSibling?.id,
      };
    });

    expect(result.modalFooterDisplay).not.toBe("none");
    expect(result.modalFooterObserved).toBe(false);
    expect(result.globalFooterPrevSiblingId).toBe("host-page-footer");
  });
});
