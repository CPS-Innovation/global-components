import {
  applyRegionOverride,
  applyRegionToString,
  getPreviewRegion,
} from "./apply-region-override";
import { Config } from "./Config";
import { Preview } from "./Preview";
import { Result } from "./Result";

const london: Result<Preview> = { found: true, result: { region: "london" } };
const noOverride: Result<Preview> = { found: true, result: {} };
const frontDoor: Result<Preview> = {
  found: true,
  result: { region: "frontDoor" },
};
const notFound: Result<Preview> = { found: false, error: new Error("nope") };

const baseConfig = {
  ENVIRONMENT: "test",
  BANNER_TITLE_HREF: "https://cps-tst.outsystemsenterprise.com/Casework/home",
  OS_HANDOVER_URL:
    "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=https://polaris-qa-notprod.cps.gov.uk/global-components/test/auth-handover.js",
  LINKS: [
    {
      label: "Tasks",
      href: "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/TaskList",
      activeContexts: "a",
      visibleContexts: "a",
      level: 1,
    },
  ],
  CONTEXTS: [
    {
      path: "https://(?:cps-tst|cpslon-tst)\\.outsystemsenterprise\\.com/CaseReview",
      contextIds: "a",
      msalRedirectUrl:
        "https://cps-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html",
    },
  ],
} as unknown as Config;

describe("getPreviewRegion", () => {
  it("reads the region from a found preview", () => {
    expect(getPreviewRegion(london)).toBe("london");
  });

  it("is undefined when the preview is absent", () => {
    expect(getPreviewRegion(notFound)).toBeUndefined();
  });
});

describe("applyRegionToString", () => {
  it.each([
    ["https://cps.outsystemsenterprise.com/x", "https://cpslon.outsystemsenterprise.com/x"],
    ["https://cps-tst.outsystemsenterprise.com/x", "https://cpslon-tst.outsystemsenterprise.com/x"],
    ["https://cps-tst1.outsystemsenterprise.com/x", "https://cpslon-tst1.outsystemsenterprise.com/x"],
  ])("transposes %s", (input, expected) => {
    expect(applyRegionToString(input, "london")).toBe(expected);
  });

  it("leaves polaris hosts alone even though they contain cps", () => {
    const polaris = "https://polaris-qa-notprod.cps.gov.uk/global-components/test/auth-handover.js";
    expect(applyRegionToString(polaris, "london")).toBe(polaris);
  });

  it("is idempotent — an already-London host is untouched", () => {
    const alreadyLondon = "https://cpslon-tst.outsystemsenterprise.com/x";
    expect(applyRegionToString(alreadyLondon, "london")).toBe(alreadyLondon);
  });

  it("does not rewrite for frontDoor, which has no host yet", () => {
    const dublin = "https://cps-tst.outsystemsenterprise.com/x";
    expect(applyRegionToString(dublin, "frontDoor")).toBe(dublin);
  });

  it("does not rewrite when there is no override", () => {
    const dublin = "https://cps-tst.outsystemsenterprise.com/x";
    expect(applyRegionToString(dublin, undefined)).toBe(dublin);
  });
});

describe("applyRegionOverride", () => {
  it.each([
    ["no override", noOverride],
    ["frontDoor", frontDoor],
    ["absent preview", notFound],
  ])("returns the identical reference for %s", (_label, preview) => {
    expect(applyRegionOverride(baseConfig, preview)).toBe(baseConfig);
  });

  it("transposes link hrefs", () => {
    const result = applyRegionOverride(baseConfig, london);
    expect(result.LINKS[0].href).toBe(
      "https://cpslon-tst.outsystemsenterprise.com/WorkManagementApp/TaskList",
    );
  });

  it("transposes top-level urls including the banner and handover", () => {
    const result = applyRegionOverride(baseConfig, london);
    expect(result.BANNER_TITLE_HREF).toBe(
      "https://cpslon-tst.outsystemsenterprise.com/Casework/home",
    );
    expect(result.OS_HANDOVER_URL).toBe(
      "https://cpslon-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html?src=https://polaris-qa-notprod.cps.gov.uk/global-components/test/auth-handover.js",
    );
  });

  it("transposes msalRedirectUrl", () => {
    const result = applyRegionOverride(baseConfig, london);
    expect(result.CONTEXTS[0].msalRedirectUrl).toBe(
      "https://cpslon-tst.outsystemsenterprise.com/Casework_Patterns/auth-handover.html",
    );
  });

  // Rewriting the path would collapse the alternation to cpslon|cpslon and stop
  // the component loading on Dublin — where it has to load to redirect at all.
  it("leaves CONTEXTS[].path alone so both hosts still match", () => {
    const result = applyRegionOverride(baseConfig, london);
    expect(result.CONTEXTS[0].path).toBe(
      "https://(?:cps-tst|cpslon-tst)\\.outsystemsenterprise\\.com/CaseReview",
    );
  });

  it("does not mutate the input config", () => {
    applyRegionOverride(baseConfig, london);
    expect(baseConfig.LINKS[0].href).toBe(
      "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/TaskList",
    );
  });
});
