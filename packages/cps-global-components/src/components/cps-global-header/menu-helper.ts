import { Config, Link } from "cps-global-configuration";
import { Context } from "cps-global-configuration/dist/schema";

const buildSanitizedAddress = ({ origin, pathname, hash, search }: Location) => {
  const params = new URLSearchParams(search);
  const sortedParams = new URLSearchParams([...params.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  return origin + pathname + (sortedParams.toString() ? `?${sortedParams.toString()}` : "") + hash;
};

type FindContextResult =
  | {
      found: true;
      contexts: string;
      tags: {
        [key: string]: string;
      };
    }
  | { found: false; contexts?: undefined; tags?: undefined };

const findContext = (contextArr: Context[], address: string): FindContextResult => {
  for (const { paths, contexts } of contextArr) {
    for (const path of paths) {
      const match = address.match(path);
      if (match) {
        return { found: true, contexts, tags: match.groups || {} };
      }
    }
  }
  return { found: false };
};

const shouldShowLink =
  (contexts: string) =>
  ({ visibleContexts }: Link) =>
    !visibleContexts || isContextMatch(contexts, visibleContexts);

const isContextMatch = (contextStringA: string, contextStringB: string) => contextStringA.split(" ").some(contextValue => contextStringB.split(" ").includes(contextValue));

const replaceTagsInString = (source: string, tags: { [key: string]: string }) =>
  Object.keys(tags).reduce((acc, curr) => acc.replace(new RegExp(`{${curr}}`, "g"), tags[curr]), source);

type MapLinkResult = ReturnType<ReturnType<typeof mapLink>>;

const mapLink =
  (contexts: string, tags: { [key: string]: string }) =>
  ({ label, href, level, activeContexts, openInNewTab }: Link) => ({
    label,
    level,
    openInNewTab,
    href: replaceTagsInString(href, tags),
    selected: isContextMatch(contexts, activeContexts),
  });

export type ResolvedLink = Omit<MapLinkResult, "level">;

const groupByLevel = (links: MapLinkResult[]): ResolvedLink[][] => {
  const result = [];

  for (const { level, ...rest } of links) {
    if (!result[level]) {
      result[level] = [];
    }
    result[level].push({ ...rest });
  }

  return result;
};

export type MenuHelperResult =
  | {
      found: true;
      links: ResolvedLink[][];
    }
  | { found: false; links?: undefined };

export const menuHelper = ({ LINKS, CONTEXTS }: Config, { location }: Window): MenuHelperResult => {
  const sanitizedAddress = buildSanitizedAddress(location);
  const { found, contexts, tags } = findContext(CONTEXTS, sanitizedAddress);
  if (!found) {
    return { found: false, links: undefined };
  }
  const links = LINKS.filter(shouldShowLink(contexts)).map(mapLink(contexts, tags));
  return { found: true, links: groupByLevel(links) };
};
