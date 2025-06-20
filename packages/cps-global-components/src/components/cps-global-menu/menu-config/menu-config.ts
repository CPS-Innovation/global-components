import { Config } from "cps-global-configuration";
import { findContext } from "./helpers/context/find-context";
import { shouldShowLink } from "./helpers/should-show-link";
import { mapLinkConfig } from "./helpers/map-link-config";
import { GroupedLink, groupLinksByLevel } from "./helpers/group-links-by-level";
import { getDomTags } from "./helpers/dom/tags";

export type MenuHelperResult = {
  found: boolean;
  links: GroupedLink[][];
};

export const menuConfig = ({ LINKS, CONTEXTS }: Config, window: Window): MenuHelperResult => {
  const foundContext = findContext(CONTEXTS, window);
  if (!foundContext.found) {
    return { found: false, links: undefined };
  }
  const { found, contexts, tags } = foundContext;

  const tagsFromDom = getDomTags();

  const links = LINKS.filter(shouldShowLink(contexts)).map(mapLinkConfig(contexts, { ...tags, ...tagsFromDom }));
  return { found, links: groupLinksByLevel(links) };
};
