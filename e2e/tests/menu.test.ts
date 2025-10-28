import { act } from "../helpers/act";
import { arrange, ArrangeProps } from "../helpers/arrange";
import { locators as L } from "../helpers/constants";

const happySettings: ArrangeProps = {
  config: {
    SHOW_MENU: true,
    CONTEXTS: [{ contexts: "e2e", paths: [".*"], msalRedirectUrl: "foo" }],
    LINKS: [
      {
        label: "foo",
        visibleContexts: "e2e",
        activeContexts: "e2e",
        href: "http://example.org",
        level: 0,
      },
    ],
    FEATURE_FLAG_MENU_USERS: { adGroupIds: ["e2e-test-group"] },
  },
  auth: { isAuthed: true, adGroups: ["e2e-test-group"] },
};

describe.skip("Global menu", () => {
  it("should follow config to only show one top-level nav link", async () => {
    await arrange(happySettings);

    const header = await act();

    await expect(header).toMatchElement(L.MENU_CONTAINER);
    await expect(header).toMatchElement(L.MENU_CONTENT);
    await expect(header).not.toMatchElement(L.ERROR);
  });

  it("should should not show the menu if it is switched off in config", async () => {
    await arrange({
      ...happySettings,
      config: { ...happySettings.config, SHOW_MENU: false },
    });

    const header = await act();

    await expect(header).toMatchElement(L.MENU_CONTAINER);
    await expect(header).not.toMatchElement(L.MENU_CONTENT);
    await expect(header).not.toMatchElement(L.ERROR);
  });

  it("should should not show the menu if the user is not authenticated", async () => {
    await arrange({
      ...happySettings,
      auth: { ...happySettings.auth, isAuthed: false },
    });

    const header = await act();

    await expect(header).toMatchElement(L.MENU_CONTAINER);
    await expect(header).not.toMatchElement(L.MENU_CONTENT);
    await expect(header).not.toMatchElement(L.ERROR);
  });

  it("should should not show the menu if the user is not in an appropriate AD group", async () => {
    await arrange({
      ...happySettings,
      auth: { isAuthed: true, adGroups: ["not-the-e2e-test-group"] },
    });

    const header = await act();

    await expect(header).toMatchElement(L.MENU_CONTAINER);
    await expect(header).not.toMatchElement(L.MENU_CONTENT);
    await expect(header).not.toMatchElement(L.ERROR);
  });

  it("should should not show the menu if the current context has no links", async () => {
    await arrange({
      ...happySettings,
      config: {
        ...happySettings.config,
        LINKS: [
          {
            ...happySettings.config.LINKS![0],
            visibleContexts: "not-e2e",
          },
        ],
      },
    });

    const header = await act();

    await expect(header).toMatchElement(L.MENU_CONTAINER);
    await expect(header).not.toMatchElement(L.MENU_CONTENT);
    await expect(header).not.toMatchElement(L.ERROR);
  });

  it("should should not show the menu and show an error if the address is not in a known context", async () => {
    await arrange({
      ...happySettings,
      config: {
        ...happySettings.config,
        CONTEXTS: [
          {
            ...happySettings.config.CONTEXTS![0],
            paths: ["http://example.org"],
          },
        ],
      },
    });

    const header = await act();

    await expect(header).toMatchElement(L.MENU_CONTAINER);
    await expect(header).not.toMatchElement(L.MENU_CONTENT);
    await expect(header).toMatchElement(L.ERROR);
  });
});
