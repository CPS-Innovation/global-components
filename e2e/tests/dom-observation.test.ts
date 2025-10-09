import { waitForHeaderReady } from "../helpers/act";
import { arrange } from "../helpers/arrange";
import { constants as C } from "../helpers/constants";
import { waitForWithinHeader } from "../helpers/wait-for-within-header";

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
            domTags: [
              {
                cssSelector: "a[href*='/polaris-ui/case-details/']",
                regex: "/polaris-ui/case-details/(?<urn>[^/]+)/(?<caseId>\\d+)",
              },
            ],
          },
        ],
        LINKS: [
          {
            label: "foo",
            visibleContexts: "e2e",
            activeContexts: "e2e",
            href: "http://example.org/{urn}/{caseId}",
            level: 0,
          },
        ],
        FEATURE_FLAG_ENABLE_MENU_GROUP: "e2e-test-group",
      },
      auth: { isAuthed: true, adGroups: ["e2e-test-group"] },
    });

    page.on("console", (msg) => {
      const message = msg.text();
      if (!(message.includes("tags") || message.includes("render"))) {
        return;
      }
      console.log("Browser:", message);
    });

    await page.goto(C.LAUNCH_PAGE_URL);

    const tagSourceElementHandle = await page.evaluateHandle(() => {
      let el = document.createElement("a");
      el.href = el.innerText = "/polaris-ui/case-details/foo/123";
      el.id = "link1";
      document.body.appendChild(el);
      return el;
    });

    const header = await waitForHeaderReady();

    await expect(header).toMatchElement(
      "a[role=link][href='http://example.org/foo/123']"
    );
    console.log("Resetting tags");
    await tagSourceElementHandle.evaluate(
      (el) => (el.href = el.innerText = "/polaris-ui/case-details/bar/456")
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log(
      await page.evaluate(() => document.querySelector("#link1")?.outerHTML)
    );
    console.log(
      await page.evaluate(
        () => document.querySelector("cps-global-header")?.shadowRoot?.innerHTML
      )
    );

    // this is a bit redundant given the wait above
    await expect(header).toMatchElement(
      "a[role=link][href='http://example.org/bar/456']"
    );
  });
});
