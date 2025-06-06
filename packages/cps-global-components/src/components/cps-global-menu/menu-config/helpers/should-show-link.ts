import { Link } from "cps-global-configuration";
import { isContextMatch } from "./is-context-match";

export const shouldShowLink =
  (contexts: string) =>
  ({ visibleContexts }: Link) =>
    !visibleContexts || isContextMatch(contexts, visibleContexts);
