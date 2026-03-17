import { FoundContext } from "../../context/FoundContext";
import { hostAppEventSubscriber } from "./host-app-event-subscriber";
import { HostAppEvent } from "../../analytics/host-app-event";

const makeContext = (overrides: Partial<FoundContext> = {}): FoundContext =>
  ({
    found: true,
    contextIds: "case review",
    hostAppEventTargets: [{ selector: "#b1-Resume", action: "click" }],
    ...overrides,
  }) as unknown as FoundContext;

const makeSubscriberArgs = (context: FoundContext) =>
  ({
    context,
    register: jest.fn(),
    mergeTags: jest.fn(),
    window: globalThis.window,
    preview: { found: false },
    settings: { found: false },
  }) as any;

describe("hostAppEventSubscriber", () => {
  it("is active when hostAppEventTargets has entries", () => {
    const { isActiveForContext } = hostAppEventSubscriber(makeSubscriberArgs(makeContext()));
    expect(isActiveForContext).toBe(true);
  });

  it("is not active when hostAppEventTargets is undefined", () => {
    const { isActiveForContext } = hostAppEventSubscriber(
      makeSubscriberArgs(makeContext({ hostAppEventTargets: undefined } as any)),
    );
    expect(isActiveForContext).toBe(false);
  });

  it("is not active when hostAppEventTargets is empty", () => {
    const { isActiveForContext } = hostAppEventSubscriber(
      makeSubscriberArgs(makeContext({ hostAppEventTargets: [] } as any)),
    );
    expect(isActiveForContext).toBe(false);
  });

  it("creates a subscription per target", () => {
    const context = makeContext({
      hostAppEventTargets: [
        { selector: "#b1-Resume", action: "click" },
        { selector: "#b1-TaskCompleted2", action: "appear" },
      ],
    } as any);
    const { subscriptions } = hostAppEventSubscriber(makeSubscriberArgs(context));
    expect(subscriptions).toHaveLength(2);
    expect(subscriptions[0].cssSelector).toBe("#b1-Resume");
    expect(subscriptions[1].cssSelector).toBe("#b1-TaskCompleted2");
  });

  describe("click action", () => {
    it("attaches a click listener and returns true to unbind", () => {
      const { subscriptions } = hostAppEventSubscriber(makeSubscriberArgs(makeContext()));
      const element = document.createElement("button");
      const addEventListenerSpy = jest.spyOn(element, "addEventListener");

      const shouldUnbind = subscriptions[0].handler(element);

      expect(shouldUnbind).toBe(true);
      expect(addEventListenerSpy).toHaveBeenCalledWith("click", expect.any(Function), { passive: true, once: true });
    });

    it("dispatches a HostAppEvent on click", () => {
      const { subscriptions } = hostAppEventSubscriber(makeSubscriberArgs(makeContext()));
      const element = document.createElement("button");

      subscriptions[0].handler(element);

      const events: HostAppEvent[] = [];
      window.addEventListener(HostAppEvent.type, (ev: HostAppEvent) => events.push(ev));

      element.click();

      expect(events).toHaveLength(1);
      expect(events[0].detail).toEqual({
        action: "click",
        elementId: "#b1-Resume",
        contextIds: "case review",
      });
    });
  });

  describe("appear action", () => {
    const makeAppearContext = () =>
      makeContext({
        hostAppEventTargets: [{ selector: "#b1-TaskCompleted2", action: "appear" }],
      } as any);

    it("dispatches a HostAppEvent immediately when element is found", () => {
      const { subscriptions } = hostAppEventSubscriber(makeSubscriberArgs(makeAppearContext()));
      const element = document.createElement("div");

      const events: HostAppEvent[] = [];
      window.addEventListener(HostAppEvent.type, (ev: HostAppEvent) => events.push(ev));

      subscriptions[0].handler(element);

      expect(events).toHaveLength(1);
      expect(events[0].detail).toEqual({
        action: "appear",
        elementId: "#b1-TaskCompleted2",
        contextIds: "case review",
      });
    });

    it("does not attach a click listener", () => {
      const { subscriptions } = hostAppEventSubscriber(makeSubscriberArgs(makeAppearContext()));
      const element = document.createElement("div");
      const addEventListenerSpy = jest.spyOn(element, "addEventListener");

      subscriptions[0].handler(element);

      expect(addEventListenerSpy).not.toHaveBeenCalled();
    });

    it("returns true to unbind the arrive subscription", () => {
      const { subscriptions } = hostAppEventSubscriber(makeSubscriberArgs(makeAppearContext()));
      const element = document.createElement("div");

      const shouldUnbind = subscriptions[0].handler(element);

      expect(shouldUnbind).toBe(true);
    });

    it("only dispatches once even if handler is called multiple times", () => {
      const { subscriptions } = hostAppEventSubscriber(makeSubscriberArgs(makeAppearContext()));

      const events: HostAppEvent[] = [];
      window.addEventListener(HostAppEvent.type, (ev: HostAppEvent) => events.push(ev));

      subscriptions[0].handler(document.createElement("div"));
      subscriptions[0].handler(document.createElement("div"));
      subscriptions[0].handler(document.createElement("div"));

      expect(events).toHaveLength(1);
    });
  });
});
