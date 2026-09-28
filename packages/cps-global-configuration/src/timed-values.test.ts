import { describe, test, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findTimedValueProblems, getTimedValueMoments, resolveTimedValues } from "./timed-values";
import { transformAndValidateConfig } from "./validator";

const SWITCH = "2026-10-08T09:00:00+01:00";
const JUST_BEFORE = new Date("2026-10-08T07:59:59.999Z");
const AT_SWITCH = new Date("2026-10-08T08:00:00Z");

describe("resolveTimedValues", () => {
  test("uses the until value before the moment and value from the moment on", () => {
    const json = { REPORT_ISSUE_LINK: { value: "new", [`until ${SWITCH}`]: "old" } };

    expect(resolveTimedValues(json, JUST_BEFORE)).toEqual({ REPORT_ISSUE_LINK: "old" });
    expect(resolveTimedValues(json, AT_SWITCH)).toEqual({ REPORT_ISSUE_LINK: "new" });
  });

  test("steps through a sequence of until keys regardless of key order", () => {
    const json = {
      SHOW_HEADER_REBRAND: {
        value: "gds",
        "until 2026-11-01T09:00:00Z": "cps",
        "until 2026-10-01T09:00:00+01:00": "gds-preview",
      },
    };

    expect(resolveTimedValues(json, new Date("2026-09-30T00:00:00Z"))).toEqual({ SHOW_HEADER_REBRAND: "gds-preview" });
    expect(resolveTimedValues(json, new Date("2026-10-15T00:00:00Z"))).toEqual({ SHOW_HEADER_REBRAND: "cps" });
    expect(resolveTimedValues(json, new Date("2026-11-02T00:00:00Z"))).toEqual({ SHOW_HEADER_REBRAND: "gds" });
  });

  test("a null step removes the setting", () => {
    const json = { SHOW_NOTIFICATIONS: { value: true, [`until ${SWITCH}`]: null }, OTHER: null };

    expect(resolveTimedValues(json, JUST_BEFORE)).toEqual({ OTHER: null });
    expect(resolveTimedValues(json, AT_SWITCH)).toEqual({ SHOW_NOTIFICATIONS: true, OTHER: null });
  });

  test("leaves plain settings, objects and arrays alone", () => {
    const json = { A: "a", B: { value: 1 }, C: [1, 2], D: { WMA_JSON: "x" } };

    expect(resolveTimedValues(json, AT_SWITCH)).toEqual(json);
  });

  test("passes non-object input through", () => {
    expect(resolveTimedValues("nope", AT_SWITCH)).toBe("nope");
  });

  test.each([
    [{ [`until ${SWITCH}`]: "old" }, /no "value"/],
    [{ value: "new", "until 2026-10-08T09:00:00": "old" }, /explicit offset/],
    [{ value: "new", "until 8th October": "old" }, /explicit offset/],
    [{ value: "new", "until 2026-13-45T09:00:00Z": "old" }, /not a valid date-time/],
    [{ value: "new", [`until ${SWITCH}`]: "old", other: "x" }, /unexpected key "other"/],
    [{ value: "new", [`until ${SWITCH}`]: "old", "until 2026-10-08T08:00:00Z": "older" }, /same moment/],
  ])("rejects a malformed timed value %#", (timedValue, error) => {
    expect(() => resolveTimedValues({ X: timedValue }, AT_SWITCH)).toThrow(error);
  });
});

describe("getTimedValueMoments", () => {
  test("returns distinct moments across settings in ascending order", () => {
    const json = {
      A: { value: 1, "until 2026-11-01T09:00:00Z": 0 },
      B: { value: 1, [`until ${SWITCH}`]: 0 },
      C: { value: 1, "until 2026-10-08T08:00:00Z": 0 },
      D: "plain",
    };

    expect(getTimedValueMoments(json)).toEqual([AT_SWITCH, new Date("2026-11-01T09:00:00Z")]);
  });
});

describe("findTimedValueProblems", () => {
  const now = new Date("2026-09-28T12:00:00Z");

  test("no problems for a future moment with the correct UK offset", () => {
    expect(findTimedValueProblems({ REPORT_ISSUE_LINK: { value: "new", [`until ${SWITCH}`]: "old" } }, now)).toEqual([]);
    expect(findTimedValueProblems({ REPORT_ISSUE_LINK: { value: "new", "until 2026-11-08T09:00:00Z": "old" } }, now)).toEqual([]);
    expect(findTimedValueProblems({ REPORT_ISSUE_LINK: { value: "new", "until 2026-11-08T09:00:00+00:00": "old" } }, now)).toEqual([]);
  });

  test("flags a moment in the past", () => {
    const problems = findTimedValueProblems({ REPORT_ISSUE_LINK: { value: "new", "until 2026-09-01T09:00:00+01:00": "old" } }, now);

    expect(problems).toEqual([expect.stringMatching(/is in the past/)]);
  });

  test("flags a UTC offset written against a BST moment", () => {
    const problems = findTimedValueProblems({ REPORT_ISSUE_LINK: { value: "new", "until 2026-10-08T09:00:00Z": "old" } }, now);

    expect(problems).toEqual([expect.stringMatching(/UK is on \+01:00 then, not \+00:00/)]);
  });

  test("flags a BST offset written against a GMT moment", () => {
    const problems = findTimedValueProblems({ REPORT_ISSUE_LINK: { value: "new", "until 2026-11-08T09:00:00+01:00": "old" } }, now);

    expect(problems).toEqual([expect.stringMatching(/UK is on \+00:00 then, not \+01:00/)]);
  });

  test("flags settings that tooling reads straight from the file", () => {
    const problems = findTimedValueProblems({ OS_HANDOVER_URL: { value: "new", [`until ${SWITCH}`]: "old" } }, now);

    expect(problems).toEqual([expect.stringMatching(/OS_HANDOVER_URL: cannot be a timed value/)]);
  });

  test("reports malformed timed values rather than throwing", () => {
    expect(findTimedValueProblems({ X: { [`until ${SWITCH}`]: "old" } }, now)).toEqual([expect.stringMatching(/no "value"/)]);
  });
});

describe("transformAndValidateConfig with timed values", () => {
  const prodConfig = JSON.parse(readFileSync(join(__dirname, "../../../configuration/config.prod.json"), "utf8"));
  const timedConfig = {
    ...prodConfig,
    REPORT_ISSUE_LINK: { value: "https://new.example/report", [`until ${SWITCH}`]: "https://old.example/report" },
  };

  test("resolves against the given moment", () => {
    const before = transformAndValidateConfig(timedConfig, "config.prod.json", JUST_BEFORE);
    const after = transformAndValidateConfig(timedConfig, "config.prod.json", AT_SWITCH);

    expect(before.success && before.config.REPORT_ISSUE_LINK).toBe("https://old.example/report");
    expect(after.success && after.config.REPORT_ISSUE_LINK).toBe("https://new.example/report");
  });

  test("only the step in force is schema-validated, which is why validate.ts checks every moment", () => {
    const brokenFuture = { ...prodConfig, SHOW_NOTIFICATIONS: { value: "yes please", [`until ${SWITCH}`]: false } };

    expect(transformAndValidateConfig(brokenFuture, "config.prod.json", JUST_BEFORE).success).toBe(true);
    expect(transformAndValidateConfig(brokenFuture, "config.prod.json", AT_SWITCH).success).toBe(false);
  });

  test("a malformed timed value is a validation failure, not a throw", () => {
    const malformed = { ...prodConfig, SHOW_NOTIFICATIONS: { [`until ${SWITCH}`]: false } };

    const result = transformAndValidateConfig(malformed, "config.prod.json", AT_SWITCH);

    expect(result.success === false && result.errorMsg).toMatch(/no "value"/);
  });
});
