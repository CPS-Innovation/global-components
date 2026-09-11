import { describeCaseLock, getCaseLock } from "./get-case-lock";
import { CaseDetails } from "../data/CaseDetails";
import { Result } from "../../utils/Result";

const found = (partial: Partial<CaseDetails>): Result<CaseDetails> =>
  ({ found: true, result: partial as CaseDetails }) as Result<CaseDetails>;

describe("getCaseLock", () => {
  // "Not locked" and "we have not looked" are different answers, and only one of
  // them is safe to render. Conflating them would let a banner say a case is free
  // when we simply have no data.
  it("distinguishes not-knowing from not-locked", () => {
    expect(getCaseLock(undefined)).toBeUndefined();
    expect(getCaseLock({ found: false, error: new Error("boom") } as Result<CaseDetails>)).toBeUndefined();
    expect(getCaseLock(found({}))?.locked).toBe(false);
  });

  it("reads the holder, the application and when", () => {
    const lock = getCaseLock(
      found({ locking: { locked: true, byFirstNames: "John", bySurname: "Smith", application: "Work Management App", since: "2026-09-10T09:00:00Z" } }),
    );
    expect(lock).toEqual({ locked: true, by: "John Smith", application: "RCMS", since: "2026-09-10T09:00:00Z" });
  });

  // The API's application vocabulary is the backend's, not the user's — the same
  // mapping the roster uses, so a lock and a presence name one product one way.
  it("names the application as the roster does", () => {
    expect(getCaseLock(found({ locking: { locked: true, application: "Case Review App" } }))?.application).toBe("RCMS");
  });

  it("copes with a holder the API only half named", () => {
    expect(getCaseLock(found({ locking: { locked: true, bySurname: "Smith" } }))?.by).toBe("Smith");
    expect(getCaseLock(found({ locking: { locked: true, byFirstNames: "John" } }))?.by).toBe("John");
    expect(getCaseLock(found({ locking: { locked: true } }))?.by).toBe("");
  });

  // locking.locked is dominant because it is the flag that arrives with a holder
  // attached; isLocked stands in when the block is absent entirely.
  it("prefers locking.locked, falling back to isLocked", () => {
    expect(getCaseLock(found({ isLocked: false, locking: { locked: true } }))?.locked).toBe(true);
    expect(getCaseLock(found({ isLocked: true, locking: { locked: false } }))?.locked).toBe(false);
    expect(getCaseLock(found({ isLocked: true }))?.locked).toBe(true);
    expect(getCaseLock(found({ isLocked: true, locking: null }))?.locked).toBe(true);
  });

  // The whole point of carrying both flags for now: neither field may exist, and a
  // missing block must read as "not locked" rather than throwing.
  it("survives a payload with no locking information at all", () => {
    expect(getCaseLock(found({ isLocked: null, locking: null }))?.locked).toBe(false);
    expect(getCaseLock(found({}))).toEqual({ locked: false, by: "", application: "", since: undefined });
  });
});

describe("describeCaseLock", () => {
  const lockedBy = (partial: Partial<CaseDetails["locking"]>) =>
    getCaseLock(found({ locking: { locked: true, ...partial } }));

  // Fixed clock so the "since" clause is stable — formatJoined says "3.38pm" for
  // today and a full date otherwise, and this test is about the sentence, not the
  // time formatting, which has its own tests.
  it("reads as one sentence", () => {
    expect(describeCaseLock(lockedBy({ byFirstNames: "John", bySurname: "Smith", application: "Work Management App" }))).toBe(
      "John Smith is locking this case in RCMS.",
    );
  });

  // An incomplete record degrades to a shorter TRUE sentence rather than one with
  // a hole in it — the API does not promise us every field.
  it("drops the clauses the API did not send", () => {
    expect(describeCaseLock(lockedBy({ byFirstNames: "John", bySurname: "Smith" }))).toBe("John Smith is locking this case.");
    expect(describeCaseLock(lockedBy({ application: "Casework App" }))).toBe("Someone is locking this case in RCMS.");
    expect(describeCaseLock(lockedBy({}))).toBe("Someone is locking this case.");
  });

  // "" so a caller can omit the line entirely rather than render an empty paragraph.
  it("says nothing when there is no lock", () => {
    expect(describeCaseLock(undefined)).toBe("");
    expect(describeCaseLock(getCaseLock(found({ isLocked: false })))).toBe("");
  });
});
