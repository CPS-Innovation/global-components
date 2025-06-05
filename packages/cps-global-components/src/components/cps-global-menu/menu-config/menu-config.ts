import { Config } from "cps-global-configuration";
import { buildSanitizedAddress } from "./helpers/build-sanitized-address";
import { findContext } from "./helpers/find-context";
import { shouldShowLink } from "./helpers/should-show-link";
import { mapLinkConfig } from "./helpers/map-link-config";
import { GroupedLink, groupLinksByLevel } from "./helpers/group-links-by-level";

export type MenuHelperResult = {
  found: boolean;
  links: GroupedLink[][];
};

export const menuConfig = ({ LINKS, CONTEXTS }: Config, { location }: Window): MenuHelperResult => {
  const sanitizedAddress = buildSanitizedAddress(location);

  const { found, contexts, tags } = findContext(CONTEXTS, sanitizedAddress);
  if (!found) {
    return { found, links: undefined };
  }

  const links = LINKS.filter(shouldShowLink(contexts)).map(mapLinkConfig(contexts, tags));
  return { found, links: groupLinksByLevel(links) };
};
