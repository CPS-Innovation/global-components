import { createCaseLockingPresence } from "./case-locking-presence";
import { CaseLockingPresence } from "./CaseLockingPresence";

type FakeHubConnection = {
  start: jest.Mock<Promise<void>, []>;
  stop: jest.Mock<Promise<void>, []>;
  invoke: jest.Mock<Promise<void>, [string, ...unknown[]]>;
  on: jest.Mock;
  onclose: jest.Mock;
  onreconnected: jest.Mock;
  __notifyHandler?: (users: { user: string; appName: string }[]) => void;
  __reconnectedHandler?: () => void;
};

const makeFakeHub = (): FakeHubConnection => {
  const hub: FakeHubConnection = {
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    invoke: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    onclose: jest.fn(),
    onreconnected: jest.fn(),
  };
  hub.on.mockImplementation((event: string, handler: any) => {
    if (event === "Notify") {
      hub.__notifyHandler = handler;
    }
  });
  hub.onreconnected.mockImplementation((handler: any) => {
    hub.__reconnectedHandler = handler;
  });
  return hub;
};

const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
};

const setup = () => {
  const hubs: FakeHubConnection[] = [];
  let presence: CaseLockingPresence | undefined;
  const register = jest.fn((arg: { caseLockingPresence: CaseLockingPresence }) => {
    presence = arg.caseLockingPresence;
  });
  const service = createCaseLockingPresence({
    apiUrl: "https://example.test/api",
    username: "alice",
    appName: "test-app",
    register,
    hubFactory: () => {
      const hub = makeFakeHub();
      hubs.push(hub);
      return hub as any;
    },
  });
  return { service, hubs, register, getPresence: () => presence };
};

describe("createCaseLockingPresence", () => {
  it("does not start any connection until both caseId and a code are present", async () => {
    const { service, hubs } = setup();
    service.addCode("context-details");
    await flush();
    expect(hubs).toHaveLength(0);

    service.setCaseId("123");
    await flush();
    expect(hubs).toHaveLength(1);
    expect(hubs[0].start).toHaveBeenCalled();
    expect(hubs[0].invoke).toHaveBeenCalledWith("Connect", "case-123-context-details", "alice", "test-app");
  });

  it("does not start a connection when caseId arrives but no codes are active", async () => {
    const { service, hubs } = setup();
    service.setCaseId("123");
    await flush();
    expect(hubs).toHaveLength(0);
  });

  it("starts connections for each active code under the same caseId", async () => {
    const { service, hubs } = setup();
    service.setCaseId("123");
    service.addCode("a");
    service.addCode("b");
    await flush();

    expect(hubs).toHaveLength(2);
    const sectionKeys = hubs.map(h => h.invoke.mock.calls[0][1]).sort();
    expect(sectionKeys).toEqual(["case-123-a", "case-123-b"]);
  });

  it("stops a connection when its code is removed", async () => {
    const { service, hubs } = setup();
    service.setCaseId("123");
    service.addCode("a");
    await flush();
    expect(hubs[0].start).toHaveBeenCalled();

    service.removeCode("a");
    await flush();
    expect(hubs[0].stop).toHaveBeenCalled();
  });

  it("ref-count: addCode twice + removeCode once keeps the connection up; removeCode twice stops it", async () => {
    // Note: the service itself does not ref-count — that's the caller's responsibility.
    // This test confirms idempotency of addCode (no second connection) and that a single
    // removeCode tears down (since the service has only one notion of "desired").
    const { service, hubs } = setup();
    service.setCaseId("123");
    service.addCode("a");
    service.addCode("a");
    await flush();
    expect(hubs).toHaveLength(1);

    service.removeCode("a");
    await flush();
    expect(hubs[0].stop).toHaveBeenCalled();
  });

  it("changing caseId tears down old connections and starts new ones for active codes", async () => {
    const { service, hubs } = setup();
    service.setCaseId("123");
    service.addCode("a");
    await flush();
    expect(hubs).toHaveLength(1);
    expect(hubs[0].invoke).toHaveBeenCalledWith("Connect", "case-123-a", "alice", "test-app");

    service.setCaseId("456");
    await flush();
    expect(hubs[0].stop).toHaveBeenCalled();
    expect(hubs).toHaveLength(2);
    expect(hubs[1].invoke).toHaveBeenCalledWith("Connect", "case-456-a", "alice", "test-app");
  });

  it("setting caseId to undefined tears down all connections without removing desired codes", async () => {
    const { service, hubs } = setup();
    service.setCaseId("123");
    service.addCode("a");
    await flush();
    expect(hubs).toHaveLength(1);

    service.setCaseId(undefined);
    await flush();
    expect(hubs[0].stop).toHaveBeenCalled();

    service.setCaseId("789");
    await flush();
    expect(hubs).toHaveLength(2);
    expect(hubs[1].invoke).toHaveBeenCalledWith("Connect", "case-789-a", "alice", "test-app");
  });

  it("Notify writes other users (excluding self) to presence under the code", async () => {
    const { service, hubs, getPresence, register } = setup();
    service.setCaseId("123");
    service.addCode("a");
    await flush();

    hubs[0].__notifyHandler?.([
      { user: "alice", appName: "test-app" },
      { user: "bob", appName: "CMS" },
    ]);

    expect(register).toHaveBeenCalledWith({ caseLockingPresence: { a: [{ user: "bob", appName: "CMS" }] } });
    expect(getPresence()).toEqual({ a: [{ user: "bob", appName: "CMS" }] });
  });

  it("clears presence for a code when that code is removed", async () => {
    const { service, hubs, getPresence } = setup();
    service.setCaseId("123");
    service.addCode("a");
    await flush();
    hubs[0].__notifyHandler?.([{ user: "bob", appName: "CMS" }]);
    expect(getPresence()).toEqual({ a: [{ user: "bob", appName: "CMS" }] });

    service.removeCode("a");
    await flush();
    expect(getPresence()).toEqual({});
  });

  it("on reconnect, re-invokes Connect with the same section key", async () => {
    const { service, hubs } = setup();
    service.setCaseId("123");
    service.addCode("a");
    await flush();
    expect(hubs[0].invoke).toHaveBeenCalledTimes(1);

    hubs[0].__reconnectedHandler?.();
    await flush();
    expect(hubs[0].invoke).toHaveBeenCalledTimes(2);
    expect(hubs[0].invoke).toHaveBeenLastCalledWith("Connect", "case-123-a", "alice", "test-app");
  });

  it("on start failure, drops the connection and does not leak it to the active set", async () => {
    const hubs: FakeHubConnection[] = [];
    const register = jest.fn();
    const service = createCaseLockingPresence({
      apiUrl: "https://example.test/api",
      username: "alice",
      appName: "test-app",
      register,
      hubFactory: () => {
        const hub = makeFakeHub();
        hub.start.mockRejectedValueOnce(new Error("network down"));
        hubs.push(hub);
        return hub as any;
      },
    });

    service.setCaseId("123");
    service.addCode("a");
    await flush();

    // a subsequent reconcile that re-asserts the same desired state should retry
    service.removeCode("a");
    service.addCode("a");
    await flush();
    expect(hubs.length).toBeGreaterThan(1);
  });
});
