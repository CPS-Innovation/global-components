import { act } from "../helpers/act";
import { arrange, ArrangeProps } from "../helpers/arrange";
import { locators as L } from "../helpers/constants";
import { DeepPartial } from "../helpers/utils";

// The skip links live inside the cps-global-header shadow root (the header is shadow: true),
// whereas the detection targets are matched against the top-level light DOM (skipLinkSubscriber
// observes `document`). So we inject targets into document.body and read links via the header's
// shadow root.

// skipLinks sits on the context (a base-schema field), so configuring it on the parent context
// inherits it down to the matched leaf context.
const skipLinksSettings: DeepPartial<ArrangeProps> = {
  config: {
    CONTEXTS: [
      {
        skipLinks: {
          searchSelector: ".case-search",
          listSelector: "#case-list",
          useScroll: true,
        },
      },
    ],
  },
};

const SKIP_LINK = "a.govuk-skip-link";
const FALLBACK_TARGET_ID = "cps-header-main-content";

// The synthesised fallback target lives in the top-level light DOM (after the header host).
const fallbackTargetExists = () => page.evaluate(id => !!document.getElementById(id), FALLBACK_TARGET_ID);

const getSkipLinkTexts = () =>
  page.evaluate(
    (container, linkSel) => {
      const header = document.querySelector(container);
      const links = header?.shadowRoot?.querySelectorAll(linkSel) ?? [];
      return Array.from(links).map(a => (a as HTMLAnchorElement).textContent?.trim());
    },
    L.HEADER_CONTAINER,
    SKIP_LINK,
  );

// Waits until the header shadow root contains a skip link whose text matches `text`.
const waitForSkipLink = (text: string, timeout = 5000) =>
  page.waitForFunction(
    (container: string, linkSel: string, expected: string) => {
      const header = document.querySelector(container);
      const links = header?.shadowRoot?.querySelectorAll(linkSel) ?? [];
      return Array.from(links).some(a => (a as HTMLAnchorElement).textContent?.trim() === expected);
    },
    { timeout, polling: 100 },
    L.HEADER_CONTAINER,
    SKIP_LINK,
    text,
  );

// Appends a detection target to the top-level document body.
const injectTarget = ({ className, id }: { className?: string; id?: string }) =>
  page.evaluate(
    (cls, elId) => {
      const el = document.createElement("div");
      if (cls) {
        el.className = cls;
      }
      if (elId) {
        el.id = elId;
      }
      document.body.appendChild(el);
    },
    className,
    id,
  );

// Appends a raw HTML fragment to the top-level document body (for nested ancestor chains
// that descendant selectors resolve against).
const injectHtml = (html: string) =>
  page.evaluate(markup => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = markup;
    document.body.appendChild(wrapper);
  }, html);

describe("Skip links", () => {
  it("renders only the main skip link when no targets are present", async () => {
    await arrange(skipLinksSettings);
    await act();
    // Give the subscriber a moment; search/list targets are absent so they must stay hidden.
    await new Promise(r => setTimeout(r, 300));

    // "Skip to footer" is always present when the shim flag is on (true under e2e/local-dev).
    expect(await getSkipLinkTexts()).toEqual(["Skip to main content", "Skip to footer"]);
    // With no mainSelector, cps-skip-links synthesises the fallback target.
    expect(await fallbackTargetExists()).toBe(true);
  });

  it("renders the search and list links once their targets appear in the DOM", async () => {
    await arrange(skipLinksSettings);
    await act();

    await injectTarget({ className: "case-search" });
    await injectTarget({ id: "case-list" });

    await waitForSkipLink("Skip to case search");
    await waitForSkipLink("Skip to case list");

    expect(await getSkipLinkTexts()).toEqual(["Skip to main content", "Skip to case search", "Skip to case list", "Skip to footer"]);
  });

  it("renders only the link whose target is present", async () => {
    await arrange(skipLinksSettings);
    await act();

    // Only the list target exists — the search link must not appear.
    await injectTarget({ id: "case-list" });
    await waitForSkipLink("Skip to case list");
    await new Promise(r => setTimeout(r, 300));

    const texts = await getSkipLinkTexts();
    expect(texts).toContain("Skip to main content");
    expect(texts).toContain("Skip to case list");
    expect(texts).not.toContain("Skip to case search");
  });
});

// Reproduces the real OutSystems config: `cps-skip-link__target` is an ancestor of
// `cps-filter-layout`, which is an ancestor of the actual `cps-search-form` / `cps-search-results`
// targets. The selectors are descendant chains, so querySelector resolves each to the rightmost
// (innermost) element. Main resolves to the outer container. This guards the production selectors
// against querySelector / arrive edge cases with descendant combinators.
const osStyleSettings: DeepPartial<ArrangeProps> = {
  config: {
    CONTEXTS: [
      {
        skipLinks: {
          mainSelector: ".cps-skip-link__target",
          searchSelector: ".cps-skip-link__target .cps-filter-layout .cps-search-form",
          listSelector: ".cps-skip-link__target .cps-filter-layout .cps-search-results",
          useScroll: true,
        },
      },
    ],
  },
};

describe("Skip links (OutSystems-style nested-descendant selectors)", () => {
  it("shows only the main link when the cps-skip-link__target container has no filter-layout descendants", async () => {
    await arrange(osStyleSettings);
    await act();

    // The main container exists, but with no nested cps-filter-layout/search/list descendants.
    await injectHtml(`<div class="cps-skip-link__target"></div>`);
    await waitForSkipLink("Skip to main content");
    await new Promise(r => setTimeout(r, 300));

    // search/list selectors require the nested descendant chain, so they must not match.
    expect(await getSkipLinkTexts()).toEqual(["Skip to main content", "Skip to footer"]);
    // A real mainSelector is configured, so no fallback target is synthesised.
    expect(await fallbackTargetExists()).toBe(false);
  });

  it("shows all three links when the nested search/list elements are present", async () => {
    await arrange(osStyleSettings);
    await act();

    // Realistic tree: one outer target, a filter-layout, with the search + list targets nested inside.
    await injectHtml(`
      <div class="cps-skip-link__target">
        <div class="cps-filter-layout">
          <div class="cps-search-form"></div>
          <div class="cps-search-results"></div>
        </div>
      </div>`);

    await waitForSkipLink("Skip to main content");
    await waitForSkipLink("Skip to case search");
    await waitForSkipLink("Skip to case list");

    expect(await getSkipLinkTexts()).toEqual(["Skip to main content", "Skip to case search", "Skip to case list", "Skip to footer"]);
  });
});
