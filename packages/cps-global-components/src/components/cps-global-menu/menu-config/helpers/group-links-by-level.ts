import { MapLinkConfigResult } from "./map-link-config";

export type GroupedLink = Omit<MapLinkConfigResult, "level"> & { ariaSelected?: true };

export const groupLinksByLevel = (links: MapLinkConfigResult[]): GroupedLink[][] => {
  const highestSelectedLevel = Math.max(...links.filter(({ selected }) => selected).map(({ level }) => level));
  const result: GroupedLink[][] = [];

  for (const { level, ...rest } of links) {
    if (!result[level]) {
      result[level] = [];
    }
    result[level].push({ ...rest, ariaSelected: level === highestSelectedLevel && rest.selected ? true : undefined });
  }

  return result;
};
