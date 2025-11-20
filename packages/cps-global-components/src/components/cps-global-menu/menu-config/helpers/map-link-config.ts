import { Link } from "cps-global-configuration";
import { isContextMatch } from "./is-context-match";
import { replaceTagsInString } from "./replace-tags-in-string";
import { withLogging } from "../../../../logging/with-logging";

export type MapLinkConfigResult = ReturnType<ReturnType<typeof mapLinkConfig>>;

export type MapLinkConfigParams = { contextIds: string; tags: Record<string, string>; handoverAdapter?: ((targetUrl: string) => string) | undefined };

export const mapLinkConfigInternal =
  ({ contextIds, tags, handoverAdapter }: MapLinkConfigParams) =>
  ({ label, href, level, activeContexts, openInNewTab, preferEventNavigationContexts }: Link) => {
    const processedHref = replaceTagsInString(href, tags);

    return {
      label,
      level,
      openInNewTab,
      href: handoverAdapter ? handoverAdapter(processedHref) : processedHref,
      selected: isContextMatch(contextIds, activeContexts),
      preferEventNavigation: isContextMatch(contextIds, preferEventNavigationContexts),
    };
  };

export const mapLinkConfig = withLogging("mapLinkConfig", mapLinkConfigInternal);
