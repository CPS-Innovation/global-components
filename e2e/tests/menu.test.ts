import { arrange } from "../helpers/arrange";

describe("Global menu", () => {
  it("should follow config to only show one top-level nav link", async () => {
    // Arrange
    await arrange({
      SHOW_BANNER: true,
      SHOW_MENU: true,
      CONTEXTS: [{ contexts: "e2e", paths: [".*"] }],
      LINKS: [
        {
          label: "Link A",
          level: 0,
          href: "/1",
          activeContexts: "e2e",
        },
      ],
    });

    // Act
    const header = await page.waitForSelector(">>> cps-global-menu >>> div");
    if (!header) throw new Error();

    // Assert
    await expect(header).toMatchElement("[data-testid=menu-level-1]");
    await expect(header).not.toMatchElement("[data-testid=menu-level-2]");

    const links = await header.$$("li");
    expect(links.length).toBe(1);

    await expect(links[0]).toMatchTextContent("Link A");
  });
});
