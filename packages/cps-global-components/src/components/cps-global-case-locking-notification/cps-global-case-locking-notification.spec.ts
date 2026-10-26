import { newSpecPage, SpecPage } from "@stencil/core/testing";
import { CpsGlobalCaseLockingNotification } from "./cps-global-case-locking-notification";
import { initialiseStore, Register } from "../../store/store";
import { CaseLockingPresentUsers } from "../../services/case-locking/CaseLockingPresentUsers";

const SETTLE_MS = 500;
const ALL_CLEAR = "Nobody else is working on this case now";

const present = (...users: string[]): CaseLockingPresentUsers => ({
  sections: [{ code: "CASE", occupiedOnEntry: false, users: users.map(user => ({ user, appName: "CMS", sections: [{ kind: "CASE", isCurrent: true }] })) }],
});
const nobody: CaseLockingPresentUsers = { sections: [] };

// The banner is switched on through preview, the same way it is in QA: case locking
// needs an API URL and the preview opt-in, and the notifications are a second opt-in.
const preview = (caseLockingNotifications: boolean) => ({ found: true, result: { caseLocking: true, caseLockingNotifications } }) as any;

// Everything render() requires to be ready, with nobody on the case.
const ready = { config: { CASE_LOCKING_API_URL: "https://example.org" } as any, preview: preview(true), authHint: { found: false } as any, caseLockingPresentUsers: nobody };

describe("cps-global-case-locking-notification live region", () => {
  let register: Register;
  let page: SpecPage;

  const statusText = () => page.root!.querySelector('[role="status"]')!.textContent;

  const update = async (arg: Parameters<Register>[0]) => {
    register(arg);
    await page.waitForChanges();
  };

  const settle = async () => {
    jest.advanceTimersByTime(SETTLE_MS);
    await page.waitForChanges();
  };

  const mount = async (initial: Parameters<Register>[0] = {}) => {
    register(initial);
    page = await newSpecPage({
      components: [CpsGlobalCaseLockingNotification],
      html: `<cps-global-case-locking-notification></cps-global-case-locking-notification>`,
    });
  };

  beforeEach(() => {
    // Stencil's spec runtime schedules renders with process.nextTick, which Jest
    // fakes by default and nothing would ever advance — so only the timers are fake.
    jest.useFakeTimers({ doNotFake: ["nextTick", "queueMicrotask", "setImmediate"] });
    ({ register } = initialiseStore());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders an empty status region before the store is ready", async () => {
    await mount();

    expect(statusText()).toBe("");
  });

  it("holds back a summary that is already in the store at first render, then speaks it once settled", async () => {
    await mount({ ...ready, caseLockingPresentUsers: present("a@cps.gov.uk") });

    expect(statusText()).toBe("");

    await settle();

    expect(statusText()).toBe("1 other person is working on this case");
  });

  it("speaks a summary that arrives after the region has settled", async () => {
    await mount(ready);
    await settle();
    expect(statusText()).toBe("");

    await update({ caseLockingPresentUsers: present("a@cps.gov.uk", "b@cps.gov.uk") });

    expect(statusText()).toBe("2 other people are working on this case");
  });

  it("speaks a lock on its own, with nobody present", async () => {
    await mount(ready);
    await settle();

    await update({ caseDetails: { found: true, result: { isLocked: true } } as any });

    expect(statusText()).toBe("This case is locked");
  });

  it("leaves the text alone when a poll finds the same people", async () => {
    await mount(ready);
    await settle();
    await update({ caseLockingPresentUsers: present("a@cps.gov.uk") });

    // A different object, so the store does see a change and re-renders.
    const again = present("a@cps.gov.uk");
    again!.sections[0].users[0].joinedAt = "2026-10-26T09:00:00Z";
    await update({ caseLockingPresentUsers: again });

    expect(statusText()).toBe("1 other person is working on this case");
  });

  describe("when the banner goes away", () => {
    it("says nobody else is on the case if a summary was spoken", async () => {
      await mount(ready);
      await settle();
      await update({ caseLockingPresentUsers: present("a@cps.gov.uk") });

      await update({ caseLockingPresentUsers: nobody });

      expect(statusText()).toBe(ALL_CLEAR);
    });

    it("says nobody else is on the case when a lock is lifted", async () => {
      await mount(ready);
      await settle();
      await update({ caseDetails: { found: true, result: { isLocked: true } } as any });

      await update({ caseDetails: { found: true, result: { isLocked: false } } as any });

      expect(statusText()).toBe(ALL_CLEAR);
    });

    it("says nothing if the banner came and went before anything was spoken", async () => {
      await mount(ready);
      await update({ caseLockingPresentUsers: present("a@cps.gov.uk") });
      await update({ caseLockingPresentUsers: nobody });

      await settle();

      expect(statusText()).toBe("");
    });

    it("says nothing when the feature is switched off", async () => {
      await mount(ready);
      await settle();
      await update({ caseLockingPresentUsers: present("a@cps.gov.uk") });

      await update({ preview: preview(false) });

      expect(statusText()).toBe("");
    });

    it("says nothing when the store stops being ready", async () => {
      await mount(ready);
      await settle();
      await update({ caseLockingPresentUsers: present("a@cps.gov.uk") });

      await update({ caseLockingPresentUsers: undefined });

      expect(statusText()).toBe("");
    });
  });

  it("still becomes ready if moved in the DOM before it has settled", async () => {
    await mount({ ...ready, caseLockingPresentUsers: present("a@cps.gov.uk") });
    const el = page.root!;

    el.remove();
    await page.waitForChanges();
    page.body.appendChild(el);
    await page.waitForChanges();

    await settle();

    expect(statusText()).toBe("1 other person is working on this case");
  });
});
