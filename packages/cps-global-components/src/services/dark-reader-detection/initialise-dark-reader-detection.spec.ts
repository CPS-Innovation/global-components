import { Config } from "cps-global-configuration";
import { initialiseDarkReaderDetection } from "./initialise-dark-reader-detection";

const STORAGE_KEY = "cps-global-components.dark-reader-detected";

const config = { PROBE_DARK_READER_USAGE: true } as unknown as Config;

const makeWindow = ({ htmlAttrs = [], storageThrows = false, seed }: { htmlAttrs?: string[]; storageThrows?: boolean; seed?: string } = {}) => {
  const attrs = new Set(htmlAttrs);
  const store = new Map<string, string>();
  if (seed !== undefined) {
    store.set(STORAGE_KEY, seed);
  }

  let observerCallback: (() => void) | undefined;
  const observe = jest.fn();
  const disconnect = jest.fn();

  // Minimal MutationObserver stand-in: captures the callback so the test can trigger it.
  class FakeMutationObserver {
    constructor(cb: () => void) {
      observerCallback = cb;
    }
    observe = observe;
    disconnect = disconnect;
  }

  const localStorage = {
    getItem: (key: string) => {
      if (storageThrows) {
        throw new Error("storage unavailable");
      }
      return store.has(key) ? store.get(key)! : null;
    },
    setItem: (key: string, value: string) => {
      if (storageThrows) {
        throw new Error("storage unavailable");
      }
      store.set(key, value);
    },
  };

  const html = { getAttributeNames: () => Array.from(attrs) };

  const window = {
    document: { documentElement: html },
    MutationObserver: FakeMutationObserver,
    localStorage,
  } as unknown as Window & typeof globalThis;

  return {
    window,
    store,
    observe,
    disconnect,
    addAttribute: (name: string) => attrs.add(name),
    triggerMutation: () => observerCallback?.(),
  };
};

describe("initialiseDarkReaderDetection", () => {
  it("fires immediately and stamps storage when <html> already carries a darkreader attribute", () => {
    const trackEvent = jest.fn();
    const { window, store, observe } = makeWindow({ htmlAttrs: ["data-darkreader-mode"] });

    initialiseDarkReaderDetection({ window, config, trackEvent });

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith({ name: "dark-reader-detected", detection: "sync" });
    // No observer needed — we found it synchronously.
    expect(observe).not.toHaveBeenCalled();
    const stamped = store.get(STORAGE_KEY)!;
    expect(Number.isNaN(Date.parse(stamped))).toBe(false);
  });

  it("does nothing when PROBE_DARK_READER_USAGE is not enabled", () => {
    const trackEvent = jest.fn();
    const { window, observe } = makeWindow({ htmlAttrs: ["data-darkreader-mode"] });
    const disabledConfig = { PROBE_DARK_READER_USAGE: false } as unknown as Config;

    initialiseDarkReaderDetection({ window, config: disabledConfig, trackEvent });

    expect(trackEvent).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
  });

  it("does nothing when PROBE_DARK_READER_USAGE is absent (off by default in the consumer)", () => {
    const trackEvent = jest.fn();
    const { window, observe } = makeWindow({ htmlAttrs: ["data-darkreader-mode"] });
    const emptyConfig = {} as unknown as Config;

    initialiseDarkReaderDetection({ window, config: emptyConfig, trackEvent });

    expect(trackEvent).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
  });

  it("observes only <html>'s own attributes (no childList, no subtree)", () => {
    const trackEvent = jest.fn();
    const { window, observe } = makeWindow({ htmlAttrs: ["lang"] });

    initialiseDarkReaderDetection({ window, config, trackEvent });

    expect(observe).toHaveBeenCalledTimes(1);
    const [target, options] = observe.mock.calls[0];
    expect(target).toBe(window.document.documentElement);
    expect(options).toEqual({ attributes: true });
    expect(options).not.toHaveProperty("childList");
    expect(options).not.toHaveProperty("subtree");
  });

  it("fires when a darkreader attribute appears later, then disconnects", () => {
    const trackEvent = jest.fn();
    const { window, addAttribute, triggerMutation, disconnect } = makeWindow({ htmlAttrs: ["lang"] });

    initialiseDarkReaderDetection({ window, config, trackEvent });
    expect(trackEvent).not.toHaveBeenCalled();

    addAttribute("data-darkreader-scheme");
    triggerMutation();

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith({ name: "dark-reader-detected", detection: "async" });
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("does not fire on mutations that don't introduce a darkreader attribute", () => {
    const trackEvent = jest.fn();
    const { window, addAttribute, triggerMutation, disconnect } = makeWindow();

    initialiseDarkReaderDetection({ window, config, trackEvent });
    addAttribute("data-theme");
    triggerMutation();

    expect(trackEvent).not.toHaveBeenCalled();
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("matches darkreader case-insensitively", () => {
    const trackEvent = jest.fn();
    const { window } = makeWindow({ htmlAttrs: ["data-DarkReader-Mode"] });

    initialiseDarkReaderDetection({ window, config, trackEvent });

    expect(trackEvent).toHaveBeenCalledWith({ name: "dark-reader-detected", detection: "sync" });
  });

  it("does not set up an observer or fire when storage already holds a value (cross-load gate)", () => {
    const trackEvent = jest.fn();
    const { window, observe } = makeWindow({ seed: "2026-06-17T00:00:00.000Z" });

    initialiseDarkReaderDetection({ window, config, trackEvent });

    expect(observe).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("treats a storage-read failure as not-yet-seen so detection still runs", () => {
    const trackEvent = jest.fn();
    const { window, observe } = makeWindow({ storageThrows: true });

    initialiseDarkReaderDetection({ window, config, trackEvent });

    // Read threw → we proceed to observe rather than skipping.
    expect(observe).toHaveBeenCalledTimes(1);
  });

  it("does not throw when stamping storage fails on detection", () => {
    const trackEvent = jest.fn();
    const { window, triggerMutation, addAttribute } = makeWindow({ storageThrows: true });

    initialiseDarkReaderDetection({ window, config, trackEvent });
    addAttribute("data-darkreader-mode");

    expect(() => triggerMutation()).not.toThrow();
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });
});
