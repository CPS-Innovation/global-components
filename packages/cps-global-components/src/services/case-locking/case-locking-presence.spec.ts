import { createCaseLockingPresence } from "./case-locking-presence";
import { CaseLockingPresentUsers } from "./CaseLockingPresentUsers";

type FakeHubConnection = {
  start: jest.Mock<Promise<void>, []>;
  stop: jest.Mock<Promise<void>, []>;
  invoke: jest.Mock<Promise<void>, [string, ...unknown[]]>;
  on: jest.Mock;
  onclose: jest.Mock;
  onreconnected: jest.Mock;
  __notify?: (notification: unknown) => void;
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
    if (event === "ReceiveNotification") {
      hub.__notify = handler;
    }
  });
  hub.onreconnected.mockImplementation((handler: any) => {
    hub.__reconnectedHandler = handler;
  });
  return hub;
};

// Drain the microtask queue. Generous on purpose: a teardown-then-restart now
// awaits Leave and stop before the new connection's Connect, so a tight loop here
// would report "Connect was never invoked" when it simply had not got there yet.
const flush = async () => {
  for (let i = 0; i < 30; i++) {
    await Promise.resolve();
  }
};

// The API sends versioned snapshots, not a flat user list. These tests were
// written against the old shape, so this builds the real one around it — the
// version increments so consecutive notifications are never discarded as stale.
let snapshotVersion = 0;
const presence = (users: { user: string; appName: string }[], { caseId = "123", kind = "WITNESS" } = {}) => ({
  type: 0,
  payload: {
    snapshots: [
      {
        section: { caseId, kind },
        version: ++snapshotVersion,
        members: users.map(({ user, appName }) => ({ userEmail: user, sourceApplication: appName })),
      },
    ],
  },
});

const setup = (options: { countSelf?: boolean } = {}) => {
  const hubs: FakeHubConnection[] = [];
  let presentUsers: CaseLockingPresentUsers;
  const register = jest.fn((arg: { caseLockingPresentUsers: CaseLockingPresentUsers }) => {
    presentUsers = arg.caseLockingPresentUsers;
  });
  const service = createCaseLockingPresence({
    apiUrl: "https://example.test/api",
    username: "alice",
    appName: "test-app",
    // Unused here — every test injects a hubFactory, so the real one (which is
    // what consumes this) is never built. Present because the type requires it.
    getAccessToken: async () => "test-token",
    countSelf: options.countSelf,
    register,
    hubFactory: () => {
      const hub = makeFakeHub();
      hubs.push(hub);
      return hub as any;
    },
  });
  // Find a hub by the section it invoked Connect for. Index-based lookup stopped
  // being meaningful when the case section started opening its own connection.
  const hubFor = (sectionId: string) =>
    hubs.find(hub => hub.invoke.mock.calls.some(([method, section]) => method === "Connect" && section === sectionId));
  // Everyone published, across every section — what most of these tests mean by
  // "the present users". Sections that end up empty are dropped entirely, so the
  // whole payload is undefined when there is nobody to show.
  const allUsers = () => (presentUsers?.sections ?? []).flatMap(section => section.users);
  return { service, hubs, register, hubFor, allUsers, getPresentUsers: () => presentUsers };
};

describe("createCaseLockingPresence", () => {
  // The keep-alive is a setInterval per live connection, cleared when the
  // connection stops. Tests that leave a connection open would otherwise leave a
  // real timer running and jest would wait for it — fake timers keep the run
  // honest and let the keep-alive tests drive the clock directly.
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("does not start any connection until both a caseId and a region are present", async () => {
    const { service, hubs, hubFor } = setup();
    service.addRegion("witness");
    await flush();
    expect(hubs).toHaveLength(0);

    service.setCaseId("123");
    await flush();
    expect(hubs).toHaveLength(1);
    expect(hubFor("123:WITNESS")?.start).toHaveBeenCalled();
    expect(hubFor("123:WITNESS")?.invoke).toHaveBeenCalledWith("Connect", "123:WITNESS", "test-app");
  });

  it("does not start a connection when a caseId arrives but no regions are active", async () => {
    const { service, hubs } = setup();
    service.setCaseId("123");
    await flush();
    expect(hubs).toHaveLength(0);
  });

  it("builds a subject-scoped section id when a region names a subject", async () => {
    const { service, hubFor } = setup();
    service.setCaseId("123");
    service.addRegion("victim_witness", "98765");
    await flush();
    expect(hubFor("123:VICTIM_WITNESS:98765")?.invoke).toHaveBeenCalledWith("Connect", "123:VICTIM_WITNESS:98765", "test-app");
  });

  it("treats two subjects of the same kind as two sections", async () => {
    const { service, hubs, hubFor } = setup();
    service.setCaseId("123");
    service.addRegion("victim_witness", "111");
    service.addRegion("victim_witness", "222");
    await flush();

    expect(hubs).toHaveLength(2);
    expect(hubFor("123:VICTIM_WITNESS:111")).toBeDefined();
    expect(hubFor("123:VICTIM_WITNESS:222")).toBeDefined();
  });

  it("treats a case-wide region and a subject-scoped one of the same kind as different sections", async () => {
    const { service, hubs, hubFor } = setup();
    service.setCaseId("123");
    service.addRegion("victim_witness");
    service.addRegion("victim_witness", "98765");
    await flush();

    expect(hubs).toHaveLength(2);
    expect(hubFor("123:VICTIM_WITNESS")).toBeDefined();
    expect(hubFor("123:VICTIM_WITNESS:98765")).toBeDefined();
  });

  it("starts connections for each active code under the same caseId", async () => {
    const { service, hubs } = setup();
    service.setCaseId("123");
    service.addRegion("a");
    service.addRegion("b");
    await flush();

    expect(hubs).toHaveLength(2);
    const sectionKeys = hubs.map(h => h.invoke.mock.calls[0][1]).sort();
    expect(sectionKeys).toEqual(["123:A", "123:B"]);
  });

  it("stops a connection when its region is removed", async () => {
    const { service, hubFor } = setup();
    service.setCaseId("123");
    service.addRegion("a");
    await flush();
    expect(hubFor("123:A")?.start).toHaveBeenCalled();

    service.removeRegion("a");
    await flush();
    expect(hubFor("123:A")?.stop).toHaveBeenCalled();
  });

  it("addRegion twice is idempotent (single connection)", async () => {
    const { service, hubs, hubFor } = setup();
    service.setCaseId("123");
    service.addRegion("a");
    service.addRegion("a");
    await flush();
    expect(hubs).toHaveLength(1);

    service.removeRegion("a");
    await flush();
    expect(hubFor("123:A")?.stop).toHaveBeenCalled();
  });

  it("changing caseId tears down the old connections and rebuilds on the new case", async () => {
    const { service, hubFor } = setup();
    service.setCaseId("123");
    service.addRegion("a");
    await flush();
    expect(hubFor("123:A")).toBeDefined();

    service.setCaseId("456");
    await flush();
    expect(hubFor("123:A")?.stop).toHaveBeenCalled();
    expect(hubFor("456:A")?.invoke).toHaveBeenCalledWith("Connect", "456:A", "test-app");
  });

  it("setting caseId to undefined tears down everything without forgetting the regions", async () => {
    const { service, hubs, hubFor } = setup();
    service.setCaseId("123");
    service.addRegion("a");
    await flush();
    expect(hubs).toHaveLength(1);

    service.setCaseId(undefined);
    await flush();
    expect(hubFor("123:A")?.stop).toHaveBeenCalled();

    // The region was never removed, so a new case picks it up again.
    service.setCaseId("789");
    await flush();
    expect(hubFor("789:A")?.invoke).toHaveBeenCalledWith("Connect", "789:A", "test-app");
  });

  it("on reconnect, re-invokes Connect with the same section key", async () => {
    const { service, hubFor } = setup();
    service.setCaseId("123");
    service.addRegion("a");
    await flush();
    const hub = hubFor("123:A")!;
    expect(hub.invoke).toHaveBeenCalledTimes(1);

    hub.__reconnectedHandler?.();
    await flush();
    expect(hub.invoke).toHaveBeenCalledTimes(2);
    expect(hub.invoke).toHaveBeenLastCalledWith("Connect", "123:A", "test-app");
  });

  it("on start failure, drops the connection and does not leak it to the active set", async () => {
    const hubs: FakeHubConnection[] = [];
    const register = jest.fn();
    const service = createCaseLockingPresence({
      apiUrl: "https://example.test/api",
      username: "alice",
      appName: "test-app",
    // Unused here — every test injects a hubFactory, so the real one (which is
    // what consumes this) is never built. Present because the type requires it.
    getAccessToken: async () => "test-token",
      register,
      hubFactory: () => {
        const hub = makeFakeHub();
        hub.start.mockRejectedValueOnce(new Error("network down"));
        hubs.push(hub);
        return hub as any;
      },
    });

    service.setCaseId("123");
    service.addRegion("a");
    await flush();

    service.removeRegion("a");
    service.addRegion("a");
    await flush();
    expect(hubs.length).toBeGreaterThan(1);
  });

  describe("presence publication", () => {
    // countSelf mirrors the caseLockingCountSelf preview flag. ON, we match the
    // Classic banner and the Modern bar, which both count and list you.
    it("publishes everyone in the section, ourselves included, when countSelf is on", async () => {
      const { service, hubFor, register, allUsers } = setup({ countSelf: true });
      service.setCaseId("123");
      service.addRegion("witness");
      await flush();

      hubFor("123:WITNESS")!.__notify?.(presence([
        { user: "alice", appName: "test-app" },
        { user: "bob@cps.gov.uk", appName: "CMS" },
      ]));
      await flush();

      expect(register).toHaveBeenCalledWith({
        caseLockingPresentUsers: {
          sections: [
            {
              code: "witness",
              users: [
                { user: "alice", appName: "test-app", joinedAt: undefined },
                { user: "bob@cps.gov.uk", appName: "CMS", joinedAt: undefined },
              ],
              occupiedOnEntry: true,
            },
          ],
        },
      });
      expect(allUsers()).toHaveLength(2);
    });

    it("publishes a list of one when we are the only user present and countSelf is on", async () => {
      // The observability case, and the whole reason the flag exists: with self
      // hidden, a lone developer on a case sees an empty list and cannot tell a
      // working mechanism from a broken one.
      const { service, hubFor, allUsers } = setup({ countSelf: true });
      service.setCaseId("123");
      service.addRegion("witness");
      await flush();

      hubFor("123:WITNESS")!.__notify?.(presence([{ user: "alice", appName: "test-app" }]));
      await flush();
      expect(allUsers()).toEqual([{ user: "alice", appName: "test-app" }]);
    });

    it("removes us case-insensitively by default — the hub echoes token-claim casing", async () => {
      // Default (production) behaviour: self is dropped, and the comparison must
      // survive the server's casing, which comes from token claims we do not
      // control.
      const { service, hubFor, getPresentUsers } = setup();
      service.setCaseId("123");
      service.addRegion("witness");
      await flush();

      hubFor("123:WITNESS")!.__notify?.(presence([{ user: "ALICE", appName: "CMS" }]));
      await flush();
      expect(getPresentUsers()).toBeUndefined();
    });

    it("publishes only the others by default, so a lone user is told nothing", async () => {
      const { service, hubFor, allUsers } = setup();
      service.setCaseId("123");
      service.addRegion("witness");
      await flush();

      hubFor("123:WITNESS")!.__notify?.(presence([
        { user: "alice", appName: "test-app" },
        { user: "bob@cps.gov.uk", appName: "CMS" },
      ]));
      await flush();
      expect(allUsers()).toEqual([{ user: "bob@cps.gov.uk", appName: "CMS" }]);
    });

    it("subsequent Notifys overwrite the published list", async () => {
      const { service, hubFor, allUsers } = setup();
      service.setCaseId("123");
      service.addRegion("witness");
      await flush();

      hubFor("123:WITNESS")!.__notify?.(presence([{ user: "bob", appName: "CMS" }]));
      await flush();
      expect(allUsers()).toHaveLength(1);

      hubFor("123:WITNESS")!.__notify?.(presence([
        { user: "bob", appName: "CMS" },
        { user: "carol", appName: "CMS" },
      ]));
      await flush();
      expect(allUsers()).toHaveLength(2);
    });

    it("removing the active code clears the published list", async () => {
      const { service, hubFor, getPresentUsers } = setup();
      service.setCaseId("123");
      service.addRegion("witness");
      await flush();

      hubFor("123:WITNESS")!.__notify?.(presence([
        { user: "alice", appName: "test-app" },
        { user: "bob", appName: "CMS" },
      ]));
      await flush();
      expect(getPresentUsers()).toBeDefined();

      service.removeRegion("witness");
      await flush();
      expect(getPresentUsers()).toBeUndefined();
    });

    it("changing caseId clears the published list (until the new connection publishes its own)", async () => {
      const { service, hubFor, getPresentUsers } = setup();
      service.setCaseId("123");
      service.addRegion("witness");
      await flush();

      hubFor("123:WITNESS")!.__notify?.(presence([
        { user: "alice", appName: "test-app" },
        { user: "bob", appName: "CMS" },
      ]));
      await flush();
      expect(getPresentUsers()).toBeDefined();

      service.setCaseId("456");
      await flush();
      expect(getPresentUsers()).toBeUndefined();
    });
  });

  // The rule that separates the two UI devices: walking in on an occupied section
  // interrupts, someone joining a section you already hold does not.
  describe("occupiedOnEntry", () => {
    const sectionOf = (getPresentUsers: () => CaseLockingPresentUsers, code: string) =>
      (getPresentUsers()?.sections ?? []).find(section => section.code === code);

    it("is true when someone is already present on the first retrieval", async () => {
      const { service, hubFor, getPresentUsers } = setup();
      service.setCaseId("123");
      service.addRegion("witness");
      await flush();

      hubFor("123:WITNESS")!.__notify?.(presence([{ user: "bob@cps.gov.uk", appName: "CMS" }]));
      await flush();

      expect(sectionOf(getPresentUsers, "witness")?.occupiedOnEntry).toBe(true);
    });

    it("is false when the section was empty on the first retrieval and someone joins later", async () => {
      const { service, hubFor, getPresentUsers } = setup();
      service.setCaseId("123");
      service.addRegion("witness");
      await flush();

      // First retrieval: nobody here but us.
      hubFor("123:WITNESS")!.__notify?.(presence([]));
      await flush();

      hubFor("123:WITNESS")!.__notify?.(presence([{ user: "bob@cps.gov.uk", appName: "CMS" }]));
      await flush();

      expect(sectionOf(getPresentUsers, "witness")?.users).toHaveLength(1);
      expect(sectionOf(getPresentUsers, "witness")?.occupiedOnEntry).toBe(false);
    });

    // The reconnect case, which is why this is latched rather than recomputed: a
    // later snapshot must never promote a section to "occupied on entry", or a
    // transient disconnect would interrupt us over someone who was here first.
    it("stays false once decided, however many people arrive afterwards", async () => {
      const { service, hubFor, getPresentUsers } = setup();
      service.setCaseId("123");
      service.addRegion("witness");
      await flush();

      hubFor("123:WITNESS")!.__notify?.(presence([]));
      await flush();

      hubFor("123:WITNESS")!.__notify?.(
        presence([
          { user: "bob@cps.gov.uk", appName: "CMS" },
          { user: "carol@cps.gov.uk", appName: "CMS" },
        ]),
      );
      await flush();

      expect(sectionOf(getPresentUsers, "witness")?.occupiedOnEntry).toBe(false);
    });
  });

  describe("the wire contract", () => {
    // Built explicitly rather than via presence() so the version and section are
    // under each test's control — they are the two things being checked.
    const notification = (version: number, users: string[], section = { caseId: "123", kind: "WITNESS" }) => ({
      type: 0,
      payload: {
        snapshots: [{ section, version, members: users.map(user => ({ userEmail: user, sourceApplication: "CMS" })) }],
      },
    });

    const onWitness = async () => {
      const rig = setup();
      rig.service.setCaseId("123");
      rig.service.addRegion("witness");
      await flush();
      return { ...rig, hub: rig.hubFor("123:WITNESS")! };
    };

    it("applies a snapshot and publishes its members", async () => {
      const { hub, allUsers } = await onWitness();
      hub.__notify?.(notification(1, ["bob@cps.gov.uk"]));
      await flush();
      expect(allUsers()).toEqual([{ user: "bob@cps.gov.uk", appName: "CMS" }]);
    });

    it("discards a snapshot older than one already applied — they arrive out of order", async () => {
      const { hub, allUsers } = await onWitness();
      hub.__notify?.(notification(5, ["bob@cps.gov.uk"]));
      await flush();
      hub.__notify?.(notification(3, ["carol@cps.gov.uk", "dave@cps.gov.uk"]));
      await flush();
      // The late arrival must not resurrect a roster that has moved on.
      expect(allUsers()).toEqual([{ user: "bob@cps.gov.uk", appName: "CMS" }]);
    });

    it("accepts a newer snapshot, including one that empties the section", async () => {
      const { hub, getPresentUsers } = await onWitness();
      hub.__notify?.(notification(1, ["bob@cps.gov.uk"]));
      await flush();
      // An empty members array is a valid update meaning everyone left.
      hub.__notify?.(notification(2, []));
      await flush();
      expect(getPresentUsers()).toBeUndefined();
    });

    it("ignores a snapshot for a different section", async () => {
      const { hub, getPresentUsers } = await onWitness();
      hub.__notify?.(notification(1, ["bob@cps.gov.uk"], { caseId: "999", kind: "WITNESS" }));
      hub.__notify?.(notification(1, ["bob@cps.gov.uk"], { caseId: "123", kind: "CASE" }));
      await flush();
      expect(getPresentUsers()).toBeUndefined();
    });

    it("ignores notifications that are not presence snapshots", async () => {
      const { hub, getPresentUsers } = await onWitness();
      hub.__notify?.({ ...notification(1, ["bob@cps.gov.uk"]), type: 1 });
      await flush();
      expect(getPresentUsers()).toBeUndefined();
    });

    it("survives a malformed notification", async () => {
      const { hub, getPresentUsers } = await onWitness();
      hub.__notify?.({ type: 0 });
      hub.__notify?.({ type: 0, payload: {} });
      hub.__notify?.({ type: 0, payload: { snapshots: [] } });
      hub.__notify?.({ type: 0, payload: { snapshots: [{ version: 1 }] } });
      await flush();
      expect(getPresentUsers()).toBeUndefined();
    });
  });

  describe("keeping the session alive", () => {
    // The server evicts a session it has not heard from for 10 seconds. Without
    // this the socket stays open while the session quietly dies, and presence
    // disappears ten seconds after it appears.
    it("beats inside the server's eviction window", async () => {
      const { service, hubFor } = setup();
      service.setCaseId("123");
      service.addRegion("witness");
      await flush();
      const hub = hubFor("123:WITNESS")!;
      hub.invoke.mockClear();

      jest.advanceTimersByTime(5000);
      await flush();
      expect(hub.invoke).toHaveBeenCalledWith("KeepAlive");

      jest.advanceTimersByTime(5000);
      await flush();
      expect(hub.invoke.mock.calls.filter(([method]) => method === "KeepAlive")).toHaveLength(2);
    });

    it("rejoins when the server says the session was evicted", async () => {
      const { service, hubFor } = setup();
      service.setCaseId("123");
      service.addRegion("witness");
      await flush();
      const hub = hubFor("123:WITNESS")!;
      hub.invoke.mockClear();
      hub.invoke.mockImplementation((method: string) =>
        method === "KeepAlive" ? Promise.reject(new Error("SESSION_EVICTED: gone")) : Promise.resolve(),
      );

      jest.advanceTimersByTime(5000);
      await flush();
      expect(hub.invoke).toHaveBeenCalledWith("Connect", "123:WITNESS", "test-app");
    });

    it("stops beating once the connection is torn down", async () => {
      const { service, hubFor } = setup();
      service.setCaseId("123");
      service.addRegion("witness");
      await flush();
      service.removeRegion("witness");
      await flush();
      const hub = hubFor("123:WITNESS")!;
      hub.invoke.mockClear();

      jest.advanceTimersByTime(20000);
      await flush();
      expect(hub.invoke).not.toHaveBeenCalled();
    });

    it("leaves the section before closing the socket, so the server drops us at once", async () => {
      const { service, hubFor } = setup();
      service.setCaseId("123");
      service.addRegion("witness");
      await flush();
      // Captured before teardown: hubFor identifies a hub by its Connect call.
      const hub = hubFor("123:WITNESS")!;
      service.removeRegion("witness");
      await flush();

      expect(hub.invoke).toHaveBeenCalledWith("Leave");
      const leaveOrder = hub.invoke.mock.invocationCallOrder[hub.invoke.mock.calls.findIndex(([method]) => method === "Leave")];
      expect(leaveOrder).toBeLessThan(hub.stop.mock.invocationCallOrder[0]);
    });
  });
});
