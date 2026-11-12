import { CaseLockingPresenceService, createCaseLockingPresence, PresenceRegion, regionKey } from "./case-locking-presence";
import { CaseLockingPresentUsers } from "./CaseLockingPresentUsers";
import { CCPEnvironment, CCPSections, CCPView } from "cps-global-presence";

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

// WHICH CMS INSTANCE THESE TESTS ARE ON. The suffix is DISCOVERED from the session
// hint now rather than hardcoded in CCPEnvironment, so the suite has to establish
// it: left unknown, every id below would be unsuffixed and the tests under "the CIN
// environment suffix" would pass while describing nothing at all.
const CMS_ENV = "CIN3";
CCPEnvironment.CIN = null;
CCPEnvironment.adopt(CMS_ENV);

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
        section: { caseId, kind: CCPEnvironment.suffixKind(kind) },
        version: ++snapshotVersion,
        members: users.map(({ user, appName }) => ({ userEmail: user, sourceApplication: appName })),
      },
    ],
  },
});

// THE WIRE FORM of a section id. The CIN suffix goes on the KIND only -- never on
// the case id or the subject id -- so that this client joins the same conflict set
// as the Classic one. Built through CCPEnvironment rather than written out, so
// these tests describe the rule and not one CMS instance's value.
const sid = (caseId: string, kind: string, subjectId?: string) =>
  `${caseId}:${CCPEnvironment.suffixKind(kind)}` + (subjectId ? `:${subjectId}` : "");

// The region bookkeeping initialise-case-locking does, so these tests can say
// "this region appeared" and "that one went" while the service sees whole lists.
const withRegions = (presence: CaseLockingPresenceService) => {
  const regions = new Map<string, PresenceRegion>();
  const push = () => presence.setRegions(Array.from(regions.values()));
  return {
    setCaseId: presence.setCaseId,
    addRegion: (code: string, subjectId?: string) => {
      regions.set(regionKey({ code, subjectId }), { code, subjectId });
      push();
    },
    removeRegion: (code: string, subjectId?: string) => {
      regions.delete(regionKey({ code, subjectId }));
      push();
    },
  };
};

const setup = (options: { onPresenceChanged?: () => void } = {}) => {
  const hubs: FakeHubConnection[] = [];
  let presentUsers: CaseLockingPresentUsers;
  const register = jest.fn((arg: { caseLockingPresentUsers: CaseLockingPresentUsers }) => {
    presentUsers = arg.caseLockingPresentUsers;
  });
  const presence = createCaseLockingPresence({
    apiUrl: "https://example.test/api",
    username: "alice",
    appName: "test-app",
    // Unused here — every test injects a hubFactory, so the real one (which is
    // what consumes this) is never built. Present because the type requires it.
    getAccessToken: async () => "test-token",
    onClassicPresenceChanged: options.onPresenceChanged,
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
  const allUsers = () => (presentUsers?.sections ?? []).flatMap(section => section.members);
  // What a banner would show for this roster, with the reader left out — the
  // collapsing into people is CCPView's, so it is what these tests read people through.
  const people = () => CCPView.build({ members: allUsers(), viewerEmail: "alice" }).people;
  return { service: withRegions(presence), hubs, register, hubFor, allUsers, people, getPresentUsers: () => presentUsers };
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
    expect(hubFor(sid("123", "WITNESS"))?.start).toHaveBeenCalled();
    expect(hubFor(sid("123", "WITNESS"))?.invoke).toHaveBeenCalledWith("Connect", sid("123", "WITNESS"), "test-app");
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
    expect(hubFor(sid("123", "VICTIM_WITNESS", "98765"))?.invoke).toHaveBeenCalledWith("Connect", sid("123", "VICTIM_WITNESS", "98765"), "test-app");
  });

  it("treats two subjects of the same kind as two sections", async () => {
    const { service, hubs, hubFor } = setup();
    service.setCaseId("123");
    service.addRegion("victim_witness", "111");
    service.addRegion("victim_witness", "222");
    await flush();

    expect(hubs).toHaveLength(2);
    expect(hubFor(sid("123", "VICTIM_WITNESS", "111"))).toBeDefined();
    expect(hubFor(sid("123", "VICTIM_WITNESS", "222"))).toBeDefined();
  });

  it("treats a case-wide region and a subject-scoped one of the same kind as different sections", async () => {
    const { service, hubs, hubFor } = setup();
    service.setCaseId("123");
    service.addRegion("victim_witness");
    service.addRegion("victim_witness", "98765");
    await flush();

    expect(hubs).toHaveLength(2);
    expect(hubFor(sid("123", "VICTIM_WITNESS"))).toBeDefined();
    expect(hubFor(sid("123", "VICTIM_WITNESS", "98765"))).toBeDefined();
  });

  it("starts connections for each active code under the same caseId", async () => {
    const { service, hubs } = setup();
    service.setCaseId("123");
    service.addRegion("a");
    service.addRegion("b");
    await flush();

    expect(hubs).toHaveLength(2);
    const sectionKeys = hubs.map(h => h.invoke.mock.calls[0][1]).sort();
    expect(sectionKeys).toEqual([sid("123", "A"), sid("123", "B")]);
  });

  it("stops a connection when its region is removed", async () => {
    const { service, hubFor } = setup();
    service.setCaseId("123");
    service.addRegion("a");
    await flush();
    expect(hubFor(sid("123", "A"))?.start).toHaveBeenCalled();

    service.removeRegion("a");
    await flush();
    expect(hubFor(sid("123", "A"))?.stop).toHaveBeenCalled();
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
    expect(hubFor(sid("123", "A"))?.stop).toHaveBeenCalled();
  });

  it("changing caseId tears down the old connections and rebuilds on the new case", async () => {
    const { service, hubFor } = setup();
    service.setCaseId("123");
    service.addRegion("a");
    await flush();
    expect(hubFor(sid("123", "A"))).toBeDefined();

    service.setCaseId("456");
    await flush();
    expect(hubFor(sid("123", "A"))?.stop).toHaveBeenCalled();
    expect(hubFor(sid("456", "A"))?.invoke).toHaveBeenCalledWith("Connect", sid("456", "A"), "test-app");
  });

  it("setting caseId to undefined tears down everything without forgetting the regions", async () => {
    const { service, hubs, hubFor } = setup();
    service.setCaseId("123");
    service.addRegion("a");
    await flush();
    expect(hubs).toHaveLength(1);

    service.setCaseId(undefined);
    await flush();
    expect(hubFor(sid("123", "A"))?.stop).toHaveBeenCalled();

    // The region was never removed, so a new case picks it up again.
    service.setCaseId("789");
    await flush();
    expect(hubFor(sid("789", "A"))?.invoke).toHaveBeenCalledWith("Connect", sid("789", "A"), "test-app");
  });

  it("on reconnect, re-invokes Connect with the same section key", async () => {
    const { service, hubFor } = setup();
    service.setCaseId("123");
    service.addRegion("a");
    await flush();
    const hub = hubFor(sid("123", "A"))!;
    expect(hub.invoke).toHaveBeenCalledTimes(1);

    hub.__reconnectedHandler?.();
    await flush();
    expect(hub.invoke).toHaveBeenCalledTimes(2);
    expect(hub.invoke).toHaveBeenLastCalledWith("Connect", sid("123", "A"), "test-app");
  });

  // A new session may count versions afresh, so after a reconnect the next snapshot
  // is taken whatever its number — but the roster stays up until it arrives.
  it("on reconnect, keeps the roster and takes the new session's first snapshot", async () => {
    const { service, hubFor, allUsers } = setup();
    service.setCaseId("123");
    service.addRegion("witness");
    await flush();
    const hub = hubFor(sid("123", "WITNESS"))!;
    hub.__notify?.({ type: 0, payload: { snapshots: [{ section: { caseId: "123", kind: CCPEnvironment.suffixKind("WITNESS") }, version: 50, members: [{ userEmail: "bob" }] }] } });
    await flush();

    hub.__reconnectedHandler?.();
    await flush();
    expect(allUsers().map(u => u.userEmail)).toEqual(["bob"]);

    hub.__notify?.({ type: 0, payload: { snapshots: [{ section: { caseId: "123", kind: CCPEnvironment.suffixKind("WITNESS") }, version: 1, members: [{ userEmail: "carol" }] }] } });
    await flush();
    expect(allUsers().map(u => u.userEmail)).toEqual(["carol"]);
  });

  it("setRegions with the same regions changes nothing", async () => {
    const hubs: unknown[] = [];
    const service = createCaseLockingPresence({
      apiUrl: "https://example.test/api",
      username: "alice",
      appName: "test-app",
      getAccessToken: async () => "test-token",
      register: jest.fn(),
      hubFactory: () => {
        const hub = makeFakeHub();
        hubs.push(hub);
        return hub as any;
      },
    });
    service.setCaseId("123");
    service.setRegions([{ code: "a" }, { code: "b", subjectId: "1" }]);
    await flush();
    service.setRegions([{ code: "b", subjectId: "1" }, { code: "a" }]);
    await flush();
    expect(hubs).toHaveLength(2);
  });

  it("on start failure, drops the connection and does not leak it to the active set", async () => {
    const hubs: FakeHubConnection[] = [];
    const register = jest.fn();
    const service = createCaseLockingPresence({
      apiUrl: "https://example.test/api",
      username: "alice",
      appName: "test-app",
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
    service.setRegions([{ code: "a" }]);
    await flush();

    service.setRegions([]);
    service.setRegions([{ code: "a" }]);
    await flush();
    expect(hubs.length).toBeGreaterThan(1);
  });

  // In CMS Classic an arrival or departure IS the lock changing hands, so this
  // callback is what re-reads it. It must fire on people coming and going and on
  // nothing else — a redraw of the same roster that triggered a refetch would put
  // the case-summary endpoint behind every keepalive.
  // CLASSIC PRESENCE IS THE LOCK — taken by opening the Classic case screen,
  // released by leaving it — so this signal is what sends us back for a fresh lock
  // reading. It must fire for Classic comings and goings and for nothing else: an
  // RCMS arrival changes who is reading the case and changes nothing about whether
  // it can be written to.
  // THE CIN SUFFIX is what keeps this client in the same conflict set as the
  // Classic one. Classic moved to suffixed kinds first, and the isolation is
  // silent by design -- no error, just nobody ever there -- so these pin both
  // halves: what we register, and that the suffix never escapes into the shared
  // naming and rules tables.
  describe("the CIN environment suffix", () => {
    it("registers the suffixed kind, leaving case and subject ids alone", async () => {
      const { service, hubs } = setup();
      service.setCaseId("123");
      service.addRegion("victim_witness", "98765");
      await flush();
      const connects = hubs.flatMap(hub => hub.invoke.mock.calls.filter(([method]) => method === "Connect").map(([, section]) => section));
      expect(connects).toEqual([`123:VICTIM_WITNESS_${CMS_ENV}:98765`]);
    });

    // The reason the suffix is stripped on the way in: CCPSectionNames and
    // CCPSectionRules key on the kinds the API documents, and must never need an
    // entry per CMS instance.
    it("strips the suffix before a kind becomes display data", async () => {
      const { service, hubFor, allUsers } = setup();
      service.setCaseId("123");
      service.addRegion("witness");
      await flush();
      hubFor(sid("123", "WITNESS"))!.__notify?.(presence([{ user: "alice", appName: "test-app" }]));
      await flush();
      expect(allUsers()[0].sections).toEqual([{ kind: "WITNESS", isCurrent: true }]);
    });
  });

  describe("the Classic-presence signal", () => {
    const onWitnessWatching = async () => {
      const onPresenceChanged = jest.fn();
      const rig = setup({ onPresenceChanged });
      rig.service.setCaseId("123");
      rig.service.addRegion("witness");
      await flush();
      const arrive = async (...users: { user: string; appName: string }[]) => {
        rig.hubFor(sid("123", "WITNESS"))!.__notify?.(presence(users));
        await flush();
      };
      return { ...rig, onPresenceChanged, arrive };
    };

    const inClassic = { user: "bob@cps.gov.uk", appName: "CMS Classic" };
    const alsoClassic = { user: "carol@cps.gov.uk", appName: "CMS Classic" };
    const inRcms = { user: "dave@cps.gov.uk", appName: "Work Management App" };

    it("fires on finding someone already in Classic", async () => {
      const { onPresenceChanged, arrive } = await onWitnessWatching();
      expect(onPresenceChanged).not.toHaveBeenCalled();
      await arrive(inClassic);
      expect(onPresenceChanged).toHaveBeenCalledTimes(1);
    });

    it("fires when someone arrives in Classic, and when they leave", async () => {
      const { onPresenceChanged, arrive } = await onWitnessWatching();
      await arrive(inClassic);
      await arrive(inClassic, alsoClassic);
      expect(onPresenceChanged).toHaveBeenCalledTimes(2);
      await arrive(inClassic);
      expect(onPresenceChanged).toHaveBeenCalledTimes(3);
      await arrive();
      expect(onPresenceChanged).toHaveBeenCalledTimes(4);
    });

    // THE CASE THAT CAUGHT US OUT. You lock a case yourself in Classic, then leave
    // it — and the lock statement never cleared, because the published roster has
    // the reader filtered out of it and so never changed. The signal counts the
    // reader, because the reader's own Classic session moves the lock like anyone's.
    it("fires when the reader themselves arrives in and leaves Classic", async () => {
      const { onPresenceChanged, arrive } = await onWitnessWatching();
      await arrive({ user: "alice", appName: "CMS Classic" });
      expect(onPresenceChanged).toHaveBeenCalledTimes(1);
      await arrive();
      expect(onPresenceChanged).toHaveBeenCalledTimes(2);
    });

    // The saving, and the reason this is narrowed to one application: RCMS is where
    // most presence traffic happens and none of it can change a lock.
    it("ignores arrivals and departures in RCMS", async () => {
      const { onPresenceChanged, arrive } = await onWitnessWatching();
      await arrive(inRcms);
      await arrive(inRcms, { user: "erin@cps.gov.uk", appName: "Case Review App" });
      await arrive();
      expect(onPresenceChanged).not.toHaveBeenCalled();
    });

    // An RCMS arrival alongside a standing Classic session is still not lock news.
    it("does not fire when RCMS churns around a Classic session", async () => {
      const { onPresenceChanged, arrive } = await onWitnessWatching();
      await arrive(inClassic);
      expect(onPresenceChanged).toHaveBeenCalledTimes(1);
      await arrive(inClassic, inRcms);
      await arrive(inClassic);
      expect(onPresenceChanged).toHaveBeenCalledTimes(1);
    });

    // The same people re-reported is not news. Snapshots arrive on every keepalive,
    // so treating a republish as a change would refetch case details every few
    // seconds — the opposite of being kind to the API.
    it("does not fire when the same people are reported again", async () => {
      const { onPresenceChanged, arrive } = await onWitnessWatching();
      await arrive(inClassic);
      await arrive(inClassic);
      expect(onPresenceChanged).toHaveBeenCalledTimes(1);
    });

    // Someone moving from RCMS into Classic HAS taken the lock, even though the set
    // of people on the case did not change.
    it("fires when someone moves from RCMS into Classic", async () => {
      const { onPresenceChanged, arrive } = await onWitnessWatching();
      await arrive({ user: "bob@cps.gov.uk", appName: "Work Management App" });
      expect(onPresenceChanged).not.toHaveBeenCalled();
      await arrive(inClassic);
      expect(onPresenceChanged).toHaveBeenCalledTimes(1);
    });

    // THE SHAPE THAT BROKE IT IN QA. You are already on the case in RCMS, then open
    // it in Classic and take the lock. The set of PEOPLE has not changed — you were
    // there and you still are — so a signature keyed on identity saw nothing happen
    // and never re-read the lock. Keyed on who is in Classic, it goes from nobody to
    // you. mergeMembers keys on person AND application, so both sessions are in the
    // roster; it is the signature that must not flatten them back together.
    it("fires when someone already in RCMS also opens Classic", async () => {
      const { onPresenceChanged, arrive } = await onWitnessWatching();
      await arrive({ user: "bob@cps.gov.uk", appName: "Work Management App" });
      expect(onPresenceChanged).not.toHaveBeenCalled();

      await arrive({ user: "bob@cps.gov.uk", appName: "Work Management App" }, { user: "bob@cps.gov.uk", appName: "CMS Classic" });
      expect(onPresenceChanged).toHaveBeenCalledTimes(1);

      // ...and releases it when the Classic session goes, though they are still here.
      await arrive({ user: "bob@cps.gov.uk", appName: "Work Management App" });
      expect(onPresenceChanged).toHaveBeenCalledTimes(2);
    });

    it("matches the application name whatever its casing", async () => {
      const { onPresenceChanged, arrive } = await onWitnessWatching();
      await arrive({ user: "bob@cps.gov.uk", appName: "cms classic" });
      expect(onPresenceChanged).toHaveBeenCalledTimes(1);
    });
  });

  describe("presence publication", () => {
    // The roster goes to the store as the API reported it, the reader included:
    // leaving them out (or keeping them in, under caseLockingCountSelf) is
    // CCPView's job where the roster is drawn, the same in all three UIs.
    it("publishes everyone in the section, ourselves included", async () => {
      const { service, hubFor, register } = setup();
      service.setCaseId("123");
      service.addRegion("witness");
      await flush();

      hubFor(sid("123", "WITNESS"))!.__notify?.(presence([
        { user: "alice", appName: "test-app" },
        { user: "bob@cps.gov.uk", appName: "CMS" },
      ]));
      await flush();

      expect(register).toHaveBeenLastCalledWith({
        caseLockingPresentUsers: {
          sections: [
            {
              code: "witness",
              members: [
                { userEmail: "alice", sourceApplication: "test-app", joinedAt: "", sections: [{ kind: "WITNESS", isCurrent: true }] },
                { userEmail: "bob@cps.gov.uk", sourceApplication: "CMS", joinedAt: "", sections: [{ kind: "WITNESS", isCurrent: true }] },
              ],
              occupiedOnEntry: true,
            },
          ],
        },
      });
    });

    it("leaves it to the view to drop the reader, whatever the hub's casing", async () => {
      const { service, hubFor, allUsers, people } = setup();
      service.setCaseId("123");
      service.addRegion("witness");
      await flush();

      hubFor(sid("123", "WITNESS"))!.__notify?.(presence([{ user: "ALICE", appName: "CMS" }]));
      await flush();
      expect(allUsers()).toHaveLength(1);
      expect(people()).toEqual([]);
    });

    it("subsequent Notifys overwrite the published list", async () => {
      const { service, hubFor, allUsers } = setup();
      service.setCaseId("123");
      service.addRegion("witness");
      await flush();

      hubFor(sid("123", "WITNESS"))!.__notify?.(presence([{ user: "bob", appName: "CMS" }]));
      await flush();
      expect(allUsers()).toHaveLength(1);

      hubFor(sid("123", "WITNESS"))!.__notify?.(presence([
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

      hubFor(sid("123", "WITNESS"))!.__notify?.(presence([
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

      hubFor(sid("123", "WITNESS"))!.__notify?.(presence([
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

      hubFor(sid("123", "WITNESS"))!.__notify?.(presence([{ user: "bob@cps.gov.uk", appName: "CMS" }]));
      await flush();

      expect(sectionOf(getPresentUsers, "witness")?.occupiedOnEntry).toBe(true);
    });

    it("is false when the section was empty on the first retrieval and someone joins later", async () => {
      const { service, hubFor, getPresentUsers } = setup();
      service.setCaseId("123");
      service.addRegion("witness");
      await flush();

      // First retrieval: nobody here but us.
      hubFor(sid("123", "WITNESS"))!.__notify?.(presence([]));
      await flush();

      hubFor(sid("123", "WITNESS"))!.__notify?.(presence([{ user: "bob@cps.gov.uk", appName: "CMS" }]));
      await flush();

      expect(sectionOf(getPresentUsers, "witness")?.members).toHaveLength(1);
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

      hubFor(sid("123", "WITNESS"))!.__notify?.(presence([]));
      await flush();

      hubFor(sid("123", "WITNESS"))!.__notify?.(
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
    // The section is typed explicitly rather than inferred from the default: an
    // inferred { caseId, kind } rejects the subjectId that subject-scoped sections
    // carry, and the tests below need both shapes.
    const notification = (
      version: number,
      users: string[],
      section: { caseId: string; kind: string; subjectId?: string } = { caseId: "123", kind: "WITNESS" },
    ) => ({
      type: 0,
      payload: {
        snapshots: [{ section: { ...section, kind: CCPEnvironment.suffixKind(section.kind) }, version, members: users.map(user => ({ userEmail: user, sourceApplication: "CMS" })) }],
      },
    });

    const onWitness = async () => {
      const rig = setup();
      rig.service.setCaseId("123");
      rig.service.addRegion("witness");
      await flush();
      return { ...rig, hub: rig.hubFor(sid("123", "WITNESS"))! };
    };

    it("applies a snapshot and publishes its members", async () => {
      const { hub, allUsers } = await onWitness();
      hub.__notify?.(notification(1, ["bob@cps.gov.uk"]));
      await flush();
      expect(allUsers()).toEqual([{ userEmail: "bob@cps.gov.uk", sourceApplication: "CMS", joinedAt: "", sections: [{ kind: "WITNESS", isCurrent: true }] }]);
    });

    it("discards a snapshot older than one already applied — they arrive out of order", async () => {
      const { hub, allUsers } = await onWitness();
      hub.__notify?.(notification(5, ["bob@cps.gov.uk"]));
      await flush();
      hub.__notify?.(notification(3, ["carol@cps.gov.uk", "dave@cps.gov.uk"]));
      await flush();
      // The late arrival must not resurrect a roster that has moved on.
      expect(allUsers()).toEqual([{ userEmail: "bob@cps.gov.uk", sourceApplication: "CMS", joinedAt: "", sections: [{ kind: "WITNESS", isCurrent: true }] }]);
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

    it("ignores a snapshot for another case entirely", async () => {
      const { hub, getPresentUsers } = await onWitness();
      hub.__notify?.(notification(1, ["bob@cps.gov.uk"], { caseId: "999", kind: "WITNESS" }));
      await flush();
      expect(getPresentUsers()).toBeUndefined();
    });

    // THE CONFLICT SET. The hub sends a section every section it conflicts with —
    // a sub-section binding hears about the case around it, not just itself — so a
    // colleague on the case reaches the banner of someone editing a witness. This
    // was previously discarded, and the person doing the delicate work was the one
    // told nothing.
    it("keeps another section of the same case, marked as not the one in focus", async () => {
      const { hub, allUsers } = await onWitness();
      hub.__notify?.(notification(1, ["bob@cps.gov.uk"], { caseId: "123", kind: "CASE" }));
      await flush();
      expect(allUsers()).toEqual([
        { userEmail: "bob@cps.gov.uk", sourceApplication: "CMS", joinedAt: "", sections: [{ kind: "CASE", isCurrent: false }] },
      ]);
    });

    // ...and it must not interrupt. Reading the case is not a clash with editing a
    // witness inside it; only someone in our own section can be that.
    it("does not count another section of the case as occupied on entry", async () => {
      const { hub, getPresentUsers } = await onWitness();
      hub.__notify?.(notification(1, ["bob@cps.gov.uk"], { caseId: "123", kind: "CASE" }));
      hub.__notify?.(notification(2, [], { caseId: "123", kind: "WITNESS" }));
      await flush();
      expect(getPresentUsers()?.sections[0].occupiedOnEntry).toBe(false);
    });

    // The other half of the same rule: someone in OUR section, already there when
    // we arrived, is the clash the interruption exists for.
    // You cannot clash with yourself. countSelf exists so a lone developer can SEE
    // the roster working, not so it can manufacture a collision — without this,
    // turning it on would raise the interruption on every case review opened alone.
    it("never counts us as occupying our own section, whatever the hub's casing", async () => {
      const { service, hubFor, getPresentUsers } = setup();
      service.setCaseId("123");
      service.addRegion("witness");
      await flush();
      hubFor(sid("123", "WITNESS"))!.__notify?.(presence([{ user: "Alice", appName: "test-app" }]));
      await flush();
      // Published — countSelf may want to show it — but not an interruption.
      expect(getPresentUsers()?.sections[0].members).toHaveLength(1);
      expect(getPresentUsers()?.sections[0].occupiedOnEntry).toBe(false);
    });

    it("counts our own section as occupied on entry", async () => {
      const { hub, getPresentUsers } = await onWitness();
      hub.__notify?.(notification(1, ["bob@cps.gov.uk"], { caseId: "123", kind: "WITNESS" }));
      await flush();
      expect(getPresentUsers()?.sections[0].occupiedOnEntry).toBe(true);
    });

    // A payload can carry a conflicting section before our own section's snapshot
    // has been seen. Latching then would record "empty" for a section we had not
    // heard about yet and lose the interruption for the rest of the visit.
    it("waits for our own section before deciding occupancy", async () => {
      const { hub, getPresentUsers } = await onWitness();
      hub.__notify?.(notification(1, ["ann@cps.gov.uk"], { caseId: "123", kind: "CASE" }));
      await flush();
      hub.__notify?.(notification(2, ["bob@cps.gov.uk"], { caseId: "123", kind: "WITNESS" }));
      await flush();
      expect(getPresentUsers()?.sections[0].occupiedOnEntry).toBe(true);
    });

    // Once the special case, now just an instance of the general one: EVERY session
    // is sent its conflict set, so every session takes any section of its own case.
    // Kept as its own block because the case-wide binding is the one where someone
    // reported only in a sub-section must still count as being on this case.
    describe("the case-wide session takes any section of its case", () => {
      const onCase = async () => {
        const rig = setup();
        rig.service.setCaseId("123");
        rig.service.addRegion("case");
        await flush();
        return { ...rig, hub: rig.hubFor(sid("123", "CASE"))! };
      };

      it("counts someone who is only in a sub-section", async () => {
        const { hub, allUsers } = await onCase();
        hub.__notify?.(notification(1, ["bob@cps.gov.uk"], { caseId: "123", kind: "CASE_REVIEW" }));
        await flush();
        expect(allUsers()).toEqual([{ userEmail: "bob@cps.gov.uk", sourceApplication: "CMS", joinedAt: "", sections: [{ kind: "CASE_REVIEW", isCurrent: false }] }]);
      });

      it("counts a subject-scoped sub-section too", async () => {
        const { hub, allUsers } = await onCase();
        hub.__notify?.(notification(1, ["bob@cps.gov.uk"], { caseId: "123", kind: "VICTIM_WITNESS", subjectId: "543231" }));
        await flush();
        expect(allUsers()).toHaveLength(1);
      });

      // The same person in two sections is one person on this case, in both.
      it("reports someone in several sections once", async () => {
        const { hub, people } = await onCase();
        hub.__notify?.(notification(1, ["bob@cps.gov.uk"], { caseId: "123", kind: "CASE" }));
        hub.__notify?.(notification(1, ["bob@cps.gov.uk"], { caseId: "123", kind: "CASE_REVIEW" }));
        await flush();
        expect(people()).toHaveLength(1);
        expect(people()[0].sections.map(section => section.kind).sort()).toEqual(["CASE", "CASE_REVIEW"]);
      });

      it("merges different people across sections", async () => {
        const { hub, allUsers } = await onCase();
        hub.__notify?.(notification(1, ["bob@cps.gov.uk"], { caseId: "123", kind: "CASE" }));
        hub.__notify?.(notification(1, ["ann@cps.gov.uk"], { caseId: "123", kind: "CASE_REVIEW" }));
        await flush();
        expect(allUsers().map(u => u.userEmail).sort()).toEqual(["ann@cps.gov.uk", "bob@cps.gov.uk"]);
      });

      // Versions are issued PER SECTION. A single counter would let a high version
      // in one section suppress a later, live snapshot in another.
      it("versions each section independently", async () => {
        const { hub, allUsers } = await onCase();
        hub.__notify?.(notification(7, ["ann@cps.gov.uk"], { caseId: "123", kind: "CASE_REVIEW" }));
        hub.__notify?.(notification(5, ["bob@cps.gov.uk"], { caseId: "123", kind: "CASE" }));
        await flush();
        expect(allUsers().map(u => u.userEmail).sort()).toEqual(["ann@cps.gov.uk", "bob@cps.gov.uk"]);
      });

      it("still ignores another case entirely", async () => {
        const { hub, getPresentUsers } = await onCase();
        hub.__notify?.(notification(1, ["bob@cps.gov.uk"], { caseId: "999", kind: "CASE_REVIEW" }));
        await flush();
        expect(getPresentUsers()).toBeUndefined();
      });

      // THE ONE THE READER IS LOOKING AT is the section this connection registered.
      // Under a case-wide session that is the case itself, and every sub-section
      // reported alongside it is somewhere else — so the UI says "a witness or
      // victim", not "this" one. Getting this backwards would tell a caseworker
      // that someone is on the very witness they have open when they are on a
      // different witness in the same case.
      it("marks only the registered section as the one in focus", async () => {
        const { hub, allUsers } = await onCase();
        hub.__notify?.(notification(1, ["bob@cps.gov.uk"], { caseId: "123", kind: "CASE" }));
        hub.__notify?.(notification(1, ["ann@cps.gov.uk"], { caseId: "123", kind: "VICTIM_WITNESS", subjectId: "543231" }));
        await flush();
        const byUser = Object.fromEntries(allUsers().map(user => [user.userEmail, user.sections]));
        expect(byUser["bob@cps.gov.uk"]).toEqual([{ kind: "CASE", isCurrent: true }]);
        expect(byUser["ann@cps.gov.uk"]).toEqual([{ kind: "VICTIM_WITNESS", isCurrent: false }]);
      });


      // One person signed into two systems is two presences, and both matter: the
      // banner names the applications, so dropping the later one would report them
      // as being somewhere they have also left.
      it("keeps both systems when one person is in two", async () => {
        const { hub, people } = await onCase();
        hub.__notify?.({
          type: 0,
          payload: {
            snapshots: [
              {
                section: { caseId: "123", kind: "CASE" },
                version: 1,
                members: [
                  { userEmail: "bob@cps.gov.uk", sourceApplication: "Work Management App", joinedAt: "2026-09-09T14:00:00Z" },
                  { userEmail: "bob@cps.gov.uk", sourceApplication: "CMS Classic", joinedAt: "2026-09-09T15:00:00Z" },
                ],
              },
            ],
          },
        });
        await flush();
        expect(people()).toHaveLength(1);
        expect(people()[0].apps).toHaveLength(2);
      });

      // The same person, same application, reported by two sections is ONE arrival.
      it("keeps one entry per system", async () => {
        const { hub, people } = await onCase();
        const inApp = (kind: string, joinedAt: string) => ({
          type: 0,
          payload: {
            snapshots: [
              {
                section: { caseId: "123", kind },
                version: 1,
                members: [{ userEmail: "bob@cps.gov.uk", sourceApplication: "CMS Classic", joinedAt }],
              },
            ],
          },
        });
        hub.__notify?.(inApp("CASE", "2026-09-09T15:00:00Z"));
        hub.__notify?.(inApp("CASE_REVIEW", "2026-09-09T14:00:00Z"));
        await flush();
        expect(people()).toHaveLength(1);
        expect(people()[0].apps).toHaveLength(1);
      });

      it("a section emptying removes only its own members", async () => {
        const { hub, allUsers } = await onCase();
        hub.__notify?.(notification(1, ["bob@cps.gov.uk"], { caseId: "123", kind: "CASE" }));
        hub.__notify?.(notification(1, ["ann@cps.gov.uk"], { caseId: "123", kind: "CASE_REVIEW" }));
        hub.__notify?.(notification(2, [], { caseId: "123", kind: "CASE_REVIEW" }));
        await flush();
        expect(allUsers().map(u => u.userEmail)).toEqual(["bob@cps.gov.uk"]);
      });
    });

    // A subject-scoped region: the reader is on ONE witness, and the section the
    // server reports is that witness. This is the case the definite article was
    // added for.
    describe("a subject-scoped region", () => {
      const onWitness543231 = async () => {
        const rig = setup();
        rig.service.setCaseId("123");
        rig.service.addRegion("victim_witness", "543231");
        await flush();
        return { ...rig, hub: rig.hubFor(sid("123", "VICTIM_WITNESS", "543231"))! };
      };

      it("marks its own subject as the one in focus", async () => {
        const { hub, allUsers } = await onWitness543231();
        hub.__notify?.(notification(1, ["bob@cps.gov.uk"], { caseId: "123", kind: "VICTIM_WITNESS", subjectId: "543231" }));
        await flush();
        expect(allUsers()[0].sections).toEqual([{ kind: "VICTIM_WITNESS", isCurrent: true }]);
      });

      // Another witness in the same case is in the conflict set, so we hear about
      // them — but they are NOT the record in front of us. Reporting them as "this
      // witness or victim", or interrupting for them, would both be lies.
      it("keeps another subject of the same kind without claiming it is ours", async () => {
        const { hub, allUsers, getPresentUsers } = await onWitness543231();
        hub.__notify?.(notification(1, ["bob@cps.gov.uk"], { caseId: "123", kind: "VICTIM_WITNESS", subjectId: "999999" }));
        hub.__notify?.(notification(2, [], { caseId: "123", kind: "VICTIM_WITNESS", subjectId: "543231" }));
        await flush();
        expect(allUsers()[0].sections).toEqual([{ kind: "VICTIM_WITNESS", isCurrent: false }]);
        expect(getPresentUsers()?.sections[0].occupiedOnEntry).toBe(false);
      });
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
    // disappears ten seconds after it appears. The beat is the legacy clients'.
    it("beats inside the server's eviction window", async () => {
      expect(CCPSections.HEARTBEAT_MS).toBeLessThan(5000);
      const { service, hubFor } = setup();
      service.setCaseId("123");
      service.addRegion("witness");
      await flush();
      const hub = hubFor(sid("123", "WITNESS"))!;
      hub.invoke.mockClear();

      jest.advanceTimersByTime(CCPSections.HEARTBEAT_MS);
      await flush();
      expect(hub.invoke).toHaveBeenCalledWith("KeepAlive");

      jest.advanceTimersByTime(CCPSections.HEARTBEAT_MS);
      await flush();
      expect(hub.invoke.mock.calls.filter(([method]) => method === "KeepAlive")).toHaveLength(2);
    });

    it("rejoins when the server says the session was evicted", async () => {
      const { service, hubFor } = setup();
      service.setCaseId("123");
      service.addRegion("witness");
      await flush();
      const hub = hubFor(sid("123", "WITNESS"))!;
      hub.invoke.mockClear();
      hub.invoke.mockImplementation((method: string) =>
        method === "KeepAlive" ? Promise.reject(new Error("SESSION_EVICTED: gone")) : Promise.resolve(),
      );

      jest.advanceTimersByTime(CCPSections.HEARTBEAT_MS);
      await flush();
      expect(hub.invoke).toHaveBeenCalledWith("Connect", sid("123", "WITNESS"), "test-app");
    });

    it("stops beating once the connection is torn down", async () => {
      const { service, hubFor } = setup();
      service.setCaseId("123");
      service.addRegion("witness");
      await flush();
      service.removeRegion("witness");
      await flush();
      const hub = hubFor(sid("123", "WITNESS"))!;
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
      const hub = hubFor(sid("123", "WITNESS"))!;
      service.removeRegion("witness");
      await flush();

      expect(hub.invoke).toHaveBeenCalledWith("Leave");
      const leaveOrder = hub.invoke.mock.invocationCallOrder[hub.invoke.mock.calls.findIndex(([method]) => method === "Leave")];
      expect(leaveOrder).toBeLessThan(hub.stop.mock.invocationCallOrder[0]);
    });
  });
});
