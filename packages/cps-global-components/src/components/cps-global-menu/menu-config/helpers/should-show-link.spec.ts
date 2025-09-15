import { shouldShowLink } from "./should-show-link";
import { Link } from "cps-global-configuration";

describe("shouldShowLink", () => {
  const baseLink: Omit<Link, "visibleContexts"> = {
    label: "Test Link",
    href: "/test",
    level: 1,
    activeContexts: "test",
    openInNewTab: false,
    preferEventNavigationContexts: "event",
  };

  it("should return true when context matches visibleContexts", () => {
    const link: Link = {
      ...baseLink,
      visibleContexts: "admin user",
    };

    const filter1 = shouldShowLink("admin");
    const filter2 = shouldShowLink("user");
    const filter3 = shouldShowLink("admin user");

    expect(filter1(link)).toBe(true);
    expect(filter2(link)).toBe(true);
    expect(filter3(link)).toBe(true);
  });

  it("should return false when context does not match visibleContexts", () => {
    const link: Link = {
      ...baseLink,
      visibleContexts: "admin user",
    };

    const filter1 = shouldShowLink("guest");
    const filter2 = shouldShowLink("visitor");

    expect(filter1(link)).toBe(false);
    expect(filter2(link)).toBe(false);
  });

  it("should handle multiple contexts in current context", () => {
    const link: Link = {
      ...baseLink,
      visibleContexts: "admin",
    };

    const filter = shouldShowLink("user admin guest");
    expect(filter(link)).toBe(true);
  });

  it("should handle multiple contexts in visibleContexts", () => {
    const link: Link = {
      ...baseLink,
      visibleContexts: "admin user moderator",
    };

    const filter1 = shouldShowLink("guest user");
    const filter2 = shouldShowLink("visitor guest");

    expect(filter1(link)).toBe(true);
    expect(filter2(link)).toBe(false);
  });

  it("should be case sensitive", () => {
    const link: Link = {
      ...baseLink,
      visibleContexts: "Admin",
    };

    const filter1 = shouldShowLink("admin");
    const filter2 = shouldShowLink("Admin");

    expect(filter1(link)).toBe(false);
    expect(filter2(link)).toBe(true);
  });

  it("should handle complex context matching", () => {
    const link: Link = {
      ...baseLink,
      visibleContexts: "role-admin role-user page-edit",
    };

    const filter1 = shouldShowLink("role-admin");
    const filter2 = shouldShowLink("page-edit role-guest");
    const filter3 = shouldShowLink("role-guest page-view");

    expect(filter1(link)).toBe(true);
    expect(filter2(link)).toBe(true);
    expect(filter3(link)).toBe(false);
  });

  it("should create reusable filter function", () => {
    const link1: Link = {
      ...baseLink,
      visibleContexts: "admin",
    };

    const link2: Link = {
      ...baseLink,
      visibleContexts: "user",
    };

    const filter = shouldShowLink("admin");

    expect(filter(link1)).toBe(true);
    expect(filter(link2)).toBe(false);
  });

  it("should work with array filter method", () => {
    const links: Link[] = [
      { ...baseLink, visibleContexts: "admin" },
      { ...baseLink, visibleContexts: "user" },
      { ...baseLink, visibleContexts: "admin user" },
      { ...baseLink, visibleContexts: "guest" },
    ];

    const filtered = links.filter(shouldShowLink("user"));

    expect(filtered).toHaveLength(2);
    expect(filtered[0].visibleContexts).toBe("user");
    expect(filtered[1].visibleContexts).toBe("admin user");
  });

  it("should handle empty current context", () => {
    const link: Link = {
      ...baseLink,
      visibleContexts: "admin",
    };

    const filter = shouldShowLink("");
    expect(filter(link)).toBe(false);
  });

  it("should handle whitespace in contexts", () => {
    const link: Link = {
      ...baseLink,
      visibleContexts: "  admin  user  ",
    };

    const filter = shouldShowLink("  user  ");
    expect(filter(link)).toBe(true);
  });

  it("should not match partial context names", () => {
    const link: Link = {
      ...baseLink,
      visibleContexts: "administrator",
    };

    const filter = shouldShowLink("admin");
    expect(filter(link)).toBe(false);
  });

  it("should handle special characters in contexts", () => {
    const link: Link = {
      ...baseLink,
      visibleContexts: "role-admin user_123 context.name",
    };

    const filter1 = shouldShowLink("role-admin");
    const filter2 = shouldShowLink("user_123");
    const filter3 = shouldShowLink("context.name");

    expect(filter1(link)).toBe(true);
    expect(filter2(link)).toBe(true);
    expect(filter3(link)).toBe(true);
  });
});
