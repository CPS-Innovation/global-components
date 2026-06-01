import {
  initialisePageLifecycle,
  navigationAbortSignal,
  isPageUnloading,
  isAbortError,
  __resetPageLifecycleForTests,
} from "./page-lifecycle";

describe("page-lifecycle", () => {
  let win: Window;
  let handlers: Record<string, EventListener[]>;
  let addSpy: jest.Mock;

  beforeEach(() => {
    __resetPageLifecycleForTests();
    handlers = {};
    addSpy = jest.fn((type: string, fn: EventListener) => {
      (handlers[type] ??= []).push(fn);
    });
    win = { addEventListener: addSpy } as unknown as Window;
  });

  // Invoke the registered pagehide handler directly with a plain event-like
  // object — avoids the Stencil mock Event / EventTarget machinery.
  const firePageHide = (persisted: boolean) => {
    (handlers["pagehide"] ?? []).forEach(fn => fn({ persisted } as unknown as Event));
  };

  it("starts not-unloading with a non-aborted signal", () => {
    initialisePageLifecycle(win);
    expect(isPageUnloading()).toBe(false);
    expect(navigationAbortSignal().aborted).toBe(false);
  });

  it("aborts the signal and flips isPageUnloading on a non-persisted pagehide", () => {
    initialisePageLifecycle(win);
    firePageHide(false);
    expect(isPageUnloading()).toBe(true);
    expect(navigationAbortSignal().aborted).toBe(true);
  });

  it("aborts with a typed AbortError reason", () => {
    initialisePageLifecycle(win);
    firePageHide(false);
    expect(isAbortError(navigationAbortSignal().reason)).toBe(true);
  });

  it("does NOT abort on a persisted (bfcache) pagehide", () => {
    initialisePageLifecycle(win);
    firePageHide(true);
    expect(isPageUnloading()).toBe(false);
    expect(navigationAbortSignal().aborted).toBe(false);
  });

  it("is idempotent — only binds one pagehide listener even if initialised twice", () => {
    initialisePageLifecycle(win);
    initialisePageLifecycle(win);
    expect(addSpy.mock.calls.filter(([type]) => type === "pagehide")).toHaveLength(1);
  });

  describe("isAbortError", () => {
    it("recognises a DOMException with name AbortError", () => {
      expect(isAbortError(new DOMException("x", "AbortError"))).toBe(true);
    });
    it("rejects other errors", () => {
      expect(isAbortError(new TypeError("Failed to fetch"))).toBe(false);
      expect(isAbortError(new Error("boom"))).toBe(false);
      expect(isAbortError(undefined)).toBe(false);
    });
  });
});
