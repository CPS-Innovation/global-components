import { isContextMatch } from "./is-context-match";

describe("isContextMatch", () => {
  it("should return true when contextId matches a single target context", () => {
    expect(isContextMatch("admin", "admin")).toBe(true);
    expect(isContextMatch("user", "user")).toBe(true);
  });

  it("should return false when contextId does not match", () => {
    expect(isContextMatch("admin", "user")).toBe(false);
    expect(isContextMatch("user", "admin")).toBe(false);
  });

  it("should return true when contextId is in the space-delimited target list", () => {
    expect(isContextMatch("user", "admin user guest")).toBe(true);
    expect(isContextMatch("admin", "admin user")).toBe(true);
    expect(isContextMatch("guest", "admin user guest")).toBe(true);
  });

  it("should return false when contextId is not in the target list", () => {
    expect(isContextMatch("visitor", "admin user guest")).toBe(false);
    expect(isContextMatch("superuser", "admin user")).toBe(false);
  });

  it("should handle empty strings", () => {
    expect(isContextMatch("", "")).toBe(true); // Empty string is in [""]
    expect(isContextMatch("admin", "")).toBe(false);
    expect(isContextMatch("", "admin")).toBe(false);
  });

  it("should handle undefined values", () => {
    expect(isContextMatch(undefined, "admin")).toBe(false);
    expect(isContextMatch("admin", undefined)).toBe(false);
    expect(isContextMatch(undefined, undefined)).toBe(true); // Both default to ""
  });

  it("should be case sensitive", () => {
    expect(isContextMatch("Admin", "admin")).toBe(false);
    expect(isContextMatch("USER", "user")).toBe(false);
    expect(isContextMatch("ADMIN", "ADMIN")).toBe(true);
  });

  it("should handle partial word matches correctly (no partial matching)", () => {
    expect(isContextMatch("admin", "administrator")).toBe(false);
    expect(isContextMatch("user", "superuser")).toBe(false);
  });

  it("should handle special characters in contexts", () => {
    expect(isContextMatch("role-admin", "role-admin")).toBe(true);
    expect(isContextMatch("user_123", "admin user_123 guest")).toBe(true);
    expect(isContextMatch("context.name", "context.name")).toBe(true);
  });

  it("should handle repeated contexts in target list", () => {
    expect(isContextMatch("admin", "admin admin admin")).toBe(true);
    expect(isContextMatch("user", "admin user admin user")).toBe(true);
  });
});
