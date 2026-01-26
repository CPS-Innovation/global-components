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
      dcfContextsToUseEventNavigation:
        tags[isDcfCaseKey] === "true" && isContextMatch(contextIds, dcfContextsToUseEventNavigation?.contexts) ? dcfContextsToUseEventNavigation : undefined,
      // FCT2-14105. If...
      //  1) we are a link which needs to know dcf status in order to have the correct destination URL (i.e. we have dcfHref specified in our context) and
      //  2) we do not yet know this status (i.e. we do not have a clear true/false result yet in out dcf tag)
      //  then we disable the link as we do not yet know the legitimate destination address.
      disabled: !!dcfHref && !(tags[isDcfCaseKey] === "true" || tags[isDcfCaseKey] === "false"),
    };
  };

export const mapLinkConfig = withLogging("mapLinkConfig", mapLinkConfigInternal);
