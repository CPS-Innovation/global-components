import { formatJoined } from "./format-joined";

// Local time throughout: "today" means the reader's today. Constructed with the
// Date(y, m, d, h, m) form rather than an ISO string so these are unambiguous
// regardless of the machine's zone.
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

const NOW = new Date(2026, 8, 8, 14, 0); // 8 September 2026, 2pm local

describe("formatJoined", () => {
  it("gives the time alone when it is today", () => {
    expect(formatJoined(at(2026, 9, 8, 15, 38), NOW)).toBe("3.38pm");
    expect(formatJoined(at(2026, 9, 8, 9, 5), NOW)).toBe("9.05am");
  });

  it("says yesterday when it is yesterday", () => {
    expect(formatJoined(at(2026, 9, 7, 15, 38), NOW)).toBe("3.38pm yesterday");
  });

  it("gives the full date before that", () => {
    expect(formatJoined(at(2026, 9, 6, 15, 38), NOW)).toBe("3.38pm on 6 September 2026");
    expect(formatJoined(at(2025, 12, 31, 23, 0), NOW)).toBe("11.00pm on 31 December 2025");
  });

  // Calendar days, not elapsed hours: 11pm and 1am are two hours apart and are
  // different days, which is what a reader means by "yesterday".
  it("counts days, not hours", () => {
    const justAfterMidnight = new Date(2026, 8, 8, 0, 30);
    expect(formatJoined(at(2026, 9, 7, 23, 0), justAfterMidnight)).toBe("11.00pm yesterday");
    expect(formatJoined(at(2026, 9, 8, 0, 5), justAfterMidnight)).toBe("12.05am");
  });

  // Noon and midnight are the two the 12-hour clock gets wrong.
  it("handles noon and midnight", () => {
    expect(formatJoined(at(2026, 9, 8, 12, 0), NOW)).toBe("12.00pm");
    expect(formatJoined(at(2026, 9, 8, 0, 0), NOW)).toBe("12.00am");
  });

  it("is undefined when there is nothing usable to say", () => {
    expect(formatJoined(undefined, NOW)).toBeUndefined();
    expect(formatJoined("", NOW)).toBeUndefined();
    expect(formatJoined("not a date", NOW)).toBeUndefined();
  });

  // Should not happen, but reads better as a date than as "in -3 days".
  it("shows a future timestamp as a date", () => {
    expect(formatJoined(at(2026, 9, 20, 10, 0), NOW)).toBe("10.00am on 20 September 2026");
  });
});
