import { shouldShowLink } from "./helpers/should-show-link";
import { mapLinkConfig } from "./helpers/map-link-config";
import { GroupedLink, groupLinksByLevel } from "./helpers/group-links-by-level";
import { withLogging } from "../../../logging/with-logging";
import { State } from "../../../store/store";

export type MenuConfigResult =
  | {
      status: "ok";
      links: GroupedLink[][];
    }
  | {
      status: "error";
      error: Error;
    };

const menuConfigInternal = ({ context, flags, config, cmsSessionHint, tags }: Pick<State, "context" | "config" | "tags" | "flags" | "cmsSessionHint">): MenuConfigResult => {
  if (!context?.found) {
    return { status: "error", error: new Error("No context found for this URL.") };
  }

  const visibleLinks = config.LINKS.filter(shouldShowLink(context.contextIds));
  const mappedLinks = visibleLinks.map(mapLinkConfig({ context, tags, flags, config, cmsSessionHint }));
  const groupedLinks = groupLinksByLevel(mappedLinks);

  return { status: "ok", links: groupedLinks };
};

export const menuConfig = withLogging("menuConfig", menuConfigInternal);
