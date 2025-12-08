import { Link } from "cps-global-configuration";
import { isContextMatch } from "./is-context-match";
import { replaceTagsInString } from "./replace-tags-in-string";
import { withLogging } from "../../../../logging/with-logging";
import { isDcfCaseKey } from "../../../../services/data/CaseDetails";

export type MapLinkConfigResult = ReturnType<ReturnType<typeof mapLinkConfig>>;

export type MapLinkConfigParams = { contextIds: string; tags: Record<string, string>; handoverAdapter?: ((targetUrl: string) => string) | undefined };

export const mapLinkConfigInternal =
  ({ contextIds, tags, handoverAdapter }: MapLinkConfigParams) =>
  ({ label, href, dcfHref, level, activeContexts, openInNewTab, dcfContextsToUseEventNavigation }: Link) => {
    const shouldUseDcfHref = tags[isDcfCaseKey] === "true" && dcfHref;
    const processedHref = replaceTagsInString(shouldUseDcfHref ? dcfHref : href, tags);

    return {
      label,
      level,
      openInNewTab,
      href: handoverAdapter ? handoverAdapter(processedHref) : processedHref,
      selected: isContextMatch(contextIds, activeContexts),
      dcfContextsToUseEventNavigation: isContextMatch(contextIds, dcfContextsToUseEventNavigation?.contexts) ? dcfContextsToUseEventNavigation : undefined,
    };
  };

export const mapLinkConfig = withLogging("mapLinkConfig", mapLinkConfigInternal);
