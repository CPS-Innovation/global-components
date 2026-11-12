import { newSpecPage, SpecPage } from "@stencil/core/testing";
import { CpsGlobalCaseLockingInterstitial } from "./cps-global-case-locking-interstitial";
import { initialiseStore, Register } from "../../store/store";
import { CaseLockingPresentUsers } from "../../services/case-locking/CaseLockingPresentUsers";

const config = { CASE_LOCKING_API_URL: "https://example.org", FEATURE_FLAG_CASE_LOCKING_USERS: { generallyAvailable: true } } as any;
const inRegion = (code: string) => ({ found: true, caseLockingRegion: { code } }) as any;
const locked = { found: true, result: { isLocked: true } } as any;

// Everything render() requires, on a case review page, with NO presence at all.
const ready = { config, context: inRegion("case_review"), preview: { found: true, result: {} } as any, authHint: { found: false } as any };

const occupied = (code: string, kind: string): CaseLockingPresentUsers => ({
  sections: [{ code, occupiedOnEntry: true, members: [{ userEmail: "a@cps.gov.uk", sourceApplication: "CMS", sections: [{ kind, isCurrent: true }] }] }],
});

describe("cps-global-case-locking-interstitial", () => {
  let register: Register;
  let page: SpecPage;

  const mount = async (state: Parameters<Register>[0]) => {
    register(state);
    page = await newSpecPage({
      components: [CpsGlobalCaseLockingInterstitial],
      html: `<cps-global-case-locking-interstitial></cps-global-case-locking-interstitial>`,
    });
  };

  const heading = () => page.root!.querySelector("#cps-interruption-heading")?.textContent;

  beforeEach(() => {
    // The spec DOM has no top layer; showModal/close only need to exist and flip `open`.
    const proto = (window as any).HTMLElement.prototype;
    proto.showModal = function () {
      this.open = true;
    };
    proto.close = function () {
      this.open = false;
    };
    ({ register } = initialiseStore());
  });

  it("interrupts for a lock when presence has never been published", async () => {
    await mount({ ...ready, caseDetails: locked });

    expect(heading()).toContain("locked");
  });

  it("interrupts for a lock when presence reports nobody as undefined", async () => {
    await mount({ ...ready, caseLockingPresentUsers: undefined, caseDetails: locked });

    expect(heading()).toContain("locked");
  });

  it("stays away with no lock and no presence", async () => {
    await mount(ready);

    expect(page.root!.querySelector("dialog")).toBeNull();
  });

  it("still interrupts for presence in a section worth interrupting for", async () => {
    await mount({ ...ready, caseLockingPresentUsers: occupied("case_review", "CASE_REVIEW") });

    expect(page.root!.querySelector("dialog")).not.toBeNull();
  });

  it("does not interrupt for a lock in a region that does not interrupt", async () => {
    await mount({ ...ready, context: inRegion("case"), caseDetails: locked });

    expect(page.root!.querySelector("dialog")).toBeNull();
  });
});
