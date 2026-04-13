import { initialiseNotifications } from "./initialise-notifications";
import { Handlers } from "../handlers/handlers";

describe("initialiseNotifications", () => {
  const rootUrl = "https://example.com/env/components/script.js";
  const notificationsUrl = "https://example.com/env/components/notification.json";
  const stateUrl = "https://example.com/env/state/dismissed-notifications";

  let register: jest.Mock;
  let fetchSpy: jest.SpyInstance;
  let handlers: Handlers;

  type MockCall = { method: string; url: string; body?: unknown };

  const mockResponses = (responses: Record<string, { ok?: boolean; body?: unknown }>) => {
    fetchSpy.mockImplementation((url: string) => {
      const spec = responses[url];
      if (!spec) {
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }
      return Promise.resolve({
        ok: spec.ok !== false,
        json: async () => spec.body,
      } as Response);
    });
  };

  const getCalls = (): MockCall[] =>
    fetchSpy.mock.calls.map(([url, init]) => ({
      method: init?.method ?? "GET",
      url,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    }));

  beforeEach(() => {
    register = jest.fn();
    fetchSpy = jest.spyOn(global, "fetch" as any);
    handlers = { dismissNotification: () => {} };
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("is a no-op when disabled — no fetches, no register, no handler rebind", async () => {
    fetchSpy.mockImplementation(() => Promise.reject(new Error("should not fetch when disabled")));
    const originalHandler = handlers.dismissNotification;

    await initialiseNotifications({ rootUrl, register, handlers, config: { SHOW_NOTIFICATIONS: false } as any });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
    expect(handlers.dismissNotification).toBe(originalHandler);
  });

  it("fetches notifications and dismissed state in parallel and registers both", async () => {
    mockResponses({
      [notificationsUrl]: { body: { notifications: [{ id: "a", severity: "info", bodyHtml: "<p>a</p>" }] } },
      [stateUrl]: { body: ["a"] },
    });

    await initialiseNotifications({ rootUrl, register, handlers, config: { SHOW_NOTIFICATIONS: true } as any });

    expect(register).toHaveBeenCalledWith({
      notifications: [{ id: "a", severity: "info", bodyHtml: "<p>a</p>" }],
      dismissedNotificationIds: ["a"],
    });
  });

  it("registers empty when notification.json fetch fails", async () => {
    mockResponses({
      [notificationsUrl]: { ok: false, body: {} },
      [stateUrl]: { body: [] },
    });

    await initialiseNotifications({ rootUrl, register, handlers, config: { SHOW_NOTIFICATIONS: true } as any });

    expect(register).toHaveBeenCalledWith({ notifications: [], dismissedNotificationIds: [] });
  });

  it("defaults to empty dismissed when state endpoint returns null", async () => {
    mockResponses({
      [notificationsUrl]: { body: { notifications: [{ id: "a", severity: "info", bodyHtml: "<p>a</p>" }] } },
      [stateUrl]: { body: null },
    });

    await initialiseNotifications({ rootUrl, register, handlers, config: { SHOW_NOTIFICATIONS: true } as any });

    expect(register).toHaveBeenCalledWith({
      notifications: [{ id: "a", severity: "info", bodyHtml: "<p>a</p>" }],
      dismissedNotificationIds: [],
    });
  });

  it("prunes stale dismissed ids and PUTs the pruned list back", async () => {
    mockResponses({
      [notificationsUrl]: { body: { notifications: [{ id: "a", severity: "info", bodyHtml: "<p>a</p>" }] } },
      [stateUrl]: { body: ["a", "stale"] },
    });

    await initialiseNotifications({ rootUrl, register, handlers, config: { SHOW_NOTIFICATIONS: true } as any });

    expect(register).toHaveBeenCalledWith(expect.objectContaining({ dismissedNotificationIds: ["a"] }));
    const puts = getCalls().filter(c => c.method === "PUT" && c.url === stateUrl);
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toEqual(["a"]);
  });

  it("does not PUT when nothing was pruned", async () => {
    mockResponses({
      [notificationsUrl]: { body: { notifications: [{ id: "a", severity: "info", bodyHtml: "<p>a</p>" }] } },
      [stateUrl]: { body: ["a"] },
    });

    await initialiseNotifications({ rootUrl, register, handlers, config: { SHOW_NOTIFICATIONS: true } as any });

    expect(getCalls().some(c => c.method === "PUT")).toBe(false);
  });

  describe("handlers.dismissNotification", () => {
    it("appends the id, re-registers the store, and PUTs the new list", async () => {
      mockResponses({
        [notificationsUrl]: { body: { notifications: [{ id: "a", severity: "info", bodyHtml: "<p>a</p>" }] } },
        [stateUrl]: { body: [] },
      });

      await initialiseNotifications({ rootUrl, register, handlers, config: { SHOW_NOTIFICATIONS: true } as any });
      register.mockClear();

      handlers.dismissNotification("a");

      expect(register).toHaveBeenCalledWith({ dismissedNotificationIds: ["a"] });
      const lastPut = getCalls().filter(c => c.method === "PUT").pop();
      expect(lastPut?.body).toEqual(["a"]);
    });

    it("is idempotent when the id is already dismissed", async () => {
      mockResponses({
        [notificationsUrl]: { body: { notifications: [{ id: "a", severity: "info", bodyHtml: "<p>a</p>" }] } },
        [stateUrl]: { body: ["a"] },
      });

      await initialiseNotifications({ rootUrl, register, handlers, config: { SHOW_NOTIFICATIONS: true } as any });
      register.mockClear();
      const putCountBefore = getCalls().filter(c => c.method === "PUT").length;

      handlers.dismissNotification("a");

      expect(register).not.toHaveBeenCalled();
      expect(getCalls().filter(c => c.method === "PUT").length).toBe(putCountBefore);
    });
  });
});
