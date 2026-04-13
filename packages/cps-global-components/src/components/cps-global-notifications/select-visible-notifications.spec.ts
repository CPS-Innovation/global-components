import { Notification } from "cps-global-configuration";
import { selectVisibleNotifications } from "./select-visible-notifications";

const n = (overrides: Partial<Notification> & Pick<Notification, "id">): Notification => ({
  severity: "info",
  bodyHtml: "<p>x</p>",
  ...overrides,
});

const now = new Date("2026-04-13T12:00:00Z");

describe("selectVisibleNotifications", () => {
  it("returns nothing when the list is empty", () => {
    expect(selectVisibleNotifications({ notifications: [], dismissedIds: [], previewEnabled: false, now })).toEqual([]);
  });

  it("excludes dismissed notifications", () => {
    const result = selectVisibleNotifications({
      notifications: [n({ id: "a" }), n({ id: "b" })],
      dismissedIds: ["a"],
      previewEnabled: false,
      now,
    });
    expect(result.map(x => x.id)).toEqual(["b"]);
  });

  it("excludes previewModeRequired when preview is disabled", () => {
    const result = selectVisibleNotifications({
      notifications: [n({ id: "a" }), n({ id: "b", previewModeRequired: true })],
      dismissedIds: [],
      previewEnabled: false,
      now,
    });
    expect(result.map(x => x.id)).toEqual(["a"]);
  });

  it("includes previewModeRequired when preview is enabled", () => {
    const result = selectVisibleNotifications({
      notifications: [n({ id: "a", previewModeRequired: true })],
      dismissedIds: [],
      previewEnabled: true,
      now,
    });
    expect(result.map(x => x.id)).toEqual(["a"]);
  });

  it("excludes notifications whose from is in the future", () => {
    const result = selectVisibleNotifications({
      notifications: [n({ id: "future", from: "2026-05-01T00:00:00Z" }), n({ id: "live", from: "2026-04-01T00:00:00Z" })],
      dismissedIds: [],
      previewEnabled: false,
      now,
    });
    expect(result.map(x => x.id)).toEqual(["live"]);
  });

  it("excludes notifications whose to is in the past", () => {
    const result = selectVisibleNotifications({
      notifications: [n({ id: "expired", to: "2026-04-12T00:00:00Z" }), n({ id: "live", to: "2026-05-01T00:00:00Z" })],
      dismissedIds: [],
      previewEnabled: false,
      now,
    });
    expect(result.map(x => x.id)).toEqual(["live"]);
  });

  it("treats absent from as open-ended past", () => {
    const result = selectVisibleNotifications({
      notifications: [n({ id: "a" })],
      dismissedIds: [],
      previewEnabled: false,
      now,
    });
    expect(result.map(x => x.id)).toEqual(["a"]);
  });

  it("orders by severity first (warning > important > info)", () => {
    const result = selectVisibleNotifications({
      notifications: [
        n({ id: "c-info", severity: "info" }),
        n({ id: "a-warning", severity: "warning" }),
        n({ id: "b-important", severity: "important" }),
      ],
      dismissedIds: [],
      previewEnabled: false,
      now,
    });
    expect(result.map(x => x.id)).toEqual(["a-warning", "b-important", "c-info"]);
  });

  it("orders by from ascending within a severity", () => {
    const result = selectVisibleNotifications({
      notifications: [
        n({ id: "later", severity: "info", from: "2026-04-10T00:00:00Z" }),
        n({ id: "earlier", severity: "info", from: "2026-04-01T00:00:00Z" }),
      ],
      dismissedIds: [],
      previewEnabled: false,
      now,
    });
    expect(result.map(x => x.id)).toEqual(["earlier", "later"]);
  });

  it("uses id as stable tiebreaker", () => {
    const result = selectVisibleNotifications({
      notifications: [n({ id: "b" }), n({ id: "a" })],
      dismissedIds: [],
      previewEnabled: false,
      now,
    });
    expect(result.map(x => x.id)).toEqual(["a", "b"]);
  });
});
