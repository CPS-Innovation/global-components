import { Link } from "cps-global-configuration";
import { isContextMatch } from "./is-context-match";
import { replaceTagsInString } from "./replace-tags-in-string";

export type MapLinkConfigResult = ReturnType<ReturnType<typeof mapLinkConfig>>;

export const mapLinkConfig =
  (contexts: string, tags: { [key: string]: string }) =>
  ({ label, href, level, activeContexts, openInNewTab, preferEventNavigationContexts }: Link) => ({
    label,
    level,
    openInNewTab,
    href: replaceTagsInString(href, tags),
    selected: isContextMatch(contexts, activeContexts),
    preferEventNavigation: isContextMatch(contexts, preferEventNavigationContexts),
  });
