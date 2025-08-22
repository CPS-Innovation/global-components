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
    return { links: [] };
  }
  const { contexts, tags } = foundContext;

  const handoverAdapter = isOutSystems
    ? undefined
    : // If we are outside of OutSystems and a link is pointing to OutSystems then we need to go
      //  via the auth handover endpoint to ensure OS has CMS auth
      (targetUrl: string) => {
        const shouldGoViaAuthHandover = isOutSystemsApp({ location: { href: targetUrl } }) && OS_HANDOVER_URL;
        return shouldGoViaAuthHandover ? createOutboundUrl({ handoverUrl: OS_HANDOVER_URL, targetUrl }) : targetUrl;
      };
  const links = LINKS.filter(shouldShowLink(contexts)).map(mapLinkConfig({ contexts, tags: { ...tags, ...tagsFromDom }, handoverAdapter }));
  return { links: groupLinksByLevel(links) };
};
