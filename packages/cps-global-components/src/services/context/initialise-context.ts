import { Config } from "cps-global-configuration";
import { FoundContext } from "./FoundContext";
import { replaceTagsInString } from "../../components/cps-global-menu/menu-config/helpers/replace-tags-in-string";
import { tryLocationMatch } from "./try-location-match";
import { makeConsole } from "../../logging/makeConsole";

type Register = (arg: Record<string, unknown>) => void;
type ResetContextSpecificTags = (context: FoundContext) => void;

const { _debug } = makeConsole("initialiseContext");

export const initialiseContext = ({
  window,
  config: { CONTEXTS },
  register,
  resetContextSpecificTags,
}: {
  window: { location: { href: string }; sessionStorage: Storage; localStorage: Storage };
  config: Pick<Config, "CONTEXTS">;
  register: Register;
  resetContextSpecificTags: ResetContextSpecificTags;
}) => {
  const initialiseContextForContext = (): FoundContext => {
    const { href } = window.location;
    _debug("initialiseContextForContext", href);

    for (let contextIndex = 0; contextIndex < CONTEXTS.length; contextIndex++) {
      const context = CONTEXTS[contextIndex];

      const match = tryLocationMatch(href, context.path);
      if (!match) continue;

      const pathTags = match.groups || {};
      const cmsAuth = (context.cmsAuthFromStorageKey && (sessionStorage.getItem(context.cmsAuthFromStorageKey) || localStorage.getItem(context.cmsAuthFromStorageKey))) || "";

      const result: FoundContext = {
        ...context,
        msalRedirectUrl: replaceTagsInString(context.msalRedirectUrl, pathTags),
        found: true,
        pathTags,
        contextIndex,
        cmsAuth,
        currentHref: href,
      };
      resetContextSpecificTags(result);
      register({ context: result });
      return result;
    }

    const notFound: FoundContext = { found: false };
    resetContextSpecificTags(notFound);
    register({ context: notFound });
    return notFound;
  };

  return { initialiseContextForContext };
};
