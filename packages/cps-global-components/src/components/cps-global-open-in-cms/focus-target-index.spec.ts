import { focusTargetIndex } from "./focus-target-index";

describe("focusTargetIndex", () => {
  it.each([
    // target, current (-1 = the trigger), count, expected
    ["first", 1, 2, 0],
    ["last", 0, 2, 1],
    ["next", -1, 2, 0],
    ["next", 0, 2, 1],
    ["next", 1, 2, 0],
    ["previous", 1, 2, 0],
    ["previous", 0, 2, 1],
    ["previous", -1, 2, 1],
  ] as const)("%s from %i of %i is %i", (target, current, count, expected) => {
    expect(focusTargetIndex(target, current, count)).toBe(expected);
  });
});
