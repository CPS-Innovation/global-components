import { arrange } from "../helpers/arrange";

describe("Global header", () => {
  it("should follow config to only show banner", async () => {
    // Act
    const header = await page.waitForSelector("cps-global-header >>> div");

    // Assert
    await expect(header).toMatchElement("cps-global-banner");
    await expect(header).not.toMatchElement("cps-global-menu");
  });

  it("should follow config to only show menu", async () => {
    // Arrange
    await arrange({ SHOW_MENU: true });

    // Act
    const header = await page.waitForSelector("cps-global-header >>> div");

    // Assert
    await expect(header).not.toMatchElement("cps-global-banner");
    await expect(header).toMatchElement("cps-global-menu");
  });

  it("should follow config to show both banner and menu", async () => {
    // Arrange
    await arrange({ SHOW_MENU: true });

    // Act
    const header = await page.waitForSelector("cps-global-header >>> div");

    // Assert
    await expect(header).toMatchElement("cps-global-banner");
    await expect(header).toMatchElement("cps-global-menu");
  });

  it("should follow config to neither banner nor menu", async () => {
    // Arrange
    await arrange({ SHOW_MENU: false });

    // Act
    const header = await page.waitForSelector("cps-global-header >>> div");

    // Assert
    await expect(header).toMatchElement("cps-global-banner");
    await expect(header).not.toMatchElement("cps-global-menu");
  });
});
