import { regionRegistry } from "./region-registry";
import { RegionEnterEvent, RegionLeaveEvent } from "./region-events";

describe("regionRegistry", () => {
  it("dispatches a RegionEnterEvent on enter", () => {
    const events: RegionEnterEvent[] = [];
    document.addEventListener(RegionEnterEvent.type, e => events.push(e as RegionEnterEvent));

    const el = document.createElement("div");
    regionRegistry.enter(el, "context-details");

    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(RegionEnterEvent);
    expect(events[0].detail).toEqual({ code: "context-details" });
  });

  it("dispatches a RegionLeaveEvent on leave", () => {
    const events: RegionLeaveEvent[] = [];
    document.addEventListener(RegionLeaveEvent.type, e => events.push(e as RegionLeaveEvent));

    const el = document.createElement("div");
    regionRegistry.leave(el, "context-details");

    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(RegionLeaveEvent);
    expect(events[0].detail).toEqual({ code: "context-details" });
  });

  it("dispatched events bubble", () => {
    const enter = new RegionEnterEvent({ code: "x" });
    const leave = new RegionLeaveEvent({ code: "x" });
    expect(enter.bubbles).toBe(true);
    expect(leave.bubbles).toBe(true);
  });
});
