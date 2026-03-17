import { FoundContext } from "../../context/FoundContext";
import { hostAppEventSubscriber } from "./host-app-event-subscriber";
import { HostAppEvent } from "../../analytics/host-app-event";

const makeContext = (overrides: Partial<FoundContext> = {}): FoundContext =>
  ({
    found: true,
    contextIds: "case review",
    hostAppEventTargets: ["#b1-Resume"],
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

  it("creates a subscription per target selector", () => {
    const context = makeContext({ hostAppEventTargets: ["#b1-Resume", "#b2-Other"] } as any);
    const { subscriptions } = hostAppEventSubscriber(makeSubscriberArgs(context));
    expect(subscriptions).toHaveLength(2);
    expect(subscriptions[0].cssSelector).toBe("#b1-Resume");
    expect(subscriptions[1].cssSelector).toBe("#b2-Other");
  });

  it("handler attaches a click listener and returns true to unbind", () => {
    const { subscriptions } = hostAppEventSubscriber(makeSubscriberArgs(makeContext()));
    const element = document.createElement("button");
    element.id = "b1-Resume";
    const addEventListenerSpy = jest.spyOn(element, "addEventListener");

    const shouldUnbind = subscriptions[0].handler(element);

    expect(shouldUnbind).toBe(true);
    expect(addEventListenerSpy).toHaveBeenCalledWith("click", expect.any(Function), { passive: true, once: true });
  });

  it("click listener dispatches a HostAppEvent", () => {
    const { subscriptions } = hostAppEventSubscriber(makeSubscriberArgs(makeContext()));
    const element = document.createElement("button");
    element.id = "b1-Resume";

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

  it("click listener fires only once", () => {
    const { subscriptions } = hostAppEventSubscriber(makeSubscriberArgs(makeContext()));
    const element = document.createElement("button");
    const addEventListenerSpy = jest.spyOn(element, "addEventListener");

    subscriptions[0].handler(element);

    // Verify once: true is passed so the browser removes the listener after first click
    expect(addEventListenerSpy).toHaveBeenCalledWith("click", expect.any(Function), { passive: true, once: true });
  });
});
