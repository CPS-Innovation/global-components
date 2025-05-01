import { newE2EPage } from "@stencil/core/testing";

describe("cps-global-header", () => {
  it("renders", async () => {
    const page = await newE2EPage();

    await page.setContent("<cps-global-header></cps-global-header>");
    const element = await page.find("cps-global-header");
    expect(element).toHaveClass("hydrated");
  });
});
