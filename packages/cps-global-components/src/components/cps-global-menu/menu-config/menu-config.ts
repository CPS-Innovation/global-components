import { shouldShowLink } from "./helpers/should-show-link";
import { mapLinkConfig } from "./helpers/map-link-config";
import { GroupedLink, groupLinksByLevel } from "./helpers/group-links-by-level";
import { isOutSystemsApp } from "../../../services/application-flags/is-outsystems-app";
import { createOutboundUrl } from "cps-global-os-handover";
import { withLogging } from "../../../logging/with-logging";
import { KnownState } from "../../../store/store";

export type MenuConfigResult =
  | {
      status: "ok";
      links: GroupedLink[][];
    }
  | {
      status: "error";
      error: Error;
    };

const menuConfigInternal = ({
  context,
  flags: { isOutSystems },
  config: { OS_HANDOVER_URL, LINKS },
  tags: tagsFromDom,
}: Pick<KnownState, "context" | "config" | "tags" | "flags">): MenuConfigResult => {
  if (!context?.found) {
    return { status: "error", error: new Error("No context found for this URL.") };
  }
  const { contexts, tags } = context;

  const handoverAdapter = isOutSystems
    ? // If we are inside the OutSystems world then we assume we have adequate CMS auth.
      //  This is an assumption which could be challenged.
      undefined
    : // If we are outside of OutSystems and a link is pointing to OutSystems then we need to go
      //  via the auth handover endpoint to ensure OS has CMS auth
      (targetUrl: string) => {
        const shouldGoViaAuthHandover = isOutSystemsApp({ location: { href: targetUrl } }) && OS_HANDOVER_URL;
        return shouldGoViaAuthHandover ? createOutboundUrl({ handoverUrl: OS_HANDOVER_URL, targetUrl }) : targetUrl;
      };
  const links = LINKS.filter(shouldShowLink(contexts)).map(mapLinkConfig({ contexts, tags: { ...tagsFromDom, ...tags }, handoverAdapter }));
  return { status: "ok", links: groupLinksByLevel(links) };
};

export const menuConfig = withLogging("menuConfig", menuConfigInternal);
