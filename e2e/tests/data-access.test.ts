import { act } from "../helpers/act";
import { arrange, ArrangeProps } from "../helpers/arrange";
import { DeepPartial } from "../helpers/utils";
import { constants as C } from "../helpers/constants";

const happySettings: DeepPartial<ArrangeProps> = {
  config: {
    SHOW_MENU: true,
    GATEWAY_URL: C.GATEWAY_URL,
    CONTEXTS: [
      {
        msalRedirectUrl: "not-used",
        contexts: [{ contextIds: "case", path: "/cases/(?<caseId>\\d+)" }],
      },
      {
        msalRedirectUrl: "not-used",
        contexts: [{ contextIds: "not-case", path: ".*" }],
      },
    ],
    LINKS: [
      {
        label: "Home",
        visibleContexts: "not-case case",
        activeContexts: "not-case",
        href: "http://example.org",
        level: 0,
      },
      {
        label: "Case",
        visibleContexts: "case",
        activeContexts: "case",
        href: "http://example.org/{urn}",
        level: 0,
      },
    ],
    FEATURE_FLAG_MENU_USERS: { generallyAvailable: true },
  },
};

describe("Data access", () => {
  it("should retrieve data from the api when on a case context", async () => {
    await arrange(happySettings);

    const header = await act();

    await expect(header).not.toMatchElement(
      `a[href='http://example.org/${C.URN_PREFIX}321']`
    );

    await page.evaluate(() => {
      history.pushState({}, "", "/cases/321");
    });

    await expect(header).toMatchElement(
      `a[href='http://example.org/${C.URN_PREFIX}321']`
    );

    await page.evaluate(() => {
      history.pushState({}, "", "/cases/456");
    });

    await expect(header).toMatchElement(
      `a[href='http://example.org/${C.URN_PREFIX}456']`
    );
  });
});
