import { describe, test, expect } from "@jest/globals";
import {
  notificationSchema,
  notificationsFileSchema,
  dismissedNotificationIdsSchema,
} from "./Notification";

describe("notificationSchema", () => {
  const base = {
    id: "maintenance-2026-04-20",
    bodyHtml: "<p>Planned maintenance</p>",
  };

  test("accepts the minimal shape", () => {
    expect(notificationSchema.parse(base)).toEqual(base);
  });

  test("accepts the full shape", () => {
    const full = {
      ...base,
      heading: "Service unavailable",
      from: "2026-04-20T22:00:00Z",
      to: "2026-04-21T02:00:00Z",
      previewModeRequired: true,
      dismissible: false,
    };
    expect(notificationSchema.parse(full)).toEqual(full);
  });

  test("rejects missing id", () => {
    expect(() => notificationSchema.parse({ ...base, id: "" })).toThrow();
    const { id, ...withoutId } = base;
    expect(() => notificationSchema.parse(withoutId)).toThrow();
  });

  test("rejects malformed from/to", () => {
    expect(() => notificationSchema.parse({ ...base, from: "yesterday" })).toThrow();
    expect(() => notificationSchema.parse({ ...base, to: "2026-13-40" })).toThrow();
  });
});

describe("notificationsFileSchema", () => {
  test("accepts an empty list", () => {
    expect(notificationsFileSchema.parse({ notifications: [] })).toEqual({ notifications: [] });
  });
});

describe("dismissedNotificationIdsSchema", () => {
  test("accepts an empty array", () => {
    expect(dismissedNotificationIdsSchema.parse([])).toEqual([]);
  });

  test("accepts an array of strings", () => {
    expect(dismissedNotificationIdsSchema.parse(["a", "b"])).toEqual(["a", "b"]);
  });

  test("rejects non-string entries", () => {
    expect(() => dismissedNotificationIdsSchema.parse(["a", 1])).toThrow();
  });
});
