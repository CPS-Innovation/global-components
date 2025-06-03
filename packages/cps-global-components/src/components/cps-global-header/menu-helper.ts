import { Config, Link } from "cps-global-configuration";
import { Context } from "cps-global-configuration/dist/schema";

const buildSortedFullPath = ({ origin, pathname, hash, search }: Location) => {
  const params = new URLSearchParams(search);
  const sortedParams = new URLSearchParams([...params.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  return origin + pathname + (sortedParams.toString() ? `?${sortedParams.toString()}` : "") + hash;
};

const findContextInfo = (contextArr: Context[], address: string) => {
  for (const { paths, contexts } of contextArr) {
    for (const path of paths) {
      const match = address.match(path);
      if (match) {
        return { contexts, tags: match.groups || {} };
      }
    }
  }
};

const shouldShowLink =
  (contexts: string) =>
  ({ visibleContexts }: Link) =>
    !visibleContexts || isContextMatch(contexts, visibleContexts);

const isContextMatch = (contextStringA: string, contextStringB: string) => contextStringA.split(" ").some(contextValue => contextStringB.split(" ").includes(contextValue));

const replaceTagsInString = (source: string, tags: { [key: string]: string }) =>
  Object.keys(tags).reduce((acc, curr) => acc.replace(new RegExp(`{${curr}}`, "g"), tags[curr]), source);

const mapLink =
  (contexts: string, tags: { [key: string]: string }) =>
  ({ label, href, level, activeContexts, openInNewTab }: Link) => ({
    label,
    level,
    openInNewTab,
    href: replaceTagsInString(href, tags),
    isActive: isContextMatch(contexts, activeContexts),
  });

const groupByLevel = (links: ReturnType<ReturnType<typeof mapLink>>[]) => {
  const result = [];

  for (const { level, ...rest } of links) {
    if (!result[level]) {
      result[level] = [];
    }
    result[level].push({ ...rest });
  }

  return result;
};

export const menuHelper = ({ LINKS, CONTEXTS }: Config, { location }: Window) => {
  const sanitizedPath = buildSortedFullPath(location);
  const { contexts, tags } = findContextInfo(CONTEXTS, sanitizedPath);

  const links = LINKS.filter(shouldShowLink(contexts)).map(mapLink(contexts, tags));
  return groupByLevel(links);
};
