import { mapLinkConfig } from "./map-link-config";
import { Link } from "cps-global-configuration";

describe("mapLinkConfig", () => {
  const basicLink: Link = {
    label: "Test Link",
    href: "/test",
    level: 1,
    visibleContexts: "all",
    activeContexts: "test",
    openInNewTab: false,
    dcfContextsToUseEventNavigation: { contexts: "event", data: "" },
  };

  it("should map basic link properties", () => {
    const mapper = mapLinkConfig({ contextIds: "test", tags: {} });
    const result = mapper(basicLink);

    expect(result).toEqual({
      label: "Test Link",
      level: 1,
      openInNewTab: false,
      href: "/test",
      selected: true,
      dcfContextsToUseEventNavigation: undefined,
    });
  });

  it("should determine selected based on context match", () => {
    const mapper1 = mapLinkConfig({ contextIds: "test admin", tags: {} });
    const mapper2 = mapLinkConfig({ contextIds: "user guest", tags: {} });

    expect(mapper1(basicLink).selected).toBe(true);
    expect(mapper2(basicLink).selected).toBe(false);
  });

  it("should determine dcfContextsToUseEventNavigation based on context match", () => {
    const mapper1 = mapLinkConfig({ contextIds: "event user", tags: {} });
    const mapper2 = mapLinkConfig({ contextIds: "admin test", tags: {} });

    expect(mapper1(basicLink).dcfContextsToUseEventNavigation).toEqual({ contexts: "event", data: "" });
    expect(mapper2(basicLink).dcfContextsToUseEventNavigation).toBeUndefined();
  });

  it("should replace tags in href", () => {
    const linkWithTags: Link = {
      ...basicLink,
      href: "/users/{userId}/posts/{postId}",
    };

    const mapper = mapLinkConfig({ contextIds: "test", tags: { userId: "123", postId: "456" } });
    const result = mapper(linkWithTags);

    expect(result.href).toBe("/users/123/posts/456");
  });

  it("should handle multiple tags in href", () => {
    const linkWithTags: Link = {
      ...basicLink,
      href: "/{section}/{subsection}/{id}?type={type}",
    };

    const mapper = mapLinkConfig({
      contextIds: "test",
      tags: {
        section: "admin",
        subsection: "users",
        id: "789",
        type: "detail",
      },
    });
    const result = mapper(linkWithTags);

    expect(result.href).toBe("/admin/users/789?type=detail");
  });

  it("should handle missing tags gracefully", () => {
    const linkWithTags: Link = {
      ...basicLink,
      href: "/users/{userId}/posts/{postId}",
    };

    const mapper = mapLinkConfig({ contextIds: "test", tags: { userId: "123" } });
    const result = mapper(linkWithTags);

    expect(result.href).toBe("/users/123/posts/{postId}");
  });

  it("should handle openInNewTab property", () => {
    const linkNewTab: Link = {
      ...basicLink,
      openInNewTab: true,
    };

    const mapper = mapLinkConfig({ contextIds: "test", tags: {} });
    const result = mapper(linkNewTab);

    expect(result.openInNewTab).toBe(true);
  });

  it("should handle undefined dcfContextsToUseEventNavigation", () => {
    const linkNoEvent: Link = {
      ...basicLink,
      dcfContextsToUseEventNavigation: undefined,
    };

    const mapper = mapLinkConfig({ contextIds: "event", tags: {} });
    const result = mapper(linkNoEvent);

    expect(result.dcfContextsToUseEventNavigation).toBeUndefined();
  });

  it("should handle complex context matching", () => {
    const complexLink: Link = {
      ...basicLink,
      activeContexts: "admin user moderator",
      dcfContextsToUseEventNavigation: { contexts: "event-admin event-user", data: "" },
    };

    const mapper1 = mapLinkConfig({ contextIds: "user guest", tags: {} });
    const result1 = mapper1(complexLink);
    expect(result1.selected).toBe(true);
    expect(result1.dcfContextsToUseEventNavigation).toBeUndefined();

    const mapper2 = mapLinkConfig({ contextIds: "event-admin test", tags: {} });
    const result2 = mapper2(complexLink);
    expect(result2.selected).toBe(false);
    expect(result2.dcfContextsToUseEventNavigation).toEqual({ contexts: "event-admin event-user", data: "" });
  });

  it("should preserve label exactly as provided", () => {
    const linkWithSpecialLabel: Link = {
      ...basicLink,
      label: "  Special Label with Spaces  ",
    };

    const mapper = mapLinkConfig({ contextIds: "test", tags: {} });
    const result = mapper(linkWithSpecialLabel);

    expect(result.label).toBe("  Special Label with Spaces  ");
  });

  it("should handle empty tags object", () => {
    const linkWithTags: Link = {
      ...basicLink,
      href: "/test/{tag1}/{tag2}",
    };

    const mapper = mapLinkConfig({ contextIds: "test", tags: {} });
    const result = mapper(linkWithTags);

    expect(result.href).toBe("/test/{tag1}/{tag2}");
  });

  it("should handle repeated tags in href", () => {
    const linkWithRepeatedTags: Link = {
      ...basicLink,
      href: "/{id}/edit/{id}/confirm/{id}",
    };

    const mapper = mapLinkConfig({ contextIds: "test", tags: { id: "999" } });
    const result = mapper(linkWithRepeatedTags);

    expect(result.href).toBe("/999/edit/999/confirm/999");
  });

  it("should handle all properties together", () => {
    const fullLink: Link = {
      label: "Full Featured Link",
      href: "/app/{appId}/section/{sectionId}",
      level: 2,
      visibleContexts: "app",
      activeContexts: "app-section section-detail",
      openInNewTab: true,
      dcfContextsToUseEventNavigation: { contexts: "app-event section-event", data: "" },
    };

    const mapper = mapLinkConfig({ contextIds: "app-section app-event", tags: { appId: "myapp", sectionId: "mysection" } });
    const result = mapper(fullLink);

    expect(result).toEqual({
      label: "Full Featured Link",
      level: 2,
      openInNewTab: true,
      href: "/app/myapp/section/mysection",
      selected: true,
      dcfContextsToUseEventNavigation: { contexts: "app-event section-event", data: "" },
    });
  });
});
