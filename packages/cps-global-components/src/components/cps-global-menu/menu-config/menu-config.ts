import { shouldShowLink } from "./helpers/should-show-link";
import { mapLinkConfig } from "./helpers/map-link-config";
import { GroupedLink, groupLinksByLevel } from "./helpers/group-links-by-level";
import { isOutSystemsApp } from "../../../services/application-flags/is-outsystems-app";
import { createOutboundUrl, createOutboundUrlDirect } from "cps-global-os-handover";
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

const menuConfigInternal = ({
  context,
  flags: { isOutSystems, isOverrideMode },
  config: { OS_HANDOVER_URL, LINKS, COOKIE_HANDOVER_URL },
  tags,
}: Pick<State, "context" | "config" | "tags" | "flags">): MenuConfigResult => {
  if (!context?.found) {
    return { status: "error", error: new Error("No context found for this URL.") };
  }
  const { contexts } = context;

  const handoverAdapter = isOutSystems
    ? // If we are inside the OutSystems world then we assume we have adequate CMS auth.
      //  This is an assumption which could be challenged.
      undefined
    : // If we are outside of OutSystems and a link is pointing to OutSystems then we need to go
      //  via the auth handover endpoint to ensure OS has CMS auth
      (targetUrl: string) => {
        const shouldGoViaAuthHandover = isOutSystemsApp({ location: { href: targetUrl } }) && OS_HANDOVER_URL && COOKIE_HANDOVER_URL;
        return shouldGoViaAuthHandover
          ? isOverrideMode
            ? createOutboundUrlDirect({ cookieHandoverUrl: COOKIE_HANDOVER_URL, handoverUrl: OS_HANDOVER_URL, targetUrl })
            : createOutboundUrl({ handoverUrl: OS_HANDOVER_URL, targetUrl })
          : targetUrl;
      };
  const links = LINKS.filter(shouldShowLink(contexts)).map(mapLinkConfig({ contexts, tags, handoverAdapter }));
  return { status: "ok", links: groupLinksByLevel(links) };
};

export const menuConfig = withLogging("menuConfig", menuConfigInternal);
