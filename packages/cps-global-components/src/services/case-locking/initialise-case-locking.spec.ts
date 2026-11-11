import { initialiseCaseLocking } from "./initialise-case-locking";
import { CCPEnvironment } from "cps-global-presence";
import { RegionEnterEvent, RegionLeaveEvent } from "../../components/cps-global-locking-region/region-events";
import * as presenceModule from "./case-locking-presence";

// The presence service is created lazily, after auth, so these tests drive
// initialiseCaseLockingForContext once and then work through the region events.
// Automocked and then given a return value per test: a jest.mock factory returning
// a shared object does not survive the module boundary here.
jest.mock("./case-locking-presence");

// The session hint as the proxy serves it on a CIN instance. Everything below
// needs one, because case locking stays inert until it knows which CMS instance
// this session belongs to — the room is keyed on it (see CCPEnvironment).
const ON_CIN3 = { found: true, result: { cmsDomains: ["cin3.cps.gov.uk"], isProxySession: true, handoverEndpoint: null } } as any;

// CCPEnvironment is a module singleton and adopts ONCE, so a value left over from
// the previous test would refuse the next one's.
beforeEach(() => {
  CCPEnvironment.CIN = null;
});

const setup = (cmsSessionHint = ON_CIN3) => {
  const presence = {
    setCaseId: jest.fn(),
    setRegions: jest.fn(),
  };
  // What presence was last told to hold, as "code" or "code:subject".
  const holding = () => {
    const calls = presence.setRegions.mock.calls;
    return calls.length ? calls[calls.length - 1][0].map(({ code, subjectId }: any) => (subjectId ? `${code}:${subjectId}` : code)) : [];
  };
  jest.spyOn(presenceModule, "createCaseLockingPresence").mockReturnValue(presence as any);

  const { initialiseCaseLockingForContext } = initialiseCaseLocking({
    window: window as any,
    config: { CASE_LOCKING_API_URL: "https://example.test/api", FEATURE_FLAG_CASE_LOCKING_USERS: { generallyAvailable: true } } as any,
    preview: { found: true, result: {} } as any,
    cmsSessionHint,
    register: jest.fn(),
  });

  const authed = () =>
    initialiseCaseLockingForContext({
      auth: { isAuthed: true, username: "me@cps.gov.uk" } as any,
      caseIdentifiers: { caseId: "123" } as any,
      getToken: (async () => "token") as any,
      context: { found: true, caseLockingAppName: "Case Review App" } as any,
    });

  const enter = (code: string, subjectId?: string) => document.dispatchEvent(new RegionEnterEvent({ code, subjectId }));
  const leave = (code: string, subjectId?: string) => document.dispatchEvent(new RegionLeaveEvent({ code, subjectId }));

  return { presence, authed, enter, leave, holding };
};

describe("region precedence", () => {
  // The header registers this on every case page. It is a fallback, not a claim
  // about where in the case the user is.
  it("holds the case-wide fallback when nothing more specific is on screen", () => {
    const { authed, enter, holding } = setup();
    authed();
    enter("case");
    expect(holding()).toEqual(["case"]);
  });

  it("stands the fallback down when a specific region appears", () => {
    const { authed, enter, holding } = setup();
    authed();
    enter("case");
    enter("case_review");
    expect(holding()).toEqual(["case_review"]);
  });

  it("brings the fallback back when the last specific region goes", () => {
    const { authed, enter, leave, holding } = setup();
    authed();
    enter("case");
    enter("case_review");
    leave("case_review");
    expect(holding()).toEqual(["case"]);
  });

  // Several specific regions can be on screen at once — two witnesses, say — and
  // the fallback stays down until the last of them leaves.
  it("keeps the fallback down while any specific region remains", () => {
    const { authed, enter, leave, holding } = setup();
    authed();
    enter("case");
    enter("victim_witness", "111");
    enter("victim_witness", "222");
    leave("victim_witness", "111");
    expect(holding()).toEqual(["victim_witness:222"]);
  });

  // Two elements for one section are one section, held until both have gone.
  it("ref-counts regions by section identity", () => {
    const { authed, enter, leave, holding } = setup();
    authed();
    enter("case");
    enter("case_review");
    enter("case_review");
    leave("case_review");
    expect(holding()).toEqual(["case_review"]);
    leave("case_review");
    expect(holding()).toEqual(["case"]);
  });

  // A page that already had a specific region on screen before auth completed must
  // not end up holding both once presence exists.
  it("replays a specific region without resurrecting the fallback", () => {
    const { authed, enter, holding } = setup();
    enter("case");
    enter("case_review");

    authed();

    expect(holding()).toEqual(["case_review"]);
  });
});

/* WHICH CMS INSTANCE'S PRESENCE WE JOIN.
 *
 * The suffix on the section kind is what keeps CIN2, CIN3 and CIN5 out of each
 * other's rosters on the Watchdog they share, and it comes from the session hint.
 * Getting it wrong is SILENT — the room is simply always empty — so the rule is
 * that an unknown environment registers nothing at all rather than guessing at
 * the unsuffixed name.
 */
describe("the CMS instance", () => {
  it("adopts the instance named by the session hint", () => {
    const { authed, enter, presence } = setup();
    authed();
    enter("case");
    expect(CCPEnvironment.CIN).toBe("CIN3");
    expect(presence.setRegions).toHaveBeenCalled();
  });

  // Production has a Watchdog of its own, so it takes no suffix — which is a
  // KNOWN answer, not an absent one, and must still register.
  it("knows that production takes no suffix, and still registers", () => {
    const hint = { found: true, result: { cmsDomains: ["cms.cps.gov.uk"], isProxySession: true, handoverEndpoint: null } } as any;
    const { authed, enter, presence } = setup(hint);
    authed();
    enter("case");
    expect(CCPEnvironment.CIN).toBe("");
    expect(CCPEnvironment.known()).toBe(true);
    expect(presence.setRegions).toHaveBeenCalled();
  });

  it("stays inert when the hint could not be read", () => {
    const { authed, enter, presence } = setup({ found: false, error: new Error("no hint") } as any);
    authed();
    enter("case");
    expect(CCPEnvironment.known()).toBe(false);
    expect(presence.setRegions).not.toHaveBeenCalled();
  });

  // Local development and OutSystems dev both land here: no CMS, so no domain to
  // derive an instance from. Registering unsuffixed would put us in a room nobody
  // occupies, which looks exactly like presence working on a quiet case.
  it("stays inert when the hint names no CMS domain", () => {
    const hint = { found: true, result: { cmsDomains: [], isProxySession: true, handoverEndpoint: null } } as any;
    const { authed, enter, presence } = setup(hint);
    authed();
    enter("case");
    expect(CCPEnvironment.known()).toBe(false);
    expect(presence.setRegions).not.toHaveBeenCalled();
  });
});
