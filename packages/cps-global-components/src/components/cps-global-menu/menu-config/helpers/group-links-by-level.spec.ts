import { groupLinksByLevel, GroupedLink } from "./group-links-by-level";
import { MapLinkConfigResult } from "./map-link-config";

describe("groupLinksByLevel", () => {
  it("should handle empty array", () => {
    const links: MapLinkConfigResult[] = [];
    const result = groupLinksByLevel(links);
    expect(result).toEqual([]);
  });

  it("should group links by level", () => {
    const links: MapLinkConfigResult[] = [
      { label: "Link 1", level: 0, href: "/link1", selected: false, openInNewTab: false, preferEventNavigation: false },
      { label: "Link 2", level: 1, href: "/link2", selected: false, openInNewTab: false, preferEventNavigation: false },
      { label: "Link 3", level: 0, href: "/link3", selected: false, openInNewTab: false, preferEventNavigation: false },
      { label: "Link 4", level: 1, href: "/link4", selected: false, openInNewTab: false, preferEventNavigation: false },
    ];

    const result = groupLinksByLevel(links);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(2);
    expect(result[1]).toHaveLength(2);
    expect(result[0][0].label).toBe("Link 1");
    expect(result[0][1].label).toBe("Link 3");
    expect(result[1][0].label).toBe("Link 2");
    expect(result[1][1].label).toBe("Link 4");
  });

  it("should add ariaSelected to links at the highest selected level", () => {
    const links: MapLinkConfigResult[] = [
      { label: "Link 1", level: 0, href: "/link1", selected: true, openInNewTab: false, preferEventNavigation: false },
      { label: "Link 2", level: 1, href: "/link2", selected: true, openInNewTab: false, preferEventNavigation: false },
      { label: "Link 3", level: 2, href: "/link3", selected: true, openInNewTab: false, preferEventNavigation: false },
      { label: "Link 4", level: 2, href: "/link4", selected: false, openInNewTab: false, preferEventNavigation: false },
    ];

    const result = groupLinksByLevel(links);
    expect(result[0][0].ariaSelected).toBeUndefined();
    expect(result[1][0].ariaSelected).toBeUndefined();
    expect(result[2][0].ariaSelected).toBe(true);
    expect(result[2][1].ariaSelected).toBeUndefined();
  });

  it("should handle sparse levels", () => {
    const links: MapLinkConfigResult[] = [
      { label: "Link 1", level: 0, href: "/link1", selected: false, openInNewTab: false, preferEventNavigation: false },
      { label: "Link 2", level: 3, href: "/link2", selected: false, openInNewTab: false, preferEventNavigation: false },
      { label: "Link 3", level: 5, href: "/link3", selected: false, openInNewTab: false, preferEventNavigation: false },
    ];

    const result = groupLinksByLevel(links);
    expect(result).toHaveLength(6);
    expect(result[0]).toHaveLength(1);
    expect(result[1]).toBeUndefined();
    expect(result[2]).toBeUndefined();
    expect(result[3]).toHaveLength(1);
    expect(result[4]).toBeUndefined();
    expect(result[5]).toHaveLength(1);
  });

  it("should handle all links at same level", () => {
    const links: MapLinkConfigResult[] = [
      { label: "Link 1", level: 1, href: "/link1", selected: false, openInNewTab: false, preferEventNavigation: false },
      { label: "Link 2", level: 1, href: "/link2", selected: true, openInNewTab: false, preferEventNavigation: false },
      { label: "Link 3", level: 1, href: "/link3", selected: false, openInNewTab: false, preferEventNavigation: false },
    ];

    const result = groupLinksByLevel(links);
    expect(result).toHaveLength(2);
    expect(result[0]).toBeUndefined();
    expect(result[1]).toHaveLength(3);
    expect(result[1][1].ariaSelected).toBe(true);
  });

  it("should preserve all link properties except level", () => {
    const links: MapLinkConfigResult[] = [
      {
        label: "Test Link",
        level: 0,
        href: "/test",
        selected: true,
        openInNewTab: true,
        preferEventNavigation: "private",
      },
    ];

    const result = groupLinksByLevel(links);
    const groupedLink: GroupedLink = result[0][0];

    expect(groupedLink.label).toBe("Test Link");
    expect(groupedLink.href).toBe("/test");
    expect(groupedLink.selected).toBe(true);
    expect(groupedLink.openInNewTab).toBe(true);
    expect(groupedLink.preferEventNavigation).toBe("private");
    expect(groupedLink.ariaSelected).toBe(true);
    expect("level" in groupedLink).toBe(false);
  });

  it("should handle multiple selected links at different levels", () => {
    const links: MapLinkConfigResult[] = [
      { label: "Link 1", level: 0, href: "/link1", selected: true, openInNewTab: false, preferEventNavigation: false },
      { label: "Link 2", level: 1, href: "/link2", selected: true, openInNewTab: false, preferEventNavigation: false },
      { label: "Link 3", level: 2, href: "/link3", selected: false, openInNewTab: false, preferEventNavigation: false },
    ];

    const result = groupLinksByLevel(links);
    expect(result[0][0].ariaSelected).toBeUndefined();
    expect(result[1][0].ariaSelected).toBe(true);
    expect(result[2][0].ariaSelected).toBeUndefined();
  });

  it("should handle no selected links", () => {
    const links: MapLinkConfigResult[] = [
      { label: "Link 1", level: 0, href: "/link1", selected: false, openInNewTab: false, preferEventNavigation: false },
      { label: "Link 2", level: 1, href: "/link2", selected: false, openInNewTab: false, preferEventNavigation: false },
    ];

    const result = groupLinksByLevel(links);
    expect(result[0][0].ariaSelected).toBeUndefined();
    expect(result[1][0].ariaSelected).toBeUndefined();
  });

  it("should maintain order of links within each level", () => {
    const links: MapLinkConfigResult[] = [
      { label: "B", level: 0, href: "/b", selected: false, openInNewTab: false, preferEventNavigation: false },
      { label: "A", level: 0, href: "/a", selected: false, openInNewTab: false, preferEventNavigation: false },
      { label: "D", level: 0, href: "/d", selected: false, openInNewTab: false, preferEventNavigation: false },
      { label: "C", level: 0, href: "/c", selected: false, openInNewTab: false, preferEventNavigation: false },
    ];

    const result = groupLinksByLevel(links);
    expect(result[0].map(link => link.label)).toEqual(["B", "A", "D", "C"]);
  });
});
