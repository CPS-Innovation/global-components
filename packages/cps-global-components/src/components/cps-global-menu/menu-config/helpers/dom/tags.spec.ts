import { cacheDomTags, resetDomTags, getDomTags } from "./tags";

describe("tags", () => {
  beforeEach(() => {
    resetDomTags();
  });

  describe("cacheDomTags", () => {
    it("should cache tags when called for the first time", () => {
      const tags = { userId: "123", sessionId: "abc" };
      cacheDomTags(tags);

      expect(getDomTags()).toEqual(tags);
    });

    it("should merge new tags with existing cached tags", () => {
      const initialTags = { userId: "123", sessionId: "abc" };
      const newTags = { roleId: "456", sessionId: "xyz" };

      cacheDomTags(initialTags);
      cacheDomTags(newTags);

      expect(getDomTags()).toEqual({
        userId: "123",
        sessionId: "xyz",
        roleId: "456",
      });
    });

    it("should handle empty tag objects", () => {
      const tags = { userId: "123" };
      cacheDomTags(tags);
      cacheDomTags({});

      expect(getDomTags()).toEqual(tags);
    });
  });

  describe("resetDomTags", () => {
    it("should reset cached tags to undefined", () => {
      const tags = { userId: "123", sessionId: "abc" };
      cacheDomTags(tags);

      resetDomTags();

      expect(getDomTags()).toBeUndefined();
    });

    it("should work correctly when called multiple times", () => {
      resetDomTags();
      resetDomTags();

      expect(getDomTags()).toBeUndefined();
    });
  });

  describe("getDomTags", () => {
    it("should return undefined when no tags have been cached", () => {
      expect(getDomTags()).toBeUndefined();
    });

    it("should return cached tags", () => {
      const tags = { userId: "123", sessionId: "abc" };
      cacheDomTags(tags);

      expect(getDomTags()).toEqual(tags);
    });

    it("should return the same reference to cached tags", () => {
      const tags = { userId: "123" };
      cacheDomTags(tags);

      const result1 = getDomTags();
      const result2 = getDomTags();

      expect(result1).toBe(result2);
    });
  });

  describe("integration", () => {
    it("should handle a full cache lifecycle", () => {
      expect(getDomTags()).toBeUndefined();

      cacheDomTags({ step: "1" });
      expect(getDomTags()).toEqual({ step: "1" });

      cacheDomTags({ step: "2", additional: "data" });
      expect(getDomTags()).toEqual({ step: "2", additional: "data" });

      resetDomTags();
      expect(getDomTags()).toBeUndefined();

      cacheDomTags({ fresh: "start" });
      expect(getDomTags()).toEqual({ fresh: "start" });
    });
  });
});
