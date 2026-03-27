import { act } from "../helpers/act";
import { arrange } from "../helpers/arrange";

describe("Duplicate script load", () => {
  it("should not re-initialise when the script is included a second time", async () => {
    await arrange({});
    await act();

    const result = await page.evaluate(async () => {
      const statusBefore = document
        .querySelector("cps-global-header")
        ?.shadowRoot?.querySelector("div[data-internal-root]")
        ?.getAttribute("data-initialisation-status");

      // Inject a second script tag for the same bundle
      const script = document.createElement("script");
      script.type = "module";
      script.src = "/cps-global-components.js";
      document.head.appendChild(script);

      // Give it time to load and (not) re-execute
      await new Promise((r) => setTimeout(r, 1000));

      const statusAfter = document
        .querySelector("cps-global-header")
        ?.shadowRoot?.querySelector("div[data-internal-root]")
        ?.getAttribute("data-initialisation-status");

      return {
        guardFlag: (window as any).cps_global_components_initialised,
        statusBefore,
        statusAfter,
      };
    });

    expect(result.guardFlag).toBe(true);
    expect(result.statusBefore).toBe("complete");
    expect(result.statusAfter).toBe("complete");
  });
});
