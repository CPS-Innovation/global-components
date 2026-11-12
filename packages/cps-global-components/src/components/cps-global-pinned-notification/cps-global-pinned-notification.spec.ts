import { newSpecPage, SpecPage } from "@stencil/core/testing";
import { CpsGlobalPinnedNotification } from "./cps-global-pinned-notification";

const COLLAPSED_PX = 60;
const EXPANDED_PX = 260;

describe("cps-global-pinned-notification expanding into its own space", () => {
  let page: SpecPage;
  let scrollBy: jest.Mock;

  const wrapper = () => page.root!.querySelector<HTMLElement>(".app-notification-banner-pinned")!;
  const toggle = async () => {
    page.root!.querySelector<HTMLButtonElement>(".app-notification-banner-pinned__toggle")!.click();
    await page.waitForChanges();
  };

  beforeEach(async () => {
    scrollBy = jest.fn();
    page = await newSpecPage({
      components: [CpsGlobalPinnedNotification],
      html: `<cps-global-pinned-notification title-text="Someone is here" collapsible><p>Details</p></cps-global-pinned-notification>`,
    });
    // The spec runtime gives the component its own window.
    (page.win as any).scrollBy = scrollBy;
    // The spec DOM does no layout, so the banner's height follows its expanded class.
    wrapper().getBoundingClientRect = () =>
      ({ height: wrapper().className.includes("--expanded") ? EXPANDED_PX : COLLAPSED_PX, width: 0, left: 0, top: 0, right: 0, bottom: 0 }) as DOMRect;
  });

  it("scrolls the page up by however much opening the details grew it", async () => {
    await toggle();

    expect(scrollBy).toHaveBeenCalledWith(0, EXPANDED_PX - COLLAPSED_PX);
  });

  it("scrolls back by the same amount when the details close", async () => {
    await toggle();
    scrollBy.mockClear();

    await toggle();

    expect(scrollBy).toHaveBeenCalledWith(0, COLLAPSED_PX - EXPANDED_PX);
  });

  it("does not move the page for a render the reader did not cause", async () => {
    page.root!.setAttribute("title-text", "Two people are here");
    await page.waitForChanges();

    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("keeps the end of the page reachable at the new height", async () => {
    await toggle();

    expect(document.body.style.paddingBottom).toBe(`${EXPANDED_PX}px`);
  });
});
