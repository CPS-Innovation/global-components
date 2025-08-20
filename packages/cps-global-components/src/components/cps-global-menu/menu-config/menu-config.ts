import { Config } from "cps-global-configuration";
import { FoundContext } from "../../../services/context/find-context";
import { shouldShowLink } from "./helpers/should-show-link";
import { mapLinkConfig } from "./helpers/map-link-config";
import { GroupedLink, groupLinksByLevel } from "./helpers/group-links-by-level";
import { isOutSystemsApp } from "../../../utils/is-outsystems-app";
import { createOutboundUrl } from "cps-global-os-handover";
import { Flags, Tags } from "../../../store/store";

export type MenuConfigResult = {
  links: GroupedLink[][];
};

export const menuConfig = (foundContext: FoundContext, { LINKS, OS_HANDOVER_URL }: Config, { isOutSystems }: Flags, tagsFromDom: Tags): MenuConfigResult => {
  if (!foundContext.found) {
    return { links: undefined };
  }
  const { contexts, tags } = foundContext;
  const handoverAdapter =
    !isOutSystems && ((targetUrl: string) => (isOutSystemsApp({ location: { href: targetUrl } }) ? createOutboundUrl({ handoverUrl: OS_HANDOVER_URL, targetUrl }) : targetUrl));

  const links = LINKS.filter(shouldShowLink(contexts)).map(mapLinkConfig({ contexts, tags: { ...tags, ...tagsFromDom }, handoverAdapter }));
  return { links: groupLinksByLevel(links) };
};
