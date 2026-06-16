jest.mock("arrive", () => {});

import { initialiseDarkReaderDetection } from "./initialise-dark-reader-detection";

const makeWindow = (initialAttrs: string[] = []) => {
  const attrNames = new Set(initialAttrs);
  let arriveHandler: ((el: Element) => void) | undefined;
  const unbound = { count: 0 };

  const html = {
    getAttributeNames: () => Array.from(attrNames),
  } as unknown as Element;

  const document = {
    arrive: (_selector: string, _opts: unknown, handler: (el: Element) => void) => {
      arriveHandler = handler;
      // `existing: true` semantics — fire immediately for matching elements
      handler(html);
    },
    unbindArrive: (handler: (el: Element) => void) => {
      if (handler === arriveHandler) {
        arriveHandler = undefined;
        unbound.count++;
      }
    },
  } as unknown as Document;

  const window = { document };

  return {
    window,
    addAttribute: (name: string) => attrNames.add(name),
    triggerAttributeChange: () => arriveHandler?.(html),
    unbound,
  };
};

describe("initialiseDarkReaderDetection", () => {
  it("fires immediately when <html> already carries a darkreader attribute", () => {
    const trackEvent = jest.fn();
    const { window, unbound } = makeWindow(["data-darkreader-mode"]);

    initialiseDarkReaderDetection({ window, trackEvent });

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith({ name: "dark-reader-detected" });
    expect(unbound.count).toBe(1);
  });

  it("does not fire when <html> has no darkreader attributes", () => {
    const trackEvent = jest.fn();
    const { window, unbound } = makeWindow(["lang", "data-theme"]);

    initialiseDarkReaderDetection({ window, trackEvent });

    expect(trackEvent).not.toHaveBeenCalled();
    expect(unbound.count).toBe(0);
  });

  it("fires when a darkreader attribute appears later via attribute mutation", () => {
    const trackEvent = jest.fn();
    const { window, addAttribute, triggerAttributeChange } = makeWindow(["lang"]);

    initialiseDarkReaderDetection({ window, trackEvent });
    expect(trackEvent).not.toHaveBeenCalled();

    addAttribute("data-darkreader-scheme");
    triggerAttributeChange();

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith({ name: "dark-reader-detected" });
  });

  it("unbinds after firing so subsequent attribute changes don't re-fire", () => {
    const trackEvent = jest.fn();
    const { window, addAttribute, triggerAttributeChange, unbound } = makeWindow();

    initialiseDarkReaderDetection({ window, trackEvent });
    addAttribute("data-darkreader-mode");
    triggerAttributeChange();
    triggerAttributeChange();

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(unbound.count).toBe(1);
  });

  it("matches darkreader case-insensitively", () => {
    const trackEvent = jest.fn();
    const { window } = makeWindow(["data-DarkReader-Mode"]);

    initialiseDarkReaderDetection({ window, trackEvent });

    expect(trackEvent).toHaveBeenCalledWith({ name: "dark-reader-detected" });
  });
});
