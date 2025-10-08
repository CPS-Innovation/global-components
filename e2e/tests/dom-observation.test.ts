import { waitForHeaderReady } from "../helpers/act";
import { arrange } from "../helpers/arrange";
import { constants as C } from "../helpers/constants";

describe("DOM observation", () => {
  it("should observe changes to DOM elements in order to find context variables and change contexts", async () => {
    await arrange({
      config: {
        SHOW_MENU: true,
        CONTEXTS: [
          {
            contexts: "e2e",
            paths: [".*"],
            msalRedirectUrl: "foo",
            // domTags: [
            //   {
            //     cssSelector: "a[href*='/polaris-ui/case-details/']",
            //     regex: "/polaris-ui/case-details/(?<urn>[^/]+)/(?<caseId>\\d+)",
            //   },
            // ],
          },
        ],
        LINKS: [
          {
            label: "foo",
            visibleContexts: "e2e",
            activeContexts: "e2e",
            href: "http://example.org/", //"http://example.org/{urn}/{caseId}",
            level: 0,
          },
        ],
        FEATURE_FLAG_ENABLE_MENU_GROUP: "e2e-test-group",
      },
      auth: { isAuthed: true, adGroups: ["e2e-test-group"] },
    });

    await page.goto(C.LAUNCH_PAGE_URL);

    // await page.evaluate(() => {
    //   let a = document.createElement("a");
    //   a.href = a.innerText = "/polaris-ui/case-details/foo/123";
    //   document.body.insertBefore(a, document.body.firstChild);
    // });

    const header = await waitForHeaderReady();
    const href = await page.$eval("a[role=link]", (el) =>
      el.getAttribute("href")
    );

    console.log(href);

    // expect(href).toBe("http://example.org/foo/123");

    await expect(header).toMatchElement("a[role=link]");
  });
});
