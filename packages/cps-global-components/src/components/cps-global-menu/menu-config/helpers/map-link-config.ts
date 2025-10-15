import { Link } from "cps-global-configuration";
import { isContextMatch } from "./is-context-match";
import { replaceTagsInString } from "./replace-tags-in-string";
import { withLogging } from "../../../../logging/with-logging";

export type MapLinkConfigResult = ReturnType<ReturnType<typeof mapLinkConfig>>;

type MapLinkConfigParams = { contexts: string; tags: Record<string, string>; handoverAdapter?: ((targetUrl: string) => string) | undefined };

export const mapLinkConfigInternal =
  ({ contexts, tags, handoverAdapter }: MapLinkConfigParams) =>
  ({ label, href, level, activeContexts, openInNewTab, preferEventNavigationContexts }: Link) => {
    const processedHref = replaceTagsInString(href, tags);

    return {
      label,
      level,
      openInNewTab,
      href: handoverAdapter ? handoverAdapter(processedHref) : processedHref,
      selected: isContextMatch(contexts, activeContexts),
      preferEventNavigation: isContextMatch(contexts, preferEventNavigationContexts),
    };
  };

export const mapLinkConfig = withLogging("mapLinkConfig", mapLinkConfigInternal);
