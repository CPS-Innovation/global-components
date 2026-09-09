import { initialiseCaseLocking } from "./initialise-case-locking";
import { RegionEnterEvent, RegionLeaveEvent } from "../../components/cps-global-locking-region/region-events";
import * as presenceModule from "./case-locking-presence";

// The presence service is created lazily, after auth, so these tests drive
// initialiseCaseLockingForContext once and then work through the region events.
// Automocked and then given a return value per test: a jest.mock factory returning
// a shared object does not survive the module boundary here.
jest.mock("./case-locking-presence");

const setup = () => {
  const presence = {
    setCaseId: jest.fn(),
    addRegion: jest.fn(),
    removeRegion: jest.fn(),
  };
  jest.spyOn(presenceModule, "createCaseLockingPresence").mockReturnValue(presence as any);

  const { initialiseCaseLockingForContext } = initialiseCaseLocking({
    window: window as any,
    config: { CASE_LOCKING_API_URL: "https://example.test/api" } as any,
    preview: { found: true, result: { caseLocking: true } } as any,
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

  return { presence, authed, enter, leave };
};

describe("region precedence", () => {
  // The header registers this on every case page. It is a fallback, not a claim
  // about where in the case the user is.
  it("holds the case-wide fallback when nothing more specific is on screen", () => {
    const { presence, authed, enter } = setup();
    authed();
    enter("case");
    expect(presence.addRegion).toHaveBeenCalledWith("case", undefined);
  });

  it("stands the fallback down when a specific region appears", () => {
    const { presence, authed, enter } = setup();
    authed();
    enter("case");
    presence.addRegion.mockClear();

    enter("case_review");

    expect(presence.removeRegion).toHaveBeenCalledWith("case", undefined);
    expect(presence.addRegion).toHaveBeenCalledWith("case_review", undefined);
  });

  it("brings the fallback back when the last specific region goes", () => {
    const { presence, authed, enter, leave } = setup();
    authed();
    enter("case");
    enter("case_review");
    presence.addRegion.mockClear();
    presence.removeRegion.mockClear();

    leave("case_review");

    expect(presence.removeRegion).toHaveBeenCalledWith("case_review", undefined);
    expect(presence.addRegion).toHaveBeenCalledWith("case", undefined);
  });

  // Several specific regions can be on screen at once — two witnesses, say — and
  // the fallback stays down until the last of them leaves.
  it("keeps the fallback down while any specific region remains", () => {
    const { presence, authed, enter, leave } = setup();
    authed();
    enter("case");
    enter("witness", "111");
    enter("witness", "222");
    presence.addRegion.mockClear();

    leave("witness", "111");

    expect(presence.addRegion).not.toHaveBeenCalledWith("case", undefined);
  });

  // A page that already had a specific region on screen before auth completed must
  // not end up holding both once presence exists.
  it("replays a specific region without resurrecting the fallback", () => {
    const { presence, authed, enter } = setup();
    enter("case");
    enter("case_review");

    authed();

    expect(presence.addRegion).toHaveBeenCalledWith("case_review", undefined);
    expect(presence.addRegion).not.toHaveBeenCalledWith("case", undefined);
  });
});
