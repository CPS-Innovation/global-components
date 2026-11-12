import { newSpecPage, SpecPage } from "@stencil/core/testing";
import { CpsGlobalOpenInCms } from "./cps-global-open-in-cms";
import { CmsNavigateEvent, CmsNavigateDetail } from "../../services/navigate-cms/CmsNavigateEvent";

describe("cps-global-open-in-cms", () => {
  let page: SpecPage;
  let navigations: CmsNavigateDetail[];

  const trigger = () => page.root!.querySelector<HTMLButtonElement>(".open-in-cms-dropdown__trigger")!;
  const panel = () => page.root!.querySelector<HTMLElement>(".open-in-cms-dropdown__panel")!;
  const option = (key: string) => page.root!.querySelector<HTMLButtonElement>(`[data-option="${key}"]`)!;
  const isOpen = () => trigger().getAttribute("aria-expanded") === "true";

  const key = async (target: HTMLElement, key: string) => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    await page.waitForChanges();
  };
  const click = async (target: HTMLElement) => {
    target.click();
    await page.waitForChanges();
  };

  const recordNavigation = (event: Event) => navigations.push((event as CmsNavigateEvent).detail);

  beforeEach(async () => {
    navigations = [];
    page = await newSpecPage({
      components: [CpsGlobalOpenInCms],
      html: `<cps-global-open-in-cms case-id="123"></cps-global-open-in-cms>`,
    });
    // After newSpecPage, which installs the document the dispatchers will use
    page.doc.addEventListener(CmsNavigateEvent.type, recordNavigation);
  });

  it("starts closed, with the options hidden and the trigger pointing at them", () => {
    expect(trigger().textContent).toContain("Open in CMS…");
    expect(isOpen()).toBe(false);
    expect(panel().hidden).toBe(true);
    expect(trigger().getAttribute("aria-controls")).toBe(panel().id);
  });

  it("offers CMS Classic then CMS Modern, named in full for screen readers", () => {
    expect(Array.from(panel().querySelectorAll("button")).map(b => b.textContent)).toEqual(["Open in CMS Classic", "Open in CMS Modern"]);
    expect(Array.from(panel().querySelectorAll("button .govuk-visually-hidden")).map(s => s.textContent)).toEqual(["Open in ", "Open in "]);
  });

  it("renders as a list item, since it sits directly in the sub-menu's list", () => {
    expect(page.root!.firstElementChild!.tagName).toBe("LI");
  });

  it("toggles open and closed from the trigger", async () => {
    await click(trigger());
    expect(isOpen()).toBe(true);
    expect(panel().hidden).toBe(false);

    await click(trigger());
    expect(isOpen()).toBe(false);
    expect(panel().hidden).toBe(true);
  });

  it.each([
    ["classic", "case"],
    ["modern", "modern-case"],
  ])("choosing %s navigates for the case and closes", async (which, action) => {
    await click(trigger());
    await click(option(which));

    expect(navigations).toEqual([{ action, caseId: 123 }]);
    expect(isOpen()).toBe(false);
  });

  it("closes on Escape", async () => {
    await click(trigger());
    await key(option("modern"), "Escape");

    expect(isOpen()).toBe(false);
  });

  it("closes on a click elsewhere on the page", async () => {
    await click(trigger());
    await click(page.body);

    expect(isOpen()).toBe(false);
  });

  it("stays open on a click inside the panel that isn't an option", async () => {
    await click(trigger());
    await click(panel());

    expect(isOpen()).toBe(true);
  });

  it("closes when focus moves outside the component", async () => {
    const outside = page.doc.createElement("button");
    page.body.appendChild(outside);
    await click(trigger());

    option("classic").dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: outside }));
    await page.waitForChanges();

    expect(isOpen()).toBe(false);
  });

  it("stays open when focus moves between its own options", async () => {
    await click(trigger());

    option("classic").dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: option("modern") }));
    await page.waitForChanges();

    expect(isOpen()).toBe(true);
  });

  it("opens from the keyboard with the down arrow, focusing the first option once it can take focus", async () => {
    const focus = jest.spyOn(option("classic"), "focus");

    await key(trigger(), "ArrowDown");

    expect(isOpen()).toBe(true);
    expect(focus).toHaveBeenCalled();
  });

  it("opens from the keyboard with the up arrow, focusing the last option", async () => {
    const focus = jest.spyOn(option("modern"), "focus");

    await key(trigger(), "ArrowUp");

    expect(isOpen()).toBe(true);
    expect(focus).toHaveBeenCalled();
  });
});
