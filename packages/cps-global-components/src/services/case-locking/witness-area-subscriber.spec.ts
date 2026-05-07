import { FoundContext } from "../context/FoundContext";
import { createWitnessAreaSubscriber } from "./witness-area-subscriber";

const witnessAreaSubscriber = createWitnessAreaSubscriber(true);

const makeContext = (overrides: Partial<FoundContext> = {}): FoundContext =>
  ({
    found: true,
    contextIds: "case details",
    currentHref: "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/CaseOverview?CaseId=12345",
    ...overrides,
  }) as unknown as FoundContext;

const makeArgs = (context: FoundContext, win: Window = globalThis.window) =>
  ({
    context,
    register: jest.fn(),
    mergeTags: jest.fn(),
    window: win,
    preview: { found: false },
    settings: { found: false },
  }) as any;

describe("witnessAreaSubscriber", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  describe("isActiveForContext", () => {
    it("is active on a CaseOverview URL (test env)", () => {
      const { isActiveForContext } = witnessAreaSubscriber(makeArgs(makeContext()));
      expect(isActiveForContext).toBe(true);
    });

    it("is active on a CaseOverview URL (dev env, different subdomain)", () => {
      const { isActiveForContext } = witnessAreaSubscriber(
        makeArgs(makeContext({ currentHref: "https://cps-dev.outsystemsenterprise.com/WorkManagementApp/CaseOverview?CaseId=99" } as any)),
      );
      expect(isActiveForContext).toBe(true);
    });

    it("is not active on a non-CaseOverview WorkManagementApp URL", () => {
      const { isActiveForContext } = witnessAreaSubscriber(
        makeArgs(makeContext({ currentHref: "https://cps-tst.outsystemsenterprise.com/WorkManagementApp/Cases" } as any)),
      );
      expect(isActiveForContext).toBe(false);
    });

    it("is not active on Polaris", () => {
      const { isActiveForContext } = witnessAreaSubscriber(
        makeArgs(makeContext({ currentHref: "https://polaris-qa-notprod.cps.gov.uk/polaris-ui/case-details/abc/123" } as any)),
      );
      expect(isActiveForContext).toBe(false);
    });

    it("is not active when currentHref is undefined", () => {
      const { isActiveForContext } = witnessAreaSubscriber(makeArgs(makeContext({ currentHref: undefined } as any)));
      expect(isActiveForContext).toBe(false);
    });

    it("is not active when the feature flag is off, even on a CaseOverview URL", () => {
      const disabled = createWitnessAreaSubscriber(false);
      const { isActiveForContext } = disabled(makeArgs(makeContext()));
      expect(isActiveForContext).toBe(false);
    });
  });

  describe("subscription handler", () => {
    const getHandler = () => {
      const { subscriptions } = witnessAreaSubscriber(makeArgs(makeContext()));
      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0].cssSelector).toBe("div#WitnessIsActive");
      return subscriptions[0].handler;
    };

    it("adds a cps-region when the div is visible and no region exists", () => {
      const div = document.createElement("div");
      div.id = "WitnessIsActive";
      document.body.appendChild(div);

      getHandler()(div);

      const region = div.querySelector("cps-region");
      expect(region).not.toBeNull();
      expect(region?.getAttribute("code")).toBe("witness");
    });

    it("does not add a second cps-region when one already exists", () => {
      const div = document.createElement("div");
      div.id = "WitnessIsActive";
      document.body.appendChild(div);

      getHandler()(div);
      getHandler()(div);

      expect(div.querySelectorAll("cps-region")).toHaveLength(1);
    });

    it("removes the cps-region when the div becomes display:none", () => {
      const div = document.createElement("div");
      div.id = "WitnessIsActive";
      document.body.appendChild(div);

      getHandler()(div);
      expect(div.querySelector("cps-region")).not.toBeNull();

      div.style.display = "none";
      getHandler()(div);

      expect(div.querySelector("cps-region")).toBeNull();
    });

    it("re-adds the cps-region when the div becomes visible again", () => {
      const div = document.createElement("div");
      div.id = "WitnessIsActive";
      document.body.appendChild(div);

      getHandler()(div);
      div.style.display = "none";
      getHandler()(div);
      div.style.display = "";
      getHandler()(div);

      expect(div.querySelector("cps-region")).not.toBeNull();
    });

    it("does nothing when the div starts hidden and no region exists yet", () => {
      const div = document.createElement("div");
      div.id = "WitnessIsActive";
      div.style.display = "none";
      document.body.appendChild(div);

      getHandler()(div);

      expect(div.querySelector("cps-region")).toBeNull();
    });
  });
});
