import { shouldShowLink } from "./helpers/should-show-link";
import { mapLinkConfig } from "./helpers/map-link-config";
import { GroupedLink, groupLinksByLevel } from "./helpers/group-links-by-level";
import { isOutSystemsApp } from "../../../services/application-flags/is-outsystems-app";
import { createOutboundUrlDirect } from "cps-global-os-handover";
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
  flags: { isOutSystems, origin },
  config: { OS_HANDOVER_URL, LINKS },
  cmsSessionHint,
  tags,
}: Pick<State, "context" | "config" | "tags" | "flags" | "cmsSessionHint">): MenuConfigResult => {
  if (!context?.found) {
    return { status: "error", error: new Error("No context found for this URL.") };
  }
  const { contextIds } = context;

  const handoverAdapter = isOutSystems
    ? // If we are inside the OutSystems world then we assume we have adequate CMS auth.
      //  This is an assumption which could be challenged.
      undefined
    : // If we are outside of OutSystems and a link is pointing to OutSystems then we need to go
      //  via the auth handover endpoint to ensure OS has CMS auth
      (targetUrl: string) => {
        const shouldGoViaAuthHandover = isOutSystemsApp({ location: { href: targetUrl } }) && OS_HANDOVER_URL;
        if (shouldGoViaAuthHandover) {
          const cookieHandoverUrl =
            (cmsSessionHint.found && cmsSessionHint.result.handoverEndpoint) ||
            // todo: 1) if we have confidence in the session hint always being there we do not need this
            // 2) This is arbitrary, all we can do is fall back to the proxied domain handover end point
            // that we have been served from which might not be true.
            `${origin}/polaris`;
          return createOutboundUrlDirect({ cookieHandoverUrl, handoverUrl: OS_HANDOVER_URL, targetUrl });
        } else {
          return targetUrl;
        }
      };
  const links = LINKS.filter(shouldShowLink(contextIds)).map(mapLinkConfig({ contextIds, tags, handoverAdapter }));
  return { status: "ok", links: groupLinksByLevel(links) };
};

export const menuConfig = withLogging("menuConfig", menuConfigInternal);
