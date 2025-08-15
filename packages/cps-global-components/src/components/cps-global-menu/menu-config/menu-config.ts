import { Config } from "cps-global-configuration";
import { findContext } from "../../../services/config/context/find-context";
import { shouldShowLink } from "./helpers/should-show-link";
import { mapLinkConfig } from "./helpers/map-link-config";
import { GroupedLink, groupLinksByLevel } from "./helpers/group-links-by-level";
import { getDomTags } from "./helpers/dom/tags";
import { isOutSystemsApp } from "../../../utils/is-outsystems-app";
import { createOutboundUrl } from "cps-global-os-handover";

export type MenuConfigResult = {
  found: boolean;
  links: GroupedLink[][];
};

export const menuConfig = ({ LINKS, CONTEXTS, OS_HANDOVER_URL }: Config, window: Window): MenuConfigResult => {
  const foundContext = findContext(CONTEXTS, window);
  if (!foundContext.found) {
    return { found: false, links: undefined };
  }
  const { found, contexts, tags } = foundContext;

  const tagsFromDom = getDomTags();
  const handoverAdapter =
    !isOutSystemsApp(window.location.origin) && ((targetUrl: string) => (isOutSystemsApp(targetUrl) ? createOutboundUrl({ handoverUrl: OS_HANDOVER_URL, targetUrl }) : targetUrl));

  const links = LINKS.filter(shouldShowLink(contexts)).map(mapLinkConfig({ contexts, tags: { ...tags, ...tagsFromDom }, handoverAdapter }));
  return { found, links: groupLinksByLevel(links) };
};
