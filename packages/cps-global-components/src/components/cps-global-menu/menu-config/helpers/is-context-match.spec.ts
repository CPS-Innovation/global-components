import { isContextMatch } from "./is-context-match";

describe("isContextMatch", () => {
  it("should return true when contexts match exactly", () => {
    expect(isContextMatch("admin", "admin")).toBe(true);
    expect(isContextMatch("user", "user")).toBe(true);
  });

  it("should return false when contexts don't match", () => {
    expect(isContextMatch("admin", "user")).toBe(false);
    expect(isContextMatch("user", "admin")).toBe(false);
  });

  it("should return true when any context in first string matches any in second", () => {
    expect(isContextMatch("admin user", "user")).toBe(true);
    expect(isContextMatch("admin", "user admin")).toBe(true);
    expect(isContextMatch("admin user guest", "guest")).toBe(true);
  });

  it("should return false when no contexts match", () => {
    expect(isContextMatch("admin user", "guest visitor")).toBe(false);
    expect(isContextMatch("one two three", "four five six")).toBe(false);
  });

  it("should handle empty strings", () => {
    expect(isContextMatch("", "")).toBe(true); // Empty string split results in [""], and [""].includes("") is true
    expect(isContextMatch("admin", "")).toBe(false);
    expect(isContextMatch("", "admin")).toBe(false);
  });

  it("should handle undefined values", () => {
    expect(isContextMatch(undefined, "admin")).toBe(false);
    expect(isContextMatch("admin", undefined)).toBe(false);
    expect(isContextMatch(undefined, undefined)).toBe(true); // Both default to "", same as empty strings
  });

  it("should handle multiple spaces between contexts", () => {
    expect(isContextMatch("admin  user", "user")).toBe(true);
    expect(isContextMatch("admin", "user  admin")).toBe(true);
    expect(isContextMatch("admin   user   guest", "guest")).toBe(true);
  });

  it("should handle leading and trailing spaces", () => {
    expect(isContextMatch(" admin user ", "user")).toBe(true);
    expect(isContextMatch("admin", " user admin ")).toBe(true);
    expect(isContextMatch(" admin ", " admin ")).toBe(true);
  });

  it("should be case sensitive", () => {
    expect(isContextMatch("Admin", "admin")).toBe(false);
    expect(isContextMatch("USER", "user")).toBe(false);
    expect(isContextMatch("ADMIN", "ADMIN")).toBe(true);
  });

  it("should handle complex context combinations", () => {
    expect(isContextMatch("page-edit page-view admin", "page-view user")).toBe(true);
    expect(isContextMatch("role-1 role-2 role-3", "role-2 role-4")).toBe(true);
    expect(isContextMatch("context-a context-b", "context-b context-c context-d")).toBe(true);
  });

  it("should handle single word contexts", () => {
    expect(isContextMatch("single", "single")).toBe(true);
    expect(isContextMatch("single", "different")).toBe(false);
  });

  it("should handle repeated contexts", () => {
    expect(isContextMatch("admin admin admin", "admin")).toBe(true);
    expect(isContextMatch("admin", "admin admin admin")).toBe(true);
    expect(isContextMatch("user user admin admin", "admin user")).toBe(true);
  });

  it("should handle partial word matches correctly", () => {
    expect(isContextMatch("administrator", "admin")).toBe(false);
    expect(isContextMatch("admin", "administrator")).toBe(false);
    expect(isContextMatch("superuser", "user")).toBe(false);
  });

  it("should handle special characters in contexts", () => {
    expect(isContextMatch("role-admin", "role-admin")).toBe(true);
    expect(isContextMatch("user_123", "user_123")).toBe(true);
    expect(isContextMatch("context.name", "context.name")).toBe(true);
    expect(isContextMatch("role-admin user_123", "user_123")).toBe(true);
  });
});