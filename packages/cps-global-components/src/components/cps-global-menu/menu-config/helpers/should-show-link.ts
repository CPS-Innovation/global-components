import { Link } from "cps-global-configuration";
import { isContextMatch } from "./is-context-match";

export const shouldShowLink =
  (contextId: string) =>
  ({ visibleContexts }: Link) =>
    isContextMatch(contextId, visibleContexts);
