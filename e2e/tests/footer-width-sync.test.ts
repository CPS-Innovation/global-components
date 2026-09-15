import { act } from "../helpers/act";
import { arrange } from "../helpers/arrange";

// The footer-subscriber's selector is `footer` (the HTML element), not the
// cps-global-footer custom element. The harness ships <cps-global-footer> but
// no host <footer>, so the subscriber doesn't fire until we inject one. Each
// test injects a host footer (or sequences mount/unmount of cps-global-header)
// to exercise a single width-sync code path:
//   - the steady-state initial bind
//   - the late-arriving-header MutationObserver path
//   - the header-swap rebind path (SPA-navigation analogue)

const HEADER = "cps-global-header";
const FOOTER_WRAPPER = "cps-global-footer";

const computedWidthPx = (selector: string) =>
  page.evaluate(sel => {
    const el = document.querySelector(sel);
    return el ? parseFloat(window.getComputedStyle(el as HTMLElement).width) : NaN;
  }, selector);

const inlineWidth = (selector: string) =>
  page.evaluate(sel => {
    const el = document.querySelector(sel) as HTMLElement | null;
    return el?.style.width ?? "";
  }, selector);

const injectHostFooter = () =>
  page.evaluate(() => {
    const f = document.createElement("footer");
    f.textContent = "host footer";
    document.body.appendChild(f);
  });

const removeHeader = () => page.evaluate(() => document.querySelector("cps-global-header")?.remove());

const insertHeader = () =>
  page.evaluate(() => {
    const h = document.createElement("cps-global-header");
    document.body.insertBefore(h, document.body.firstChild);
  });

// Replace cps-global-header with a fresh instance. Same tag, different DOM
// element — the rebind-on-swap path requires the MutationObserver to notice
// the reference change.
const swapHeader = () =>
  page.evaluate(() => {
    const old = document.querySelector("cps-global-header");
    if (!old) {
      return;
    }
    old.replaceWith(document.createElement("cps-global-header"));
  });

// Force the header to a known width. We use this to verify the ResizeObserver
// is bound to the *current* header (not a stale one) — if it is, the footer's
// inline width follows in the next microtask.
const setHeaderWidth = (px: number) =>
  page.evaluate(width => {
    const h = document.querySelector("cps-global-header") as HTMLElement | null;
    if (h) {
      h.style.width = `${width}px`;
    }
  }, px);

const waitForFooterInlineWidthAtLeast = (minPx: number, timeout = 5000) =>
  page.waitForFunction(
    (selector: string, threshold: number) => {
      const f = document.querySelector(selector) as HTMLElement | null;
      return !!f && parseFloat(f.style.width || "0") >= threshold;
    },
    { timeout, polling: 100 },
    FOOTER_WRAPPER,
    minPx,
  );

const waitForFooterInlineWidthEquals = (px: number, timeout = 5000) =>
  page.waitForFunction(
    (selector: string, expected: number) => {
      const f = document.querySelector(selector) as HTMLElement | null;
      return !!f && parseFloat(f.style.width || "0") === expected;
    },
    { timeout, polling: 100 },
    FOOTER_WRAPPER,
    px,
  );

describe("Footer width sync", () => {
  it("mirrors the header width onto cps-global-footer once a host footer arrives", async () => {
    await arrange({});
    await act();
    await injectHostFooter();

    // Threshold-guard means a real header always produces > 100px; use that as
    // the "sync has happened" signal rather than guessing exact pixel values.
    await waitForFooterInlineWidthAtLeast(100);

    const [footerWidth, headerWidth] = await Promise.all([computedWidthPx(FOOTER_WRAPPER), computedWidthPx(HEADER)]);

    expect(footerWidth).toBeGreaterThan(0);
    expect(footerWidth).toBe(headerWidth);
  });

  it("waits for cps-global-header to appear before binding the width sync", async () => {
    await arrange({});
    await act();

    // Remove the harness's header BEFORE the subscriber gets a host footer to
    // bind against. The subscriber should fire, find no header, leave the
    // footer width untouched, and arm a MutationObserver to wait for one.
    await removeHeader();
    await injectHostFooter();

    // Give the subscriber room to run and (correctly) write nothing.
    await new Promise(r => setTimeout(r, 300));
    expect(await inlineWidth(FOOTER_WRAPPER)).toBe("");

    // Mount a header. The waiting MutationObserver should surface it and bind
    // the ResizeObserver, at which point syncWidth runs and the inline width
    // appears for the first time.
    await insertHeader();

    await waitForFooterInlineWidthAtLeast(100);
    expect(await computedWidthPx(FOOTER_WRAPPER)).toBe(await computedWidthPx(HEADER));
  });

  it("rebinds when the cps-global-header is replaced (SPA-navigation analogue)", async () => {
    await arrange({});
    await act();
    await injectHostFooter();
    await waitForFooterInlineWidthAtLeast(100);

    // Swap the header for a fresh element. The ResizeObserver on the original
    // is now observing a detached node and will never fire again — only a
    // successful rebind (the permanent MutationObserver catching the swap)
    // can keep the footer in sync.
    await swapHeader();

    // Force the new header to a distinctive width. If the subscriber rebound,
    // the ResizeObserver on the new element fires and the footer follows. If
    // it didn't, the stale observer is silent and the footer stays at its
    // previous width.
    await setHeaderWidth(640);
    await waitForFooterInlineWidthEquals(640);

    expect(await inlineWidth(FOOTER_WRAPPER)).toBe("640px");
  });
});
