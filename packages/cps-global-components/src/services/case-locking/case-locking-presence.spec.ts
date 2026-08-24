import { createCaseLockingPresence } from "./case-locking-presence";
import { CaseLockingPresentUsers } from "./CaseLockingPresentUsers";

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
  let presentUsers: CaseLockingPresentUsers;
  const register = jest.fn((arg: { caseLockingPresentUsers: CaseLockingPresentUsers }) => {
    presentUsers = arg.caseLockingPresentUsers;
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
  return { service, hubs, register, getPresentUsers: () => presentUsers };
};

describe("createCaseLockingPresence", () => {
  it("does not start any connection until both caseId and a code are present", async () => {
    const { service, hubs } = setup();
    service.addCode("witness");
    await flush();
    expect(hubs).toHaveLength(0);

    service.setCaseId("123");
    await flush();
    expect(hubs).toHaveLength(1);
    expect(hubs[0].start).toHaveBeenCalled();
    expect(hubs[0].invoke).toHaveBeenCalledWith("Connect", "123:WITNESS", "test-app");
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
    expect(sectionKeys).toEqual(["123:A", "123:B"]);
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

  it("addCode twice is idempotent (single connection)", async () => {
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
    expect(hubs[0].invoke).toHaveBeenCalledWith("Connect", "123:A", "test-app");

    service.setCaseId("456");
    await flush();
    expect(hubs[0].stop).toHaveBeenCalled();
    expect(hubs).toHaveLength(2);
    expect(hubs[1].invoke).toHaveBeenCalledWith("Connect", "456:A", "test-app");
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
    expect(hubs[1].invoke).toHaveBeenCalledWith("Connect", "789:A", "test-app");
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
    expect(hubs[0].invoke).toHaveBeenLastCalledWith("Connect", "123:A", "test-app");
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

    service.removeCode("a");
    service.addCode("a");
    await flush();
    expect(hubs.length).toBeGreaterThan(1);
  });

  describe("presence publication", () => {
    it("Notify publishes the other present users, with self filtered out", async () => {
      const { service, hubs, getPresentUsers, register } = setup();
      service.setCaseId("123");
      service.addCode("witness");
      await flush();

      hubs[0].__notifyHandler?.([
        { user: "alice", appName: "test-app" },
        { user: "bob@cps.gov.uk", appName: "CMS" },
      ]);
      await flush();

      expect(register).toHaveBeenCalledWith({
        caseLockingPresentUsers: {
          code: "witness",
          users: [{ user: "bob@cps.gov.uk", appName: "CMS" }],
        },
      });
      expect(getPresentUsers()).toEqual({
        code: "witness",
        users: [{ user: "bob@cps.gov.uk", appName: "CMS" }],
      });
    });

    it("filters self case-insensitively (the hub echoes token-claim casing)", async () => {
      const { service, hubs, getPresentUsers } = setup();
      service.setCaseId("123");
      service.addCode("witness");
      await flush();

      hubs[0].__notifyHandler?.([{ user: "ALICE", appName: "CMS" }]);
      await flush();
      expect(getPresentUsers()?.users).toEqual([]);
    });

    it("publishes an empty list when we are the only user present", async () => {
      const { service, hubs, getPresentUsers } = setup();
      service.setCaseId("123");
      service.addCode("witness");
      await flush();

      hubs[0].__notifyHandler?.([{ user: "alice", appName: "test-app" }]);
      await flush();
      expect(getPresentUsers()?.users).toEqual([]);
    });

    it("subsequent Notifys overwrite the published list", async () => {
      const { service, hubs, getPresentUsers } = setup();
      service.setCaseId("123");
      service.addCode("witness");
      await flush();

      hubs[0].__notifyHandler?.([{ user: "bob", appName: "CMS" }]);
      await flush();
      expect(getPresentUsers()?.users).toHaveLength(1);

      hubs[0].__notifyHandler?.([
        { user: "bob", appName: "CMS" },
        { user: "carol", appName: "CMS" },
      ]);
      await flush();
      expect(getPresentUsers()?.users).toHaveLength(2);
    });

    it("removing the active code clears the published list", async () => {
      const { service, hubs, getPresentUsers } = setup();
      service.setCaseId("123");
      service.addCode("witness");
      await flush();

      hubs[0].__notifyHandler?.([
        { user: "alice", appName: "test-app" },
        { user: "bob", appName: "CMS" },
      ]);
      await flush();
      expect(getPresentUsers()).toBeDefined();

      service.removeCode("witness");
      await flush();
      expect(getPresentUsers()).toBeUndefined();
    });

    it("changing caseId clears the published list (until the new connection publishes its own)", async () => {
      const { service, hubs, getPresentUsers } = setup();
      service.setCaseId("123");
      service.addCode("witness");
      await flush();

      hubs[0].__notifyHandler?.([
        { user: "alice", appName: "test-app" },
        { user: "bob", appName: "CMS" },
      ]);
      await flush();
      expect(getPresentUsers()).toBeDefined();

      service.setCaseId("456");
      await flush();
      expect(getPresentUsers()).toBeUndefined();
    });
  });
});
